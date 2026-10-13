import { useT } from "../lib/i18n.js";
import { money, number, percent, ratio } from "../lib/format.js";

const REPO = "https://github.com/santiagocardonao/olmo-metricas";

function fmt(currency, lang) {
  return {
    m: (v, o) => money(v, currency, lang, o),
    n: (v, o) => number(v, currency, lang, o),
    p: (v, o) => percent(v, currency, lang, o),
    r: (v) => ratio(v, currency, lang),
  };
}

// ── Live panel (sticky aside on desktop, bottom bar on mobile) ──
export function LivePanel({ results, loading, error, currency }) {
  const { t, lang } = useT();
  const f = fmt(currency, lang);
  const r = results;
  return (
    <aside className="live" aria-live="polite">
      <div className="live__head">
        <span className="label">{t("live.title")}</span>
        <span className={`live__dot ${loading ? "is-loading" : ""} ${error ? "is-error" : ""}`} />
      </div>
      {error && <p className="live__error">{t("live.error")}</p>}
      <dl className="live__list">
        <div className="live__item live__item--hero">
          <dt>{t("kpi.mrr")}</dt>
          <dd className="gradient-text">{f.m(r?.revenue.mrr_gross)}</dd>
          <p className="live__sub">{t("kpi.net_of", { value: f.m(r?.revenue.mrr_net) })}</p>
        </div>
        <div className="live__item">
          <dt>{t("kpi.arr")}</dt>
          <dd>{f.m(r?.revenue.arr_runrate_gross, { compact: true })}</dd>
        </div>
        <div className="live__item">
          <dt>{t("kpi.cltv")}</dt>
          <dd>{f.m(r?.cltv.margin)}</dd>
        </div>
        <div className="live__item">
          <dt>{t("kpi.ltv_cac")}</dt>
          <dd className={`tone-${r?.health.ltv_cac}`}>{f.r(r?.acquisition.ltv_cac)}</dd>
        </div>
        <div className="live__item">
          <dt>{t("kpi.profit")}</dt>
          <dd className={r && r.profit.monthly < 0 ? "tone-red" : ""}>{f.m(r?.profit.monthly, { compact: true })}</dd>
        </div>
      </dl>
    </aside>
  );
}

function Stat({ label, value, sub, big, tone }) {
  return (
    <div className={`stat ${big ? "stat--big" : ""}`}>
      <span className="stat__label">{label}</span>
      <span className={`stat__value ${tone ? `tone-${tone}` : ""}`}>{value}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  );
}

function Section({ title, children, className = "" }) {
  return (
    <section className={`card res-card ${className}`}>
      <h3 className="res-card__title">{title}</h3>
      {children}
    </section>
  );
}

// ── Diagnosis ─────────────────────────────────────────────────
function Health({ r, currency, benchmarks }) {
  const { t, lang } = useT();
  const f = fmt(currency, lang);
  const showBench = benchmarks && benchmarks.samples >= 20;
  const rows = [
    { key: "churn", label: t("churn_blended"), value: f.p(r.churn.blended), bench: f.p(benchmarks?.churn) },
    { key: "ltv_cac", label: t("ltv_cac"), value: f.r(r.acquisition.ltv_cac), bench: f.r(benchmarks?.ltv_cac) },
    { key: "payback", label: t("payback"), value: r.acquisition.payback_months == null ? "—" : t("unit.months", { value: f.n(r.acquisition.payback_months, { decimals: 1 }) }) },
    { key: "net_growth", label: t("net_growth"), value: f.p(r.acquisition.net_growth), bench: f.p(benchmarks?.net_growth) },
    { key: "net_margin", label: t("net_margin"), value: f.p(r.profit.net_margin), bench: f.p(benchmarks?.net_margin) },
  ];
  return (
    <section className="card res-card health">
      <h3 className="res-card__title">{t("health.title")}</h3>
      <ul className="health__list">
        {rows.map(({ key, label, value, bench }) => {
          const tone = r.health[key];
          return (
            <li key={key} className="health__row">
              <span className={`badge badge--${tone}`}>{t(`health.${tone}`)}</span>
              <div className="health__body">
                <div className="health__top">
                  <span className="health__label">{label}</span>
                  <span className="health__value">{value}</span>
                </div>
                {tone !== "na" && <p className="health__text">{t(`h.${key}.${tone}`)}</p>}
                {showBench && bench && bench !== "—" && (
                  <p className="health__bench">{t("health.median", { n: benchmarks.samples, value: bench })}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="footnote">{t("health.disclaimer")}</p>
    </section>
  );
}

// ── Chart: net MRR bars vs total costs line ──────────────────
// Round axis steps: 1, 2, 2.5 or 5 × 10^n
function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

function Chart({ projection, currency }) {
  const { t, lang } = useT();
  const data = projection.slice(0, 12);
  const W = 720, H = 220, L = 64, R = 12, T = 12, B = 28;
  const top = Math.max(1, ...data.map((d) => Math.max(d.mrr_net, d.costs)));
  const bottom = Math.min(0, ...data.map((d) => d.mrr_net));
  const step = niceStep((top - bottom) / 4);
  const max = Math.ceil(top / step) * step;
  const min = Math.floor(bottom / step) * step;
  const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const band = (W - L - R) / data.length;
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(v);
  const line = data.map((d, i) => `${i ? "L" : "M"}${L + band * i + band / 2},${y(d.costs)}`).join(" ");

  return (
    <section className="card res-card chart-card">
      <div className="chart-card__head">
        <h3 className="res-card__title">{t("chart.title")}</h3>
        <div className="legend">
          <span><i className="legend__bar" />{t("chart.revenue")}</span>
          <span><i className="legend__line" />{t("chart.costs")}</span>
        </div>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("chart.title")}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#4338CA" />
          </linearGradient>
        </defs>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="chart__grid" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="chart__tick">{money(v, currency, lang, { compact: true, decimals: 0 })}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = L + band * i + band * 0.18;
          const barTop = y(Math.max(d.mrr_net, 0));
          return (
            <g key={d.month}>
              <rect x={x} y={barTop} width={band * 0.64} height={Math.max(0, y(0) - barTop)} rx="5" fill="url(#barGrad)" opacity="0.92" />
              <text x={L + band * i + band / 2} y={H - 10} textAnchor="middle" className="chart__tick">{d.month}</text>
            </g>
          );
        })}
        <path d={line} className="chart__line" />
        {data.map((d, i) => <circle key={i} cx={L + band * i + band / 2} cy={y(d.costs)} r="3.5" className="chart__dot" />)}
      </svg>
      <p className="footnote">{t("chart.caption")}</p>
    </section>
  );
}

function ProjectionTable({ projection, currency }) {
  const { t, lang } = useT();
  const f = fmt(currency, lang);
  return (
    <section className="card res-card table-card">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t("table.month")}</th>
              <th className="num">{t("table.users")}</th>
              <th className="num">{t("table.new")}</th>
              <th className="num">{t("table.churned")}</th>
              <th className="num">{t("table.mrr")}</th>
              <th className="num">{t("table.mrr_net")}</th>
              <th className="num">{t("table.costs")}</th>
              <th className="num">{t("table.profit")}</th>
            </tr>
          </thead>
          <tbody>
            {projection.slice(0, 12).map((d) => (
              <tr key={d.month}>
                <td>{d.month}</td>
                <td className="num">{f.n(d.users)}</td>
                <td className="num">{f.n(d.new_users)}</td>
                <td className="num">{f.n(d.churned)}</td>
                <td className="num">{f.m(d.mrr_gross, { decimals: 0 })}</td>
                <td className="num">{f.m(d.mrr_net, { decimals: 0 })}</td>
                <td className="num">{f.m(d.costs, { decimals: 0 })}</td>
                <td className={`num ${d.profit < 0 ? "tone-red" : ""}`}>{f.m(d.profit, { decimals: 0 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Full results ──────────────────────────────────────────────
export function Results({ results: r, currency, benchmarks }) {
  const { t, lang } = useT();
  if (!r) return null;
  const f = fmt(currency, lang);
  const diff = r.revenue.arr_projected_gross - r.revenue.arr_runrate_gross;
  const months = (v) => t("unit.months", { value: f.n(v, { decimals: 1 }) });
  const be = r.profit.breakeven_month;

  return (
    <div className="results">
      <div className="section-head">
        <h2 className="h1">{t("res.title.1")} <em>{t("res.title.em")}</em> {t("res.title.2")}</h2>
      </div>

      {r.per_user.contribution <= 0 && <div className="alert">{t("alert.negative_contribution")}</div>}

      <div className="kpi-row">
        <Stat big label={t("kpi.mrr")} value={f.m(r.revenue.mrr_gross)} sub={t("kpi.net_of", { value: f.m(r.revenue.mrr_net) })} />
        <Stat big label={t("arr_runrate")} value={f.m(r.revenue.arr_runrate_gross)} sub={`${t("kpi.net")}: ${f.m(r.revenue.arr_runrate_net)}`} />
        <Stat big label={t("arr_projected")} value={f.m(r.revenue.arr_projected_gross)} sub={`${t("kpi.net")}: ${f.m(r.revenue.arr_projected_net)}`} />
        <Stat big label={t("cltv_margin")} value={f.m(r.cltv.margin)} sub={`${t("cltv_gross")}: ${f.m(r.cltv.gross)}`} />
      </div>

      <div className="explain card">
        <h3>{t("arr.explain.title")}</h3>
        <p>{t("arr.explain")}</p>
        {Math.abs(diff) >= 1 && (
          <p className="explain__diff">{t(diff > 0 ? "arr.diff.up" : "arr.diff.down", { value: f.m(Math.abs(diff)) })}</p>
        )}
      </div>

      <div className="res-grid">
        <Section title={t("res.unit")}>
          <dl className="ledger">
            <div><dt>{t("arpu")}</dt><dd>{f.m(r.per_user.arpu)}</dd></div>
            {r.per_user.tax > 0 && <div><dt>− {t("tax")}</dt><dd>{f.m(r.per_user.tax)}</dd></div>}
            <div><dt>− {t("fees")}</dt><dd>{f.m(r.per_user.fees)}</dd></div>
            <div><dt>− {t("variable")}</dt><dd>{f.m(r.per_user.variable)}</dd></div>
            <div className="ledger__total"><dt>{t("contribution")}</dt><dd className={r.per_user.contribution <= 0 ? "tone-red" : ""}>{f.m(r.per_user.contribution)}</dd></div>
          </dl>
          <div className="mini-stats">
            <Stat label={t("churn_blended")} value={f.p(r.churn.blended)} sub={t("churn_blended.hint")} />
            <Stat label={t("lifetime")} value={months(r.churn.lifetime_months)} sub={r.churn.capped ? t("lifetime.capped") : null} />
          </div>
          <p className="footnote">{t("cltv.note")}</p>
        </Section>

        <Section title={t("res.growth")}>
          <div className="mini-stats">
            <Stat label={t("new_users")} value={f.n(r.acquisition.new_users)} />
            <Stat label={t("net_growth")} value={f.p(r.acquisition.net_growth)} tone={r.health.net_growth} />
            <Stat label={t("cac")} value={f.m(r.acquisition.cac)} sub={r.acquisition.cac == null ? t("cac.none") : null} />
            <Stat label={t("ltv_cac")} value={f.r(r.acquisition.ltv_cac)} tone={r.health.ltv_cac} />
            <Stat label={t("payback")} value={r.acquisition.payback_months == null ? "—" : months(r.acquisition.payback_months)} tone={r.health.payback} />
          </div>
        </Section>

        <Section title={t("res.profit")}>
          <dl className="ledger">
            <div><dt>{t("mrr_net")}</dt><dd>{f.m(r.revenue.mrr_net)}</dd></div>
            <div><dt>− {t("variable_costs")}</dt><dd>{f.m(r.profit.variable_costs)}</dd></div>
            <div><dt>− {t("fixed_costs")}</dt><dd>{f.m(r.profit.fixed_costs)}</dd></div>
            <div className="ledger__total"><dt>{t("monthly_profit")}</dt><dd className={r.profit.monthly < 0 ? "tone-red" : ""}>{f.m(r.profit.monthly)}</dd></div>
          </dl>
          <div className="mini-stats">
            <Stat label={t("net_margin")} value={f.p(r.profit.net_margin)} tone={r.health.net_margin} />
            <Stat label={t("breakeven_users")} value={r.profit.breakeven_users == null ? t("breakeven.na") : t("unit.users", { value: f.n(r.profit.breakeven_users) })} />
            <Stat
              label={t("breakeven_month")}
              value={r.profit.breakeven_users == null ? t("breakeven.na")
                : be === 1 ? t("breakeven.now")
                : be == null ? t("breakeven.never")
                : t("unit.month_n", { value: be })}
            />
          </div>
        </Section>

        <Health r={r} currency={currency} benchmarks={benchmarks} />
      </div>

      <div className="print-break" />
      <Chart projection={r.projection} currency={currency} />
      <ProjectionTable projection={r.projection} currency={currency} />

      <section className="assumptions">
        <h3>{t("assume.title")}</h3>
        <ul>
          <li>{t("assume.1")}</li>
          <li>{t("assume.2")}</li>
          <li>{t("assume.3")}</li>
          <li>{t("assume.4")}</li>
        </ul>
        <p className="muted small">{t("assume.engine")} <a href={REPO} target="_blank" rel="noreferrer">github.com/santiagocardonao/olmo-metricas</a></p>
      </section>
    </div>
  );
}

// ── Print-only summary of the inputs ─────────────────────────
export function PrintInputs({ inputs, currency }) {
  const { t, lang } = useT();
  const f = fmt(currency, lang);
  const pct = (v) => `${f.n(v, { decimals: 1 })} %`;
  const rows = [
    [t("users"), f.n(inputs.users)],
    [t("growth"), pct(inputs.growth_pct)],
    [t("churn"), pct(inputs.churn_pct)],
    [t("price_monthly"), f.m(inputs.price_monthly)],
    ...(inputs.annual_enabled ? [
      [t("price_annual"), f.m(inputs.price_annual)],
      [t("annual_share"), pct(inputs.annual_share_pct)],
      [t("annual_nonrenew"), pct(inputs.annual_nonrenew_pct)],
    ] : []),
    [t("fee_pct"), `${pct(inputs.fee_pct)} + ${f.m(inputs.fee_fixed)}`],
    [t("tax_pct"), pct(inputs.tax_pct)],
    [t("cost_marketing"), f.m(inputs.cost_marketing)],
    [t("cost_payroll"), f.m(inputs.cost_payroll)],
    [t("cost_content"), f.m(inputs.cost_content)],
    [t("cost_infra"), f.m(inputs.cost_infra)],
    [t("cost_other"), f.m(inputs.cost_other)],
    [t("cost_variable"), f.m(inputs.cost_variable)],
  ];
  return (
    <section className="print-only print-inputs">
      <h3>{t("print.inputs")}</h3>
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  );
}
