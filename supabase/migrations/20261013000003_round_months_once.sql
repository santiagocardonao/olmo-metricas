-- Months are shown with one decimal: round once, here, so the UI
-- never double-rounds (4.147 → 4.15 → 4.2 instead of 4.1).
create or replace function public.calculate_metrics(inputs jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
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
      'blended', round(churn, 6), 'lifetime_months', round(lifetime, 1), 'capped', capped),
    'revenue', jsonb_build_object(
      'mrr_gross', round(mrr_gross, 2), 'mrr_net', round(mrr_net, 2),
      'arr_runrate_gross', round(mrr_gross * 12, 2), 'arr_runrate_net', round(mrr_net * 12, 2),
      'arr_projected_gross', round(proj_gross, 2), 'arr_projected_net', round(proj_net, 2)),
    'cltv', jsonb_build_object('gross', round(cltv_gross, 2), 'margin', round(cltv_margin, 2)),
    'acquisition', jsonb_build_object(
      'new_users', round(new_users), 'net_growth', round(net_growth, 6),
      'cac', round(cac, 2), 'ltv_cac', round(ltv_cac, 2), 'payback_months', round(payback, 1)),
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
