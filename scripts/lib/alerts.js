import { compareYmd } from "./dates.js";

export function hypeThresholdFromEnv() {
  const raw = Number(process.env.IPO_HYPE_THRESHOLD);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 68;
}

export function isHypeIpoEvent(event, threshold = hypeThresholdFromEnv()) {
  if (event.hiddenReason) return false;
  if (event.attentionBand === "high") return true;
  const buzz = Number(event.buzzScore ?? 0);
  return buzz >= threshold;
}

export function selectWeekEvents(events, weekStart, weekEnd) {
  return events
    .filter((event) => !event.hiddenReason && event.ipoDate && event.ipoDate >= weekStart && event.ipoDate <= weekEnd)
    .sort((a, b) => compareYmd(a.ipoDate, b.ipoDate) || (Number(b.buzzScore ?? 0) - Number(a.buzzScore ?? 0)));
}
