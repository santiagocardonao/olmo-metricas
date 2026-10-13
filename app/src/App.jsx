import { useEffect, useMemo, useRef, useState } from "react";
import { LangContext, detectLang, makeT, useT } from "./lib/i18n.js";
import { CURRENCIES, EXAMPLE_COMPANY, exampleInputs, sameInputs, matchPreset } from "./lib/defaults.js";
import { useMetrics, createStudy, getStudy, attachEmail, getBenchmarks } from "./lib/api.js";
import { InputsForm } from "./components/InputsForm.jsx";
import { LivePanel, Results, PrintInputs } from "./components/Results.jsx";

const SITE = "https://metricas.olmo.agency";
const REPO = "https://github.com/santiagocardonao/olmo-metricas";

function slugFromPath() {
  const m = window.location.pathname.match(/^\/e\/([0-9A-Za-z]{12})\/?$/);
  return m ? m[1] : null;
}

export default function App() {
  const [lang, setLang] = useState(detectLang);
  const [currency, setCurrency] = useState("USD");
  const [inputs, setInputs] = useState(() => exampleInputs("USD"));
  const [company, setCompany] = useState(EXAMPLE_COMPANY);
  const [shared, setShared] = useState(null); // { slug, notFound }
  const [saved, setSaved] = useState(null);   // { slug, key }
  const [busy, setBusy] = useState(null);     // 'pdf' | 'link'
  const [notice, setNotice] = useState(null);
  const [modalSlug, setModalSlug] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const emailAsked = useRef(false);

  const t = useMemo(() => makeT(lang), [lang]);
  const { results, loading, error } = useMetrics(inputs);
  const stateKey = JSON.stringify({ inputs, currency, company });

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem("olmo-metricas-lang", lang); } catch { /* storage blocked */ }
  }, [lang]);

  useEffect(() => { getBenchmarks().then(setBenchmarks); }, []);

  // Open a shared study from /e/<slug>
  useEffect(() => {
    const slug = slugFromPath();
    if (!slug) return;
    getStudy(slug)
      .then((study) => {
        if (!study) { setShared({ slug, notFound: true }); return; }
        const loaded = { ...study.inputs, fee_preset: matchPreset(study.inputs, study.currency) };
        setCurrency(study.currency);
        setInputs(loaded);
        setCompany(study.company_name ?? "");
        setShared({ slug });
        setSaved({ slug, key: JSON.stringify({ inputs: loaded, currency: study.currency, company: study.company_name ?? "" }) });
      })
      .catch(() => setShared({ slug, notFound: true }));
  }, []);

  const changeCurrency = (next) => {
    // While the visitor is still on the example, show it in local prices.
    if (sameInputs(inputs, exampleInputs(currency))) setInputs(exampleInputs(next));
    setCurrency(next);
  };

  const resetExample = () => {
    setInputs(exampleInputs(currency));
    setCompany(EXAMPLE_COMPANY);
  };

  async function ensureSaved() {
    if (saved && saved.key === stateKey) return saved.slug;
    const slug = await createStudy({ inputs, lang, currency, company });
    setSaved({ slug, key: stateKey });
    window.history.replaceState(null, "", `/e/${slug}`);
    return slug;
  }

  async function exportPdf() {
    setBusy("pdf"); setNotice(null);
    try {
      const slug = await ensureSaved();
      if (!emailAsked.current) { setModalSlug(slug); return; }
      window.print();
    } catch {
      setNotice(t("export.error"));
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    setBusy("link"); setNotice(null);
    try {
      const slug = await ensureSaved();
      await navigator.clipboard.writeText(`${SITE}/e/${slug}`);
      setNotice(t("export.copied"));
    } catch {
      setNotice(t("export.error"));
    } finally {
      setBusy(null);
    }
  }

  const closeModalAndPrint = () => {
    emailAsked.current = true;
    setModalSlug(null);
    setTimeout(() => window.print(), 80);
  };

  const studyUrl = saved ? `${SITE}/e/${saved.slug}` : SITE;
  const today = new Intl.DateTimeFormat(CURRENCIES[currency].locale[lang], { dateStyle: "long" }).format(new Date());

  return (
    <LangContext.Provider value={{ lang, t }}>
      <header className="topbar no-print">
        <a href="/" className="brand">
          <span className="wordmark">olmo</span>
          <span className="brand__product">{t("product")}</span>
        </a>
        <div className="topbar__controls">
          <div className="seg" role="group" aria-label="Language">
            {["es", "en"].map((l) => (
              <button key={l} className={lang === l ? "is-on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
          <label className="sr-only" htmlFor="currency">{t("currency")}</label>
          <select id="currency" className="currency" value={currency} onChange={(e) => changeCurrency(e.target.value)}>
            {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </header>

      {/* Print cover */}
      <section className="print-only print-cover">
        <span className="wordmark wordmark--inverse">olmo</span>
        <p className="print-cover__eyebrow">{t("print.title")}</p>
        <h1>{company || t("print.title")}</h1>
        <p className="print-cover__meta">{t("print.date")}: {today} · {t("print.currency")}: {currency}</p>
      </section>

      <main className="page">
        {shared && (
          <div className="banner no-print">{shared.notFound ? t("shared.notfound") : t("shared.banner")}</div>
        )}

        <section className="hero no-print">
          <span className="pill">{t("hero.eyebrow")}</span>
          <h1 className="display">
            <span className="display__light">{t("hero.title.1")} <em>{t("hero.title.em")}</em></span>
            <span className="gradient-text">{t("hero.title.2")}</span>
          </h1>
          <p className="lead">{t("hero.lead")}</p>
        </section>

        <div className="calc no-print">
          <div className="calc__form">
            <div className="card company-card">
              <div className="field">
                <label htmlFor="company">{t("company")}</label>
                <input id="company" type="text" maxLength={120} placeholder={t("company.ph")} value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="company-card__note">
                <p className="hint">{t("hero.example")}</p>
                <button className="linklike" onClick={resetExample}>{t("reset")}</button>
              </div>
            </div>
            <InputsForm inputs={inputs} setInputs={setInputs} currency={currency} />
          </div>
          <LivePanel results={results} loading={loading} error={error} currency={currency} />
        </div>

        <PrintInputs inputs={inputs} currency={currency} />
        <Results results={results} currency={currency} benchmarks={benchmarks} />

        <section className="export no-print">
          <h2 className="h2">{t("export.title")}</h2>
          <p className="lead">{t("export.lead")}</p>
          <div className="export__actions">
            <button className="btn btn--primary btn--lg" onClick={exportPdf} disabled={!results || busy}>
              {busy === "pdf" ? t("export.saving") : t("export.pdf")}
            </button>
            <button className="btn btn--ghost btn--lg" onClick={copyLink} disabled={!results || busy}>
              {busy === "link" ? t("export.saving") : t("export.link")}
            </button>
          </div>
          {notice && <p className="export__notice" role="status">{notice}</p>}
        </section>

        <div className="print-only print-link">
          <span>{t("print.link")} {studyUrl}</span>
          <span>{t("footer.made")} <span className="wordmark wordmark--sm">olmo</span></span>
        </div>
      </main>

      <footer className="footer no-print">
        <div className="footer__band">
          <h2 className="footer__title">{t("footer.title.1")} <em>{t("footer.title.em")}</em>?</h2>
          <p>{t("footer.lead")}</p>
          <a className="btn btn--white" href="https://olmo.agency" target="_blank" rel="noreferrer">{t("footer.cta")}</a>
        </div>
        <div className="footer__base">
          <span>{t("footer.made")} <a href="https://olmo.agency" className="wordmark wordmark--sm">olmo</a></span>
          <a href={REPO} target="_blank" rel="noreferrer">{t("footer.code")}</a>
        </div>
      </footer>

      {modalSlug && <EmailModal slug={modalSlug} onDone={closeModalAndPrint} />}
    </LangContext.Provider>
  );
}

function EmailModal({ slug, onDone }) {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  async function submit(e) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !consent) { setErr(t("modal.invalid")); return; }
    setSending(true);
    try { await attachEmail(slug, email, consent); } catch { /* never block the download */ }
    onDone();
  }

  return (
    <div className="modal no-print" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e) => e.target === e.currentTarget && onDone()}>
      <form className="modal__card" onSubmit={submit}>
        <h3 id="modal-title" className="h2">{t("modal.title")}</h3>
        <p className="lead">{t("modal.lead")}</p>
        <div className="field">
          <label htmlFor="email">{t("modal.email")}</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t("modal.consent")}</span>
        </label>
        {err && <p className="error">{err}</p>}
        <div className="modal__actions">
          <button type="submit" className="btn btn--primary" disabled={sending}>{t("modal.submit")}</button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>{t("modal.skip")}</button>
        </div>
      </form>
    </div>
  );
}

