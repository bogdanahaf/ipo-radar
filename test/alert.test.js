import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectAlertEvents } from "../scripts/send-alert.js";
import {
  getAlertKey,
  markAlertSent,
  readAlertState,
  wasAlertSent,
  writeAlertState
} from "../scripts/lib/state.js";
import { buildAlertMessage, buildPingMessage } from "../scripts/lib/telegram.js";

const events = [
  {
    symbol: "FIG",
    companyName: "Future Figma Systems Inc",
    exchange: "NASDAQ",
    ipoDate: "2026-05-11",
    priceRange: "$22 - $25",
    source: "alpha_vantage",
    score: 125,
    reasons: ["watchlist match: figma", "major exchange: NASDAQ"],
    buzzScore: 72,
    attentionBand: "high",
    buzzReasons: ["watchlist: figma", "major listing venue"],
    updatedAt: "2026-05-08T00:00:00.000Z"
  },
  {
    symbol: "NHIV",
    companyName: "NewHold Investment Corp IV",
    exchange: "NASDAQ",
    ipoDate: "2026-05-11",
    source: "alpha_vantage",
    score: 55,
    reasons: ["major exchange: NASDAQ"],
    hiddenReason: "spac",
    updatedAt: "2026-05-08T00:00:00.000Z"
  }
];

test("selectAlertEvents returns only visible events for target date", () => {
  assert.deepEqual(selectAlertEvents(events, "2026-05-11").map((event) => event.symbol), ["FIG"]);
  assert.deepEqual(selectAlertEvents(events, "2026-05-12"), []);
});

test("buildAlertMessage includes ticker, site, and disclaimer", () => {
  const message = buildAlertMessage({
    type: "today",
    targetDate: "2026-05-11",
    events: selectAlertEvents(events, "2026-05-11"),
    siteUrl: "https://example.com/ipo-radar/"
  });

  assert.match(message, /FIG/);
  assert.match(message, /Buzz 72\/100 \(high\)/);
  assert.match(message, /Open IPO Radar dashboard/);
  assert.match(message, /Not financial or investment advice/);
});

test("buildPingMessage includes dashboard link and disclaimer", () => {
  const message = buildPingMessage({ siteUrl: "https://example.com/ipo-radar/" });
  assert.match(message, /Telegram is connected/);
  assert.match(message, /ipo-radar/);
  assert.match(message, /Not financial or investment advice/);
});

test("alert state prevents duplicate sends", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ipo-radar-"));
  const statePath = join(dir, "state.json");

  try {
    let state = await readAlertState(statePath);
    assert.equal(wasAlertSent(state, "tomorrow", "2026-05-11"), false);
    state = markAlertSent(state, "tomorrow", "2026-05-11", events, "2026-05-08T20:30:00.000Z");
    await writeAlertState(statePath, state);

    const saved = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(getAlertKey("tomorrow", "2026-05-11") in saved.sent, true);
    assert.equal(wasAlertSent(saved, "tomorrow", "2026-05-11"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
