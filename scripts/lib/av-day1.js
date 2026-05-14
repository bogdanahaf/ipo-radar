import { addDays, compareYmd } from "./dates.js";

/** Free-tier safe spacing between TIME_SERIES_DAILY calls (5/min). */
function timeSeriesDelayMs(env = process.env) {
  const raw = Number(env.IPO_AV_TIME_SERIES_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 13_000;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * First daily bar on or after IPO calendar date (within a few days), else exact-only miss.
 * @param {Record<string, Record<string, string>>} series
 */
export function pickDailyBarForListingDay(series, ipoYmd) {
  if (!series || typeof series !== "object" || !ipoYmd) return null;
  if (series[ipoYmd]) return { date: ipoYmd, row: series[ipoYmd] };
  const keys = Object.keys(series).sort();
  const upper = addDays(ipoYmd, 6);
  for (const k of keys) {
    if (compareYmd(k, ipoYmd) >= 0 && compareYmd(k, upper) <= 0) {
      return { date: k, row: series[k] };
    }
  }
  return null;
}

/**
 * @returns {Promise<{ pct: number | null, open: number | null, close: number | null, barDate?: string, note?: string } | null>}
 */
export async function fetchDailyOpenClosePct(symbol, ymd, options = {}) {
  const apiKey = String(options.apiKey ?? "").trim();
  const fetchFn = options.fetch ?? globalThis.fetch;
  if (!apiKey || !symbol || !ymd) return null;

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "TIME_SERIES_DAILY");
  url.searchParams.set("symbol", String(symbol).trim());
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("apikey", apiKey);

  try {
    const response = await fetchFn(url.toString(), { signal: options.signal });
    const json = await response.json().catch(() => ({}));

    if (json.Note || json.Information) {
      return { pct: null, open: null, close: null, note: "Alpha Vantage rate limit or quota note" };
    }
    if (json["Error Message"]) {
      return { pct: null, open: null, close: null, note: "symbol lookup failed" };
    }

    const series = json["Time Series (Daily)"];
    if (!series || typeof series !== "object") {
      return { pct: null, open: null, close: null, note: "no daily series" };
    }

    const picked = pickDailyBarForListingDay(series, ymd);
    if (!picked) {
      return { pct: null, open: null, close: null, note: "no bar for listing day" };
    }

    const open = Number(picked.row["1. open"]);
    const close = Number(picked.row["4. close"]);
    if (!Number.isFinite(open) || !Number.isFinite(close) || open === 0) {
      return { pct: null, open: null, close: null, note: "bad OHLC" };
    }

    const pct = ((close - open) / open) * 100;
    const dateNote = picked.date !== ymd ? ` (bar date ${picked.date})` : "";
    return {
      open,
      close,
      pct,
      barDate: picked.date,
      note: dateNote ? dateNote.trim() : undefined
    };
  } catch {
    return { pct: null, open: null, close: null, note: "request failed" };
  }
}

/**
 * When the prior non-empty daily digest listed names for `prevDigest.ipoDate` and that day is
 * strictly before `currentTargetDate`, fetch day-1 open→close for each symbol (listing session).
 * @returns {null | { sessionYmd: string, rows: Array<{ symbol: string, pct: number | null, open: number | null, close: number | null, note?: string }> }}
 */
export async function computeDay1FollowUpForAlert(prevDigest, currentTargetDate, env = process.env) {
  if (!prevDigest?.symbols?.length || !currentTargetDate) return null;
  if (compareYmd(prevDigest.ipoDate, currentTargetDate) >= 0) return null;

  const apiKey = String(env.ALPHAVANTAGE_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const delay = timeSeriesDelayMs(env);
  const rows = [];
  for (let i = 0; i < prevDigest.symbols.length; i += 1) {
    const sym = prevDigest.symbols[i];
    if (i > 0 && delay > 0) await sleep(delay);
    const result = await fetchDailyOpenClosePct(sym, prevDigest.ipoDate, { apiKey });
    rows.push({
      symbol: sym,
      pct: result?.pct ?? null,
      open: result?.open ?? null,
      close: result?.close ?? null,
      note: result?.note
    });
  }

  return { sessionYmd: prevDigest.ipoDate, rows };
}
