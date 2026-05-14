import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDay1FollowUpForAlert,
  fetchDailyOpenClosePct,
  pickDailyBarForListingDay
} from "../scripts/lib/av-day1.js";

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
  assert.equal(r.open, 10);
  assert.equal(r.close, 11);
});

test("pickDailyBarForListingDay picks first bar on or after IPO date", () => {
  const series = {
    "2026-05-10": { "1. open": "1", "4. close": "1" },
    "2026-05-13": { "1. open": "20", "4. close": "22" }
  };
  const picked = pickDailyBarForListingDay(series, "2026-05-12");
  assert.equal(picked?.date, "2026-05-13");
  assert.equal(picked?.row["4. close"], "22");
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
