const DAY_MS = 24 * 60 * 60 * 1000;

export const MARKET_TIME_ZONE = "America/New_York";

export function ymdInTimeZone(date = new Date(), timeZone = MARKET_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseYmd(value) {
  if (!value) return "";
  const trimmed = String(value).trim();

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return toYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return toYmd(Number(slash[3]), Number(slash[1]), Number(slash[2]));

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function addDays(ymd, days) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return date.toISOString().slice(0, 10);
}

export function isWeekend(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function nextBusinessDay(ymd) {
  let cursor = addDays(ymd, 1);
  while (isWeekend(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

export function compareYmd(a, b) {
  return a.localeCompare(b);
}

export function weekdayShortNY(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    weekday: "short"
  }).format(anchor);
}

const DAYS_TO_UPCOMING_MONDAY = { Sun: 1, Mon: 0, Tue: 6, Wed: 5, Thu: 4, Fri: 3, Sat: 2 };

/** Next Mon–Sun block: Monday is the upcoming calendar Monday (on Sunday, that is tomorrow). */
export function upcomingCalendarWeekMonday(todayYmd) {
  const short = weekdayShortNY(todayYmd);
  const delta = DAYS_TO_UPCOMING_MONDAY[short];
  if (delta == null) return todayYmd;
  return addDays(todayYmd, delta);
}

export function weekRangeMondayToSunday(mondayYmd) {
  return { weekStart: mondayYmd, weekEnd: addDays(mondayYmd, 6) };
}

function toYmd(year, month, day) {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}
