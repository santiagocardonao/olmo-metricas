-- ============================================================
-- Olmo Métricas — subscription metrics engine.
--
-- The formulas live here, in SQL: public.calculate_metrics() is a
-- pure function the app calls on every change. Studies are stored
-- anonymously and shared by an unguessable slug. Visitors never
-- touch the table directly; everything goes through functions.
-- See docs/FORMULAS.md for the math with a worked example.
-- ============================================================

create schema if not exists private;

-- ── Table ─────────────────────────────────────────────────
create table public.metric_studies (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  locale        text not null check (locale in ('es', 'en')),
  currency      text not null check (currency in ('USD', 'COP', 'MXN', 'EUR')),
  company_name  text check (char_length(company_name) <= 120),
  inputs        jsonb not null check (octet_length(inputs::text) <= 4096),
  results       jsonb not null,  -- KPI snapshot, computed server-side, for benchmarks
  email         text check (char_length(email) <= 254),
  consent_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index metric_studies_created_at_idx on public.metric_studies (created_at);

alter table public.metric_studies enable row level security;
-- No policies on purpose: anon/authenticated cannot read or write the table.
revoke all on public.metric_studies from anon, authenticated;

-- ── Input normalization ───────────────────────────────────
-- Fills missing keys with 0, rejects non-numbers and out-of-range values.
-- Percentages arrive as 0–100; money in the selected currency.
create function private.metric_inputs(raw jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  spec constant jsonb := '{
    "users": 1000000000,
    "growth_pct": 100, "churn_pct": 100,
    "price_monthly": 1000000000, "price_annual": 1000000000,
    "annual_share_pct": 100, "annual_nonrenew_pct": 100,
    "fee_pct": 100, "fee_fixed": 1000000000, "tax_pct": 100,
    "cost_marketing": 1000000000000, "cost_payroll": 1000000000000,
    "cost_content": 1000000000000, "cost_infra": 1000000000000,
    "cost_other": 1000000000000, "cost_variable": 1000000000
  }';
  k text;
  maxv numeric;
  val jsonb;
  num numeric;
  result jsonb := '{}';
begin
  if raw is null or jsonb_typeof(raw) <> 'object' then
    raise exception 'invalid_input: inputs must be an object' using errcode = '22023';
  end if;

  for k, maxv in select key, value::numeric from jsonb_each_text(spec) loop
    val := raw -> k;
    if val is null or val = 'null'::jsonb then
      num := 0;
    elsif jsonb_typeof(val) <> 'number' then
      raise exception 'invalid_input: % must be a number', k using errcode = '22023';
    else
      num := val::numeric;
    end if;
    if num < 0 or num > maxv then
      raise exception 'invalid_input: % out of range', k using errcode = '22023';
    end if;
    result := result || jsonb_build_object(k, num);
  end loop;

  result := result || jsonb_build_object(
    'annual_enabled', coalesce((raw ->> 'annual_enabled')::boolean, false),
    'users', floor((result ->> 'users')::numeric)
  );
  return result;
end $$;

-- ── Traffic light ─────────────────────────────────────────
create function private.metric_health(val numeric, green numeric, yellow numeric, higher_is_better boolean)
returns text language sql immutable set search_path = '' as $$
  select case
    when val is null then 'na'
    when higher_is_better and val >= green then 'green'
    when higher_is_better and val >= yellow then 'yellow'
    when higher_is_better then 'red'
    when val <= green then 'green'
    when val <= yellow then 'yellow'
    else 'red'
  end
$$;

-- ── The engine ────────────────────────────────────────────
-- security definer only so it can call the private helpers; it reads no tables.
create function public.calculate_metrics(inputs jsonb) returns jsonb
language plpgsql immutable security definer set search_path = '' as $$
declare
  i jsonb := private.metric_inputs(inputs);

  u   numeric := (i ->> 'users')::numeric;
  g   numeric := (i ->> 'growth_pct')::numeric / 100;
  cm  numeric := (i ->> 'churn_pct')::numeric / 100;
  pm  numeric := (i ->> 'price_monthly')::numeric;
  a   numeric := case when (i ->> 'annual_enabled')::boolean
                      then (i ->> 'annual_share_pct')::numeric / 100 else 0 end;
  pa  numeric := (i ->> 'price_annual')::numeric;
  ca  numeric := (i ->> 'annual_nonrenew_pct')::numeric / 100;
  f   numeric := (i ->> 'fee_pct')::numeric / 100;
  ff  numeric := (i ->> 'fee_fixed')::numeric;
  t   numeric := (i ->> 'tax_pct')::numeric / 100;
  v   numeric := (i ->> 'cost_variable')::numeric;
  mkt numeric := (i ->> 'cost_marketing')::numeric;
  fixed numeric := (i ->> 'cost_marketing')::numeric + (i ->> 'cost_payroll')::numeric
                 + (i ->> 'cost_content')::numeric + (i ->> 'cost_infra')::numeric
                 + (i ->> 'cost_other')::numeric;

  lifetime_cap constant numeric := 60;  -- months, used when churn is 0

  arpu numeric; tax numeric; fees numeric; net numeric; contrib numeric;
  churn_annual_eq numeric; churn numeric; lifetime numeric; capped boolean;
  mrr_gross numeric; mrr_net numeric; proj_gross numeric := 0; proj_net numeric := 0;
  cltv_gross numeric; cltv_margin numeric;
  new_users numeric; net_growth numeric; cac numeric; ltv_cac numeric; payback numeric;
  profit numeric; net_margin numeric; breakeven_users numeric; breakeven_month int;
  projection jsonb := '[]';
  um numeric; m int;
begin
  -- Per user, per month
  arpu := (1 - a) * pm + a * pa / 12;
  tax  := case when t > 0 then arpu * t / (1 + t) else 0 end;
  fees := (1 - a) * (pm * f + ff) + a * (pa * f + ff) / 12;  -- annual plan: one charge a year
  net  := arpu - tax - fees;
  contrib := net - v;

  -- Churn: annual non-renewal turned into a monthly equivalent, then blended
  churn_annual_eq := 1 - power(1 - ca, 1.0 / 12);
  churn := (1 - a) * cm + a * churn_annual_eq;
  capped := churn = 0;
  lifetime := case when capped then lifetime_cap else 1 / churn end;

  -- Revenue
  mrr_gross := u * arpu;
  mrr_net   := u * net;

  -- Customer lifetime value
  cltv_gross  := arpu * lifetime;
  cltv_margin := contrib * lifetime;

  -- Acquisition
  new_users  := u * g;
  net_growth := g - churn;
  cac := case when new_users > 0 then mkt / new_users end;
  ltv_cac := case when cac > 0 then cltv_margin / cac end;
  payback := case when cac is not null and contrib > 0 then cac / contrib end;

  -- Profitability
  profit := u * contrib - fixed;
  net_margin := case when mrr_gross > 0 then profit / mrr_gross end;
  breakeven_users := case when contrib > 0 then ceil(fixed / contrib) end;

  -- 24-month projection (the UI shows 12; 24 is used for break-even)
  for m in 0..23 loop
    um := u * power(1 + net_growth, m);
    if m < 12 then
      proj_gross := proj_gross + um * arpu;
      proj_net   := proj_net + um * net;
    end if;
    if breakeven_month is null and um * contrib - fixed >= 0 then
      breakeven_month := m + 1;
    end if;
    projection := projection || jsonb_build_object(
      'month',     m + 1,
      'users',     round(um),
      'new_users', round(um * g),
      'churned',   round(um * churn),
      'mrr_gross', round(um * arpu, 2),
      'mrr_net',   round(um * net, 2),
      'costs',     round(fixed + um * v, 2),
      'profit',    round(um * contrib - fixed, 2)
    );
  end loop;

  return jsonb_build_object(
    'version', 1,
    'per_user', jsonb_build_object(
      'arpu', round(arpu, 4), 'tax', round(tax, 4), 'fees', round(fees, 4),
      'net', round(net, 4), 'variable', round(v, 4), 'contribution', round(contrib, 4)),
    'annual_plan', case when a > 0 then jsonb_build_object(
      'monthly_equivalent', round(pa / 12, 4),
      'discount', case when pm > 0 then round(1 - (pa / 12) / pm, 4) end) end,
    'churn', jsonb_build_object(
      'monthly_plan', round(cm, 6), 'annual_equivalent', round(churn_annual_eq, 6),
      'blended', round(churn, 6), 'lifetime_months', round(lifetime, 2), 'capped', capped),
    'revenue', jsonb_build_object(
      'mrr_gross', round(mrr_gross, 2), 'mrr_net', round(mrr_net, 2),
      'arr_runrate_gross', round(mrr_gross * 12, 2), 'arr_runrate_net', round(mrr_net * 12, 2),
      'arr_projected_gross', round(proj_gross, 2), 'arr_projected_net', round(proj_net, 2)),
    'cltv', jsonb_build_object('gross', round(cltv_gross, 2), 'margin', round(cltv_margin, 2)),
    'acquisition', jsonb_build_object(
      'new_users', round(new_users), 'net_growth', round(net_growth, 6),
      'cac', round(cac, 2), 'ltv_cac', round(ltv_cac, 2), 'payback_months', round(payback, 2)),
    'profit', jsonb_build_object(
      'fixed_costs', round(fixed, 2), 'variable_costs', round(u * v, 2),
      'monthly', round(profit, 2), 'net_margin', round(net_margin, 4),
      'breakeven_users', breakeven_users, 'breakeven_month', breakeven_month),
    'health', jsonb_build_object(
      'churn',      private.metric_health(churn * 100, 3, 7, false),
      'ltv_cac',    private.metric_health(ltv_cac, 3, 1, true),
      'payback',    private.metric_health(payback, 6, 12, false),
      'net_growth', private.metric_health(net_growth * 100, 3, 0, true),
      'net_margin', private.metric_health(net_margin * 100, 15, 0, true)),
    'projection', projection
  );
end $$;

-- ── Save a study ──────────────────────────────────────────
-- Results are recomputed here; the client's numbers are never trusted.
create function public.create_study(
  inputs jsonb, locale text default 'es', currency text default 'USD', company_name text default null
) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  bytes bytea;
  new_slug text := '';
  n int;
begin
  select count(*) into n from public.metric_studies where created_at > now() - interval '1 day';
  if n >= 5000 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  bytes := extensions.gen_random_bytes(12);
  for n in 0..11 loop
    new_slug := new_slug || substr(alphabet, (get_byte(bytes, n) % 62) + 1, 1);
  end loop;

  insert into public.metric_studies (slug, locale, currency, company_name, inputs, results)
  values (new_slug, create_study.locale, create_study.currency, nullif(btrim(create_study.company_name), ''),
          private.metric_inputs(create_study.inputs), public.calculate_metrics(create_study.inputs) - 'projection');
  return new_slug;
end $$;

-- ── Open a shared study ───────────────────────────────────
create function public.get_study(slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', s.slug, 'locale', s.locale, 'currency', s.currency,
    'company_name', s.company_name, 'inputs', s.inputs, 'created_at', s.created_at)
  from public.metric_studies s where s.slug = get_study.slug
$$;

-- ── Optional email, only right after creating the study ───
create function public.attach_email(slug text, email text, consent boolean) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if consent is not true then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(email) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  update public.metric_studies s
     set email = lower(btrim(attach_email.email)), consent_at = now()
   where s.slug = attach_email.slug
     and s.email is null
     and s.created_at > now() - interval '1 hour';
  return found;
end $$;

-- ── Benchmarks across stored studies ──────────────────────
-- Medians of currency-independent KPIs over distinct inputs.
-- The app only shows them once there are enough samples.
create function public.get_benchmarks() returns jsonb
language sql stable security definer set search_path = '' as $$
  with d as (
    select distinct on (md5(inputs::text)) results
    from public.metric_studies
    order by md5(inputs::text), created_at
  )
  select jsonb_build_object(
    'samples',    count(*),
    'churn',      percentile_cont(0.5) within group (order by (results #>> '{churn,blended}')::numeric),
    'net_growth', percentile_cont(0.5) within group (order by (results #>> '{acquisition,net_growth}')::numeric),
    'ltv_cac',    percentile_cont(0.5) within group (order by (results #>> '{acquisition,ltv_cac}')::numeric),
    'net_margin', percentile_cont(0.5) within group (order by (results #>> '{profit,net_margin}')::numeric))
  from d
$$;

-- ── Grants ────────────────────────────────────────────────
revoke execute on function private.metric_inputs(jsonb) from public, anon, authenticated;
revoke execute on function private.metric_health(numeric, numeric, numeric, boolean) from public, anon, authenticated;

revoke execute on function public.calculate_metrics(jsonb) from public;
revoke execute on function public.create_study(jsonb, text, text, text) from public;
revoke execute on function public.get_study(text) from public;
revoke execute on function public.attach_email(text, text, boolean) from public;
revoke execute on function public.get_benchmarks() from public;

grant execute on function public.calculate_metrics(jsonb) to anon, authenticated;
grant execute on function public.create_study(jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_study(text) to anon, authenticated;
grant execute on function public.attach_email(text, text, boolean) to anon, authenticated;
grant execute on function public.get_benchmarks() to anon, authenticated;
