#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isHypeIpoEvent, selectWeekEvents } from "./lib/alerts.js";
import { nextBusinessDay, upcomingCalendarWeekMonday, weekRangeMondayToSunday, ymdInTimeZone } from "./lib/dates.js";
import {
  markAlertSent,
  readAlertState,
  wasAlertSent,
  writeAlertState
} from "./lib/state.js";
import { buildAlertMessage, buildPingMessage, buildWeekDigestMessage, sendTelegramMessage } from "./lib/telegram.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function main(argv) {
  const args = parseArgs(argv);
  const type = args.type ?? "tomorrow";

  if (type === "ping") {
    const text = buildPingMessage({ siteUrl: process.env.IPO_RADAR_SITE_URL });
    if (args.dryRun) {
      console.log(text);
      process.exit(0);
    }

    await sendTelegramMessage({
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      text
    });
    console.log("Sent IPO Radar Telegram ping.");
    process.exit(0);
  }

  const dataPath = resolve(rootDir, args.data ?? "docs/data/ipos.json");
  const statePath = resolve(rootDir, args.state ?? "docs/data/alert-state.json");
  const now = args.now ? new Date(args.now) : new Date();
  const today = ymdInTimeZone(now);

  if (type === "week") {
    const payload = JSON.parse(await readFile(dataPath, "utf8"));
    const weekStart = args.weekStart ?? upcomingCalendarWeekMonday(today);
    const { weekEnd } = weekRangeMondayToSunday(weekStart);
    const events = selectWeekEvents(payload.events ?? [], weekStart, weekEnd);
    const text = buildWeekDigestMessage({ weekStart, weekEnd, events, siteUrl: process.env.IPO_RADAR_SITE_URL });

    if (args.dryRun) {
      console.log(text);
      process.exit(0);
    }

    if (events.length === 0 && !args.sendEmpty) {
      console.log(`No IPOs in week window ${weekStart}..${weekEnd}; nothing sent.`);
      process.exit(0);
    }

    const state = await readAlertState(statePath);
    if (wasAlertSent(state, "week", weekStart)) {
      console.log(`Week digest for ${weekStart} was already sent; skipping.`);
      process.exit(0);
    }

    await sendTelegramMessage({
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      text
    });

    await writeAlertState(statePath, markAlertSent(state, "week", weekStart, events));
    console.log(`Sent week digest ${weekStart}..${weekEnd} with ${events.length} IPOs.`);
    process.exit(0);
  }

  const targetDate = args.targetDate ?? (type === "today" ? today : nextBusinessDay(today));

  if (!["today", "tomorrow"].includes(type)) {
    throw new Error("--type must be today, tomorrow, week, or ping.");
  }

  const payload = JSON.parse(await readFile(dataPath, "utf8"));
  let events = selectAlertEvents(payload.events ?? [], targetDate);

  if (type === "today") {
    const hypeOnly = events.filter((event) => isHypeIpoEvent(event));
    if (hypeOnly.length === 0) {
      if (args.dryRun) {
        console.log(
          events.length
            ? `Dry run: ${events.length} IPO(s) today but none passed the hype gate; no message would be sent.`
            : "Dry run: no IPOs today; no message would be sent."
        );
        process.exit(0);
      }
      console.log(
        events.length
          ? `No hype-tier IPOs for ${targetDate}; skipping pre-open alert (${events.length} non-hype listing(s) ignored).`
          : `No interesting IPOs for ${type} alert ${targetDate}; nothing sent.`
      );
      process.exit(0);
    }
    events = hypeOnly;
  }

  const text = buildAlertMessage({
    type,
    targetDate,
    events,
    siteUrl: process.env.IPO_RADAR_SITE_URL
  });

  if (args.dryRun) {
    console.log(text);
    process.exit(0);
  }

  if (events.length === 0 && !args.sendEmpty) {
    console.log(`No interesting IPOs for ${type} alert ${targetDate}; nothing sent.`);
    process.exit(0);
  }

  const state = await readAlertState(statePath);
  if (wasAlertSent(state, type, targetDate)) {
    console.log(`Alert ${type}:${targetDate} was already sent; skipping.`);
    process.exit(0);
  }

  await sendTelegramMessage({
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    text
  });

  await writeAlertState(statePath, markAlertSent(state, type, targetDate, events));
  console.log(`Sent ${type} alert for ${targetDate} with ${events.length} IPOs.`);
}

export function selectAlertEvents(events, targetDate) {
  return events
    .filter((event) => !event.hiddenReason && event.ipoDate === targetDate)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--type") parsed.type = argv[++index];
    else if (arg === "--data") parsed.data = argv[++index];
    else if (arg === "--state") parsed.state = argv[++index];
    else if (arg === "--now") parsed.now = argv[++index];
    else if (arg === "--target-date") parsed.targetDate = argv[++index];
    else if (arg === "--week-start") parsed.weekStart = argv[++index];
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--send-empty") parsed.sendEmpty = true;
  }
  return parsed;
}
