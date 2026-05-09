import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAlphaVantageCsv, splitVisibleAndHidden } from "../scripts/lib/ipo.js";

test("parseAlphaVantageCsv classifies watchlist, SPAC, unit, microcap, and low signal rows", async () => {
  const csv = await readFile(new URL("./fixtures/alpha-vantage-sample.csv", import.meta.url), "utf8");
  const events = parseAlphaVantageCsv(csv, {
    updatedAt: "2026-05-08T00:00:00.000Z",
    watchlist: ["figma"]
  });

  const bySymbol = Object.fromEntries(events.map((event) => [event.symbol, event]));
  assert.equal(bySymbol.FIG.hiddenReason, undefined);
  assert.equal(bySymbol.FIG.score >= 100, true);
  assert.equal(typeof bySymbol.FIG.buzzScore, "number");
  assert.match(bySymbol.FIG.attentionBand, /^(high|medium|low)$/);
  assert.equal(bySymbol.NHIV.hiddenReason, "spac");
  assert.equal(bySymbol.ALOVU.hiddenReason, "unit");
  assert.equal(bySymbol.BIOX.hiddenReason, "microcap");
  assert.equal(bySymbol.OTCX.hiddenReason, "low_signal");
});

test("splitVisibleAndHidden keeps noisy rows available for the site", async () => {
  const csv = await readFile(new URL("./fixtures/alpha-vantage-sample.csv", import.meta.url), "utf8");
  const events = parseAlphaVantageCsv(csv, { watchlist: ["figma"] });
  const { visible, hidden } = splitVisibleAndHidden(events);

  assert.equal(visible.map((event) => event.symbol).includes("MAIR"), true);
  assert.equal(hidden.length, 4);
});
