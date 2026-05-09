import { compareYmd } from "./dates.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @returns {Promise<{ pct: number, note?: string } | null>}
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
      return { pct: null, note: "Alpha Vantage rate limit or note" };
    }
    if (json["Error Message"]) {
      return { pct: null, note: "symbol lookup failed" };
    }

    const series = json["Time Series (Daily)"];
    if (!series || typeof series !== "object") {
      return { pct: null, note: "no daily series" };
    }

    const row = series[ymd];
    if (!row) {
      return { pct: null, note: "no bar for listing day" };
    }

    const open = Number(row["1. open"]);
    const close = Number(row["4. close"]);
    if (!Number.isFinite(open) || !Number.isFinite(close) || open === 0) {
      return { pct: null, note: "bad OHLC" };
    }

    const pct = ((close - open) / open) * 100;
    return { pct };
  } catch {
    return { pct: null, note: "request failed" };
  }
}

/**
 * When the prior non-empty daily digest listed names for `prevDigest.ipoDate` and that day is
 * strictly before `currentTargetDate`, fetch day-1 open→close % for each symbol (listing session).
 * @returns {null | { sessionYmd: string, rows: Array<{ symbol: string, pct: number | null, note?: string }> }}
 */
export async function computeDay1FollowUpForAlert(prevDigest, currentTargetDate, env = process.env) {
  if (!prevDigest?.symbols?.length || !currentTargetDate) return null;
  if (compareYmd(prevDigest.ipoDate, currentTargetDate) >= 0) return null;

  const apiKey = String(env.ALPHAVANTAGE_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const rows = [];
  for (const sym of prevDigest.symbols) {
    const result = await fetchDailyOpenClosePct(sym, prevDigest.ipoDate, { apiKey });
    rows.push({
      symbol: sym,
      pct: result?.pct ?? null,
      note: result?.note
    });
    await sleep(400);
  }

  return { sessionYmd: prevDigest.ipoDate, rows };
}
