# Formulas

Every number in Olmo Metrics comes from one Postgres function, `public.calculate_metrics(inputs jsonb)`, defined in [`supabase/migrations/20261013000001_metric_studies.sql`](../supabase/migrations/20261013000001_metric_studies.sql). This page documents the math and resolves the default example step by step.

## Inputs

| Key | Meaning | Unit |
|---|---|---|
| `users` | Paying subscribers today (U) | count |
| `growth_pct` | **Gross** monthly growth (g): new users as a % of the active base, before churn | % |
| `churn_pct` | Monthly churn of the monthly plan (cm) | % |
| `price_monthly` | Monthly price (Pm) | money |
| `annual_enabled` | Whether an annual plan exists | bool |
| `price_annual` | Annual plan price, per year (Pa) | money |
| `annual_share_pct` | Share of subscribers on the annual plan (a) | % |
| `annual_nonrenew_pct` | Share of annual subscribers who don't renew (ca) | % |
| `fee_pct`, `fee_fixed` | Payment fee: percentage (f) + fixed per transaction (F) | %, money |
| `tax_pct` | VAT / sales tax **included** in the price (t) | % |
| `cost_marketing` | Marketing and acquisition | money / month |
| `cost_payroll`, `cost_content`, `cost_infra`, `cost_other` | Other fixed costs | money / month |
| `cost_variable` | Variable cost per active user (v) | money / user / month |

Percentages arrive as 0–100 and are divided by 100. If the annual plan is off, `a = 0`.

## Per subscriber, per month

```
ARPU          = (1 − a)·Pm + a·Pa/12
Tax           = ARPU · t / (1 + t)
Fees          = (1 − a)·(Pm·f + F) + a·(Pa·f + F)/12      annual plan: one charge per year
Net revenue   = ARPU − Tax − Fees
Contribution  = Net revenue − v
```

## Churn

```
Annual churn, monthly equivalent = 1 − (1 − ca)^(1/12)
Blended churn (c)                = (1 − a)·cm + a·annual_equivalent
Lifetime (months)                = 1 / c                  capped at 60 when c = 0
```

## Revenue

```
MRR (gross)          = U · ARPU
MRR (net)            = U · Net revenue
ARR run-rate         = MRR × 12                           "if nothing changes"
U_m                  = U · (1 + g − c)^m                  users at the start of month m
ARR 12-month projected = Σ_{m=0..11} U_m · ARPU
```

The annual plan is billed upfront but recognized as 1/12 per month.

## Customer lifetime value

```
CLTV (gross)   = ARPU × Lifetime
CLTV (margin)  = Contribution × Lifetime                  headline figure
```

## Acquisition

```
New users / month = U · g
Net growth        = g − c
CAC               = Marketing / New users                 null if no new users
LTV : CAC         = CLTV (margin) / CAC
Payback (months)  = CAC / Contribution                    null if contribution ≤ 0
```

## Profitability

```
Fixed costs      = Marketing + Payroll + Content + Infra + Other
Monthly profit   = U · Contribution − Fixed costs
Net margin       = Monthly profit / MRR (gross)
Break-even users = ⌈Fixed costs / Contribution⌉
Break-even month = first m (of 24) with U_m · Contribution − Fixed costs ≥ 0
```

## Traffic light (B2C reference ranges)

| Metric | Green | Yellow | Red |
|---|---|---|---|
| Blended churn | ≤ 3 % | ≤ 7 % | > 7 % |
| LTV : CAC | ≥ 3 | ≥ 1 | < 1 |
| Payback | ≤ 6 months | ≤ 12 | > 12 |
| Net monthly growth | ≥ 3 % | ≥ 0 % | < 0 % |
| Net margin | ≥ 15 % | ≥ 0 % | < 0 % |

## Worked example: "Cinemar" (USD)

Inputs: 50,000 users · 7 % gross growth · 5 % churn · $9.99/month · annual plan $99.99 taken by 25 %, 30 % don't renew · Stripe 2.9 % + $0.30 · no tax · marketing $120k, payroll $150k, content $90k, infra $15k, other $10k · $0.80 variable per user.

| Step | Calculation | Result |
|---|---|---|
| ARPU | 0.75 × 9.99 + 0.25 × 99.99 / 12 | **$9.58** |
| Fees | 0.75 × (9.99 × 0.029 + 0.30) + 0.25 × (99.99 × 0.029 + 0.30) / 12 | $0.51 |
| Contribution | 9.58 − 0.51 − 0.80 | **$8.27** |
| Annual churn, monthly eq. | 1 − 0.70^(1/12) | 2.93 % |
| Blended churn | 0.75 × 5 % + 0.25 × 2.93 % | **4.48 %** |
| Lifetime | 1 / 0.0448 | 22.3 months |
| MRR | 50,000 × 9.58 | **$478,781** |
| ARR run-rate | 478,781 × 12 | **$5,745,375** |
| ARR projected | Σ 12 months at +2.52 %/month | **$6,611,725** |
| CLTV (margin) | 8.27 × 22.3 | **$184.44** |
| New users | 50,000 × 7 % | 3,500 |
| CAC | 120,000 / 3,500 | **$34.29** |
| LTV : CAC | 184.44 / 34.29 | **5.4x** |
| Payback | 34.29 / 8.27 | 4.1 months |
| Monthly profit | 50,000 × 8.27 − 385,000 | **$28,334** |
| Break-even | 385,000 / 8.27 | 46,573 users |

Reproduce it in SQL:

```sql
select public.calculate_metrics('{
  "users": 50000, "growth_pct": 7, "churn_pct": 5,
  "price_monthly": 9.99, "annual_enabled": true, "price_annual": 99.99,
  "annual_share_pct": 25, "annual_nonrenew_pct": 30,
  "fee_pct": 2.9, "fee_fixed": 0.3, "tax_pct": 0,
  "cost_marketing": 120000, "cost_payroll": 150000, "cost_content": 90000,
  "cost_infra": 15000, "cost_other": 10000, "cost_variable": 0.8
}') - 'projection';
```

## Projection assumptions

- Price, plan mix, fees, churn and costs stay constant.
- Gross growth is a % of the active base, so new users grow in absolute terms with it while marketing spend stays flat. That makes CAC fall over the projection, which is optimistic; the headline CAC uses today's numbers.
- Figures exclude income tax and depreciation.
