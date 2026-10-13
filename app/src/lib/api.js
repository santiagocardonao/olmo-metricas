// Every number on screen comes from public.calculate_metrics() in Postgres.
import { useEffect, useRef, useState } from "react";
import { rpc } from "./supabase.js";
import { toEngineInputs } from "./defaults.js";

export function useMetrics(inputs) {
  const [state, setState] = useState({ results: null, loading: true, error: null });
  const requestId = useRef(0);
  const key = JSON.stringify(toEngineInputs(inputs));

  useEffect(() => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      const { data, error } = await rpc("calculate_metrics", { inputs: JSON.parse(key) });
      if (id !== requestId.current) return; // a newer request is in flight
      // keep the last good results on screen while the visitor fixes a value
      setState((s) => ({ results: error ? s.results : data, loading: false, error }));
    }, 220);
    return () => clearTimeout(timer);
  }, [key]);

  return state;
}

export async function createStudy({ inputs, lang, currency, company }) {
  const { data, error } = await rpc("create_study", {
    inputs: toEngineInputs(inputs),
    locale: lang,
    currency,
    company_name: company || null,
  });
  if (error) throw error;
  return data;
}

export async function getStudy(slug) {
  const { data, error } = await rpc("get_study", { slug });
  if (error) throw error;
  return data;
}

export async function attachEmail(slug, email, consent) {
  const { data, error } = await rpc("attach_email", { slug, email, consent });
  if (error) throw error;
  return data;
}

export async function getBenchmarks() {
  const { data, error } = await rpc("get_benchmarks");
  if (error) return null;
  return data;
}
