import { useT } from "../lib/i18n.js";
import { PRESETS } from "../lib/defaults.js";
import { money, percent } from "../lib/format.js";

function NumberField({ name, label, hint, unit, inputs, onChange, step = "any", max }) {
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          max={max}
          step={step}
          value={inputs[name] ?? ""}
          onChange={(e) => onChange(name, e.target.value === "" ? "" : Number(e.target.value))}
        />
        {unit && <span className="input-unit">{unit}</span>}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function Card({ n, title, children }) {
  return (
    <section className="card form-card">
      <h3 className="form-card__title"><span className="step">{n}</span>{title}</h3>
      <div className="form-card__grid">{children}</div>
    </section>
  );
}

export function InputsForm({ inputs, setInputs, currency }) {
  const { t, lang } = useT();
  const set = (name, value) => {
    setInputs((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "fee_pct" || name === "fee_fixed") next.fee_preset = "custom";
      return next;
    });
  };
  const choosePreset = (preset) => {
    setInputs((prev) => {
      const p = PRESETS[preset];
      return p ? { ...prev, fee_preset: preset, fee_pct: p.pct, fee_fixed: p.fixed[currency] }
               : { ...prev, fee_preset: "custom" };
    });
  };
  const common = { inputs, onChange: set };
  const pm = Number(inputs.price_monthly) || 0;
  const pa = Number(inputs.price_annual) || 0;

  return (
    <div className="form-stack">
      <Card n="1" title={t("sec.users")}>
        <NumberField name="users" label={t("users")} step="1" {...common} />
        <NumberField name="growth_pct" label={t("growth")} hint={t("growth.hint")} unit="%" max="100" {...common} />
        <NumberField name="churn_pct" label={t("churn")} hint={t("churn.hint")} unit="%" max="100" {...common} />
      </Card>

      <Card n="2" title={t("sec.price")}>
        <NumberField name="price_monthly" label={t("price_monthly")} unit={currency} {...common} />
        <label className="toggle">
          <input
            type="checkbox"
            checked={Boolean(inputs.annual_enabled)}
            onChange={(e) => set("annual_enabled", e.target.checked)}
          />
          <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
          {t("annual_enabled")}
        </label>
        {inputs.annual_enabled && (
          <>
            <NumberField
              name="price_annual"
              label={t("price_annual")}
              unit={currency}
              hint={pm > 0 && pa > 0 ? t("annual.equiv", {
                value: money(pa / 12, currency, lang),
                discount: percent(1 - pa / 12 / pm, currency, lang, { decimals: 0 }),
              }) : null}
              {...common}
            />
            <NumberField name="annual_share_pct" label={t("annual_share")} unit="%" max="100" {...common} />
            <NumberField name="annual_nonrenew_pct" label={t("annual_nonrenew")} hint={t("annual_nonrenew.hint")} unit="%" max="100" {...common} />
          </>
        )}
      </Card>

      <Card n="3" title={t("sec.fees")}>
        <div className="field field--full">
          <label htmlFor="f-preset">{t("fee_preset")}</label>
          <select id="f-preset" value={inputs.fee_preset ?? "custom"} onChange={(e) => choosePreset(e.target.value)}>
            {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{t(`preset.${k}`)}</option>)}
          </select>
          <p className="hint">{t("preset.hint")}</p>
        </div>
        <NumberField name="fee_pct" label={t("fee_pct")} unit="%" max="100" {...common} />
        <NumberField name="fee_fixed" label={t("fee_fixed")} unit={currency} {...common} />
        <NumberField name="tax_pct" label={t("tax_pct")} hint={t("tax.hint")} unit="%" max="100" {...common} />
      </Card>

      <Card n="4" title={t("sec.costs")}>
        <NumberField name="cost_marketing" label={t("cost_marketing")} unit={currency} {...common} />
        <NumberField name="cost_payroll" label={t("cost_payroll")} unit={currency} {...common} />
        <NumberField name="cost_content" label={t("cost_content")} unit={currency} {...common} />
        <NumberField name="cost_infra" label={t("cost_infra")} unit={currency} {...common} />
        <NumberField name="cost_other" label={t("cost_other")} hint={t("cost_other.hint")} unit={currency} {...common} />
        <NumberField name="cost_variable" label={t("cost_variable")} hint={t("cost_variable.hint")} unit={currency} {...common} />
      </Card>

      <p className="footnote">{t("growth.note")}</p>
    </div>
  );
}
