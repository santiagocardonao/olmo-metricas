-- calculate_metrics reads no tables: run it with the caller's rights.
-- The private schema is not exposed by the API, so granting its helpers is harmless.
grant execute on function private.metric_inputs(jsonb) to anon, authenticated;
grant execute on function private.metric_health(numeric, numeric, numeric, boolean) to anon, authenticated;
alter function public.calculate_metrics(jsonb) security invoker;
