import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTelegramChatId } from "../scripts/lib/telegram.js";

test("normalizeTelegramChatId trims and maps t.me slugs to @username", () => {
  assert.equal(normalizeTelegramChatId("  @ipo_radar  "), "@ipo_radar");
  assert.equal(normalizeTelegramChatId("https://t.me/ipo_radar"), "@ipo_radar");
  assert.equal(normalizeTelegramChatId("t.me/ipo_radar"), "@ipo_radar");
  assert.equal(normalizeTelegramChatId("-1001234567890"), "-1001234567890");
});
