import test from "node:test";
import assert from "node:assert/strict";
import { nextBusinessDay, parseYmd, ymdInTimeZone } from "../scripts/lib/dates.js";

test("parseYmd accepts ISO and US slash dates", () => {
  assert.equal(parseYmd("2026-05-11"), "2026-05-11");
  assert.equal(parseYmd("5/11/2026"), "2026-05-11");
  assert.equal(parseYmd("not a date"), "");
});

test("nextBusinessDay skips weekends", () => {
  assert.equal(nextBusinessDay("2026-05-08"), "2026-05-11");
  assert.equal(nextBusinessDay("2026-05-11"), "2026-05-12");
});

test("ymdInTimeZone uses New York market date", () => {
  assert.equal(ymdInTimeZone(new Date("2026-05-09T03:00:00.000Z")), "2026-05-08");
});
