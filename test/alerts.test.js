import test from "node:test";
import assert from "node:assert/strict";
import { isHypeIpoEvent, selectWeekEvents } from "../scripts/lib/alerts.js";

test("isHypeIpoEvent respects attention band and threshold", () => {
  assert.equal(isHypeIpoEvent({ attentionBand: "high", buzzScore: 10 }, 99), true);
  assert.equal(isHypeIpoEvent({ attentionBand: "medium", buzzScore: 90 }, 68), true);
  assert.equal(isHypeIpoEvent({ attentionBand: "medium", buzzScore: 50 }, 68), false);
});

test("selectWeekEvents keeps Mon–Sun window and sorts by date", () => {
  const rows = [
    { symbol: "B", ipoDate: "2026-05-14", buzzScore: 10 },
    { symbol: "A", ipoDate: "2026-05-12", buzzScore: 20, hiddenReason: "spac" },
    { symbol: "C", ipoDate: "2026-05-12", buzzScore: 30 }
  ];
  const picked = selectWeekEvents(rows, "2026-05-11", "2026-05-17");
  assert.deepEqual(
    picked.map((r) => r.symbol),
    ["C", "B"]
  );
});
