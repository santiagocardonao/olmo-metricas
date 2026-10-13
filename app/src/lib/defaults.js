// Example business, payment gateway presets and currency settings.
// Money values are in USD and scaled by CURRENCIES[x].scale, so the
// example stays realistic when the visitor switches currency.

export const CURRENCIES = {
  USD: { scale: 1, decimals: 2, locale: { es: "es-US", en: "en-US" } },
  EUR: { scale: 0.92, decimals: 2, locale: { es: "es-ES", en: "en-IE" } },
  MXN: { scale: 18, decimals: 2, locale: { es: "es-MX", en: "en-US" } },
  COP: { scale: 4000, decimals: 0, locale: { es: "es-CO", en: "en-US" } },
};

const MONEY_KEYS = [
  "price_monthly", "price_annual", "fee_fixed", "cost_marketing", "cost_payroll",
  "cost_content", "cost_infra", "cost_other", "cost_variable",
];

// "Cinemar": a fictional streaming service.
const EXAMPLE_USD = {
  users: 50000,
  growth_pct: 7,
  churn_pct: 5,
  price_monthly: 9.99,
  annual_enabled: true,
  price_annual: 99.99,
  annual_share_pct: 25,
  annual_nonrenew_pct: 30,
  fee_preset: "stripe",
  fee_pct: 2.9,
  fee_fixed: 0.3,
  tax_pct: 0,
  cost_marketing: 120000,
  cost_payroll: 150000,
  cost_content: 90000,
  cost_infra: 15000,
  cost_other: 10000,
  cost_variable: 0.8,
};

export const EXAMPLE_COMPANY = "Cinemar";

// Local price points instead of a straight conversion (9.99 USD → 34.900 COP).
const EXAMPLE_PRICES = {
  USD: { price_monthly: 9.99, price_annual: 99.99 },
  EUR: { price_monthly: 8.99, price_annual: 89.99 },
  MXN: { price_monthly: 179, price_annual: 1790 },
  COP: { price_monthly: 34900, price_annual: 349000 },
};

function roundMoney(value, currency) {
  if (value >= 1000) return Math.round(value / 100) * 100;
  const d = CURRENCIES[currency].decimals;
  if (d === 0) return Math.round(value / 10) * 10;
  if (value >= 10) return Math.round(value);
  // keep psychological prices (9.99) when scaling small amounts
  return Math.round(value * 100) / 100;
}

export function exampleInputs(currency = "USD") {
  const { scale } = CURRENCIES[currency];
  const out = { ...EXAMPLE_USD };
  for (const k of MONEY_KEYS) out[k] = roundMoney(EXAMPLE_USD[k] * scale, currency);
  Object.assign(out, EXAMPLE_PRICES[currency]);
  out.fee_fixed = PRESETS.stripe.fixed[currency];
  return out;
}

// Reference rates. Visitors are told to check their own contract.
export const PRESETS = {
  stripe: { pct: 2.9, fixed: { USD: 0.3, EUR: 0.25, MXN: 3, COP: 1200 } },
  app_store_15: { pct: 15, fixed: { USD: 0, EUR: 0, MXN: 0, COP: 0 } },
  app_store_30: { pct: 30, fixed: { USD: 0, EUR: 0, MXN: 0, COP: 0 } },
  wompi: { pct: 2.65, fixed: { USD: 0.18, EUR: 0.16, MXN: 3.2, COP: 700 } },
  mercado_pago: { pct: 3.49, fixed: { USD: 0.2, EUR: 0.18, MXN: 4, COP: 800 } },
  custom: null,
};

// The keys the database engine understands (fee_preset is UI-only).
export const ENGINE_KEYS = [
  "users", "growth_pct", "churn_pct", "price_monthly", "annual_enabled", "price_annual",
  "annual_share_pct", "annual_nonrenew_pct", "fee_pct", "fee_fixed", "tax_pct",
  "cost_marketing", "cost_payroll", "cost_content", "cost_infra", "cost_other", "cost_variable",
];

export function toEngineInputs(inputs) {
  const out = {};
  for (const k of ENGINE_KEYS) {
    const v = inputs[k];
    if (k === "annual_enabled") out[k] = Boolean(v);
    else out[k] = Number.isFinite(Number(v)) && v !== "" ? Number(v) : 0;
  }
  return out;
}

export function sameInputs(a, b) {
  return JSON.stringify(toEngineInputs(a)) === JSON.stringify(toEngineInputs(b));
}

// Which preset a stored fee matches, so shared studies show it selected.
export function matchPreset(inputs, currency) {
  const hit = Object.entries(PRESETS).find(([, p]) =>
    p && p.pct === Number(inputs.fee_pct) && p.fixed[currency] === Number(inputs.fee_fixed));
  return hit ? hit[0] : "custom";
}
