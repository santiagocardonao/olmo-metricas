import { CURRENCIES } from "./defaults.js";

const DASH = "—";

function localeFor(currency, lang) {
  return CURRENCIES[currency]?.locale[lang] ?? "en-US";
}

export function money(value, currency, lang, { compact = false, decimals } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return DASH;
  const v = Number(value);
  const d = decimals ?? (Math.abs(v) >= 1000 ? 0 : CURRENCIES[currency].decimals);
  return new Intl.NumberFormat(localeFor(currency, lang), {
    style: "currency",
    currency,
    // "$" alone is ambiguous for COP/MXN outside Spanish: show the code
    currencyDisplay: lang === "en" && (currency === "COP" || currency === "MXN") ? "code" : "narrowSymbol",
    notation: compact && Math.abs(v) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: compact && Math.abs(v) >= 10000 ? 1 : d,
    minimumFractionDigits: compact && Math.abs(v) >= 10000 ? 0 : d,
  }).format(v);
}

export function number(value, currency, lang, { decimals = 0 } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return DASH;
  return new Intl.NumberFormat(localeFor(currency, lang), {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(Number(value));
}

// value is a fraction (0.045 → 4,5 %)
export function percent(value, currency, lang, { decimals = 1 } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return DASH;
  return new Intl.NumberFormat(localeFor(currency, lang), {
    style: "percent",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(Number(value));
}

export function ratio(value, currency, lang) {
  if (value == null || !Number.isFinite(Number(value))) return DASH;
  return `${number(value, currency, lang, { decimals: 1 })}x`;
}
