import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAttentionPrompt,
  buildPerTickerWebPrompt,
  clampMediaSpotlight,
  extractResponsesOutputText,
  mediaSpotlightCeilingFromBuzz,
  parsePerTickerWebJson,
  pickTopBuzzEvents
} from "../scripts/lib/openai-summary.js";

test("pickTopBuzzEvents orders by buzz score", () => {
  const rows = [
    { symbol: "A", buzzScore: 10 },
    { symbol: "B", buzzScore: 90 },
    { symbol: "C", buzzScore: 50 }
  ];
  assert.deepEqual(
    pickTopBuzzEvents(rows, 2).map((r) => r.symbol),
    ["B", "C"]
  );
});

test("buildAttentionPrompt lists tickers and constraints", () => {
  const prompt = buildAttentionPrompt(
    [{ symbol: "ZZ", companyName: "Zed Inc", ipoDate: "2026-05-12", buzzScore: 80 }],
    "Week window 2026-05-11..2026-05-17."
  );
  assert.match(prompt, /ZZ/);
  assert.match(prompt, /VERY_ELEVATED/);
});

test("mediaSpotlightCeilingFromBuzz caps low calendar buzz", () => {
  assert.equal(mediaSpotlightCeilingFromBuzz({ buzzScore: 38, attentionBand: "low" }), "ELEVATED");
  assert.equal(mediaSpotlightCeilingFromBuzz({ buzzScore: 72, attentionBand: "high" }), "VERY_ELEVATED");
});

test("clampMediaSpotlight never exceeds ceiling", () => {
  assert.equal(clampMediaSpotlight("VERY_ELEVATED", "ELEVATED"), "ELEVATED");
  assert.equal(clampMediaSpotlight("QUIET", "ELEVATED"), "QUIET");
});

test("parsePerTickerWebJson accepts raw JSON", () => {
  const rows = parsePerTickerWebJson(
    '{"tickers":[{"symbol":"ZZ","media_spotlight":"TYPICAL","summary":"Hello"}]}'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, "ZZ");
});

test("buildPerTickerWebPrompt includes spotlight_ceiling per row", () => {
  const p = buildPerTickerWebPrompt(
    [{ symbol: "CBRS", companyName: "Cerebras", ipoDate: "2026-05-14", buzzScore: 38, attentionBand: "low" }],
    "Week test.",
    "week_ahead",
    300
  );
  assert.match(p, /spotlight_ceiling=ELEVATED/);
  assert.match(p, /CBRS/);
});

test("extractResponsesOutputText reads assistant output_text", () => {
  const body = {
    output: [
      { type: "web_search_call", id: "ws_1" },
      {
        type: "message",
        content: [{ type: "output_text", text: "  hello world  " }]
      }
    ]
  };
  assert.equal(extractResponsesOutputText(body), "hello world");
});
