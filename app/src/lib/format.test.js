import { test } from "node:test";
import assert from "node:assert/strict";
import { money, percent, ratio } from "./format.js";
import { exampleInputs, toEngineInputs, sameInputs } from "./defaults.js";

const clean = (s) => s.replace(/\s/g, " ");

test("money formats per currency", () => {
  assert.equal(clean(money(9.99, "USD", "en")), "$9.99");
  assert.equal(clean(money(34900, "COP", "es")), "$ 34.900");
  assert.equal(money(null, "USD", "en"), "—");
});

test("percent and ratio", () => {
  assert.equal(percent(0.0448, "USD", "en"), "4.5%");
  assert.equal(ratio(5.38, "USD", "en"), "5.4x");
  assert.equal(ratio(null, "USD", "en"), "—");
});

test("example scales by currency with local price points", () => {
  const cop = exampleInputs("COP");
  assert.equal(cop.price_monthly, 34900);
  assert.equal(cop.cost_payroll, 600000000);
  assert.equal(cop.fee_fixed, 1200);
  assert.equal(exampleInputs("USD").price_monthly, 9.99);
});

test("engine inputs drop UI keys and coerce blanks to 0", () => {
  const e = toEngineInputs({ ...exampleInputs(), users: "", fee_preset: "stripe" });
  assert.equal(e.users, 0);
  assert.equal("fee_preset" in e, false);
  assert.ok(sameInputs(exampleInputs(), { ...exampleInputs(), fee_preset: "custom" }));
});
