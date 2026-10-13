// Minimal PostgREST client: the app only calls four RPC functions,
// so it skips @supabase/supabase-js (~280 kB) and uses fetch.
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function rpc(fn, args = {}) {
  try {
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: body ?? { message: res.statusText } };
    return { data: body, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
