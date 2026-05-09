import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAttentionPrompt,
  extractResponsesOutputText,
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
