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
import { buildAlertMessage, buildPingMessage, buildWeekDigestMessage } from "../scripts/lib/telegram.js";

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
  assert.match(message, /~1h to open/);
  assert.match(message, /Open IPO Radar dashboard/);
  assert.match(message, /Not financial or investment advice/);
});

test("buildAlertMessage includes prior digest day-1 recap block", () => {
  const message = buildAlertMessage({
    type: "tomorrow",
    targetDate: "2026-05-15",
    events: selectAlertEvents(events, "2026-05-11"),
    siteUrl: "https://example.com/ipo-radar/",
    day1FollowUp: {
      sessionYmd: "2026-05-14",
      rows: [
        { symbol: "AAA", pct: 3.25, open: 100, close: 103.25 },
        { symbol: "BBB", pct: null, open: null, close: null, note: "no bar for listing day" }
      ]
    }
  });
  assert.match(message, /Prior daily alert/);
  assert.match(message, /\$100\.00/);
  assert.match(message, /\$103\.25/);
  assert.match(message, /\+3\.25%/);
  assert.match(message, /AAA/);
  assert.match(message, /BBB/);
});

test("buildAlertMessage interleaves listing-day web blurbs", () => {
  const message = buildAlertMessage({
    type: "tomorrow",
    targetDate: "2026-05-12",
    events: selectAlertEvents(events, "2026-05-11"),
    siteUrl: "https://example.com/ipo-radar/",
    webNotesBySymbol: {
      FIG: { media_spotlight: "TYPICAL", summary: "No major new wires since Friday." }
    }
  });
  assert.match(message, /Web read/);
  assert.match(message, /No major new wires/);
});

test("buildWeekDigestMessage lists tickers and disclaimer", () => {
  const message = buildWeekDigestMessage({
    weekStart: "2026-05-11",
    weekEnd: "2026-05-17",
    events: [
      {
        symbol: "FIG",
        companyName: "Future Figma Systems Inc",
        ipoDate: "2026-05-11",
        exchange: "NASDAQ",
        priceRange: "$22 - $25",
        buzzScore: 72,
        attentionBand: "high",
        buzzReasons: ["watchlist: figma"]
      }
    ],
    siteUrl: "https://example.com/ipo-radar/"
  });
  assert.match(message, /week ahead/);
  assert.match(message, /FIG/);
  assert.match(message, /Not financial or investment advice/);
});

test("buildWeekDigestMessage interleaves per-ticker web blurbs", () => {
  const message = buildWeekDigestMessage({
    weekStart: "2026-05-11",
    weekEnd: "2026-05-17",
    events: [
      {
        symbol: "FIG",
        companyName: "Future Figma Systems Inc",
        ipoDate: "2026-05-11",
        exchange: "NASDAQ",
        priceRange: "$22 - $25",
        buzzScore: 72,
        attentionBand: "high",
        buzzReasons: ["watchlist: figma"]
      }
    ],
    siteUrl: "https://example.com/ipo-radar/",
    webNotesBySymbol: {
      FIG: { media_spotlight: "ELEVATED", summary: "Several tech outlets mentioned the filing." }
    }
  });
  assert.match(message, /Web read/);
  assert.match(message, /Several tech outlets/);
  assert.match(message, /FIG[\s\S]*Several tech outlets/);
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
    assert.equal(saved.lastDailyDigest?.ipoDate, "2026-05-11");
    assert.ok(Array.isArray(saved.lastDailyDigest?.symbols));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
