import test from "node:test";
import assert from "node:assert/strict";
import { computeDay1FollowUpForAlert, fetchDailyOpenClosePct } from "../scripts/lib/av-day1.js";

test("fetchDailyOpenClosePct parses open and close", async () => {
  const fetchFn = async () => ({
    json: async () => ({
      "Time Series (Daily)": {
        "2026-05-14": { "1. open": "10.0", "4. close": "11.0" }
      }
    })
  });
  const r = await fetchDailyOpenClosePct("ZZ", "2026-05-14", { apiKey: "k", fetch: fetchFn });
  assert.equal(r.pct, 10);
});

test("computeDay1FollowUpForAlert returns null when prior listing day is not before current", async () => {
  const r = await computeDay1FollowUpForAlert(
    { ipoDate: "2026-05-15", symbols: ["A"] },
    "2026-05-14",
    { ALPHAVANTAGE_API_KEY: "x" }
  );
  assert.equal(r, null);
});

test("computeDay1FollowUpForAlert returns null without API key", async () => {
  const r = await computeDay1FollowUpForAlert({ ipoDate: "2026-05-10", symbols: ["A"] }, "2026-05-15", {});
  assert.equal(r, null);
});
