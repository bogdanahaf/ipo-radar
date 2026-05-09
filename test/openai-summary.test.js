import test from "node:test";
import assert from "node:assert/strict";
import { buildWeekSkimPrompt } from "../scripts/lib/openai-summary.js";

test("buildWeekSkimPrompt stays compact and lists tickers", () => {
  const prompt = buildWeekSkimPrompt(
    [{ symbol: "ABC", companyName: "Alpha Beta", ipoDate: "2026-05-12", buzzScore: 70, attentionBand: "high" }],
    { weekStart: "2026-05-11", weekEnd: "2026-05-17" }
  );
  assert.match(prompt, /ABC/);
  assert.match(prompt, /Alpha Beta/);
  assert.match(prompt, /No buy\/sell/);
});
