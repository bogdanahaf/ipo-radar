import { csvToObjects } from "./csv.js";
import { compareYmd, parseYmd } from "./dates.js";

const DEFAULT_WATCHLIST = [
  "stripe",
  "databricks",
  "figma",
  "canva",
  "chime",
  "klarna",
  "discord",
  "shein",
  "bytedance",
  "anthropic",
  "perplexity",
  "plaid",
  "brex",
  "navan",
  "rippling",
  "airtable",
  "notion",
  "stubhub"
];

const SPAC_PATTERN =
  /\b(acquisition|blank check|special purpose|spac|capital corp|investment corp|holdings corp|ventures corp)\b/i;

const MAJOR_EXCHANGES = new Set(["nasdaq", "nyse", "nyseamerican", "nysearca"]);

export function parseAlphaVantageCsv(text, options = {}) {
  const rows = csvToObjects(text);
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  return rows
    .map((row) => normalizeAlphaVantageRow(row, { ...options, updatedAt }))
    .filter(Boolean)
    .sort(sortEvents);
}

export function normalizeAlphaVantageRow(row, options = {}) {
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const symbol = firstValue(row, ["symbol", "ticker"]).toUpperCase();
  const companyName = firstValue(row, ["name", "company", "companyname"]);
  const exchange = firstValue(row, ["exchange", "market"]);
  const ipoDate = parseYmd(firstValue(row, ["ipodate", "date", "pricedate", "expecteddate"]));
  const priceRange = buildPriceRange(row);

  if (!symbol && !companyName) return null;

  const baseEvent = {
    symbol,
    companyName,
    exchange,
    ipoDate,
    priceRange,
    source: "alpha_vantage",
    score: 0,
    reasons: [],
    updatedAt
  };

  return classifyIpoEvent(baseEvent, options);
}

export function classifyIpoEvent(event, options = {}) {
  const watchlist = getWatchlist(options.watchlist);
  const reasons = [];
  let score = 0;
  let hiddenReason;

  const symbol = event.symbol ?? "";
  const name = event.companyName ?? "";
  const exchange = normalizeExchange(event.exchange);
  const matchedWatchlist = watchlist.find((term) => name.toLowerCase().includes(term));

  if (!event.ipoDate) {
    hiddenReason = "missing_date";
  } else {
    score += 20;
    reasons.push("has scheduled IPO date");
  }

  if (matchedWatchlist) {
    score += 70;
    reasons.push(`watchlist match: ${matchedWatchlist}`);
  }

  if (MAJOR_EXCHANGES.has(exchange)) {
    score += 25;
    reasons.push(`major exchange: ${event.exchange}`);
  }

  if (event.priceRange) {
    score += 10;
    reasons.push(`price range: ${event.priceRange}`);
  }

  if (looksLikeUnit(symbol, name)) {
    hiddenReason = "unit";
  } else if (looksLikeSpac(name)) {
    hiddenReason = "spac";
  } else if (looksLikeMicrocap(event.priceRange)) {
    hiddenReason = "microcap";
  } else if (!hiddenReason && score < 40) {
    hiddenReason = "low_signal";
  }

  return {
    ...event,
    exchange: event.exchange || undefined,
    priceRange: event.priceRange || undefined,
    score,
    reasons,
    hiddenReason
  };
}

export function splitVisibleAndHidden(events) {
  const visible = events.filter((event) => !event.hiddenReason);
  const hidden = events.filter((event) => event.hiddenReason);
  return { visible, hidden };
}

export function sortEvents(a, b) {
  const byDate = compareYmd(a.ipoDate || "9999-99-99", b.ipoDate || "9999-99-99");
  if (byDate !== 0) return byDate;
  if (b.score !== a.score) return b.score - a.score;
  return (a.symbol || a.companyName).localeCompare(b.symbol || b.companyName);
}

export function createIpoPayload(events, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const { visible, hidden } = splitVisibleAndHidden(events);

  return {
    generatedAt,
    source: {
      name: "Alpha Vantage IPO_CALENDAR",
      url: "https://www.alphavantage.co/documentation/#ipo-calendar"
    },
    counts: {
      total: events.length,
      visible: visible.length,
      hidden: hidden.length
    },
    events
  };
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row[key]) return row[key].trim();
  }
  return "";
}

function buildPriceRange(row) {
  const direct = firstValue(row, ["pricerange", "price", "expectedprice"]);
  if (direct) return direct;

  const low = firstValue(row, ["pricerangelow", "low", "pricefrom"]);
  const high = firstValue(row, ["pricerangehigh", "high", "priceto"]);
  const currency = firstValue(row, ["currency"]);

  if (!low && !high) return "";
  if (low && high && low !== high) return `${formatMoney(low, currency)} - ${formatMoney(high, currency)}`;
  return formatMoney(low || high, currency);
}

function formatMoney(value, currency) {
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned) return String(value);
  const prefix = currency && currency.toUpperCase() !== "USD" ? `${currency.toUpperCase()} ` : "$";
  return `${prefix}${cleaned}`;
}

function getWatchlist(watchlist) {
  const source =
    watchlist ??
    process.env.IPO_WATCHLIST?.split(",") ??
    DEFAULT_WATCHLIST;

  return source.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

function normalizeExchange(exchange = "") {
  return exchange.toLowerCase().replace(/[^a-z]/g, "");
}

function looksLikeSpac(name = "") {
  return SPAC_PATTERN.test(name);
}

function looksLikeUnit(symbol = "", name = "") {
  const cleanSymbol = symbol.toUpperCase();
  if (/[.-](U|WS|W|RT|R)$/.test(cleanSymbol)) return true;
  if (/U$/.test(cleanSymbol) && cleanSymbol.length >= 5 && looksLikeSpac(name)) return true;
  return false;
}

function looksLikeMicrocap(priceRange = "") {
  const numbers = String(priceRange)
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((value) => Number.isFinite(value));

  if (!numbers?.length) return false;
  return Math.max(...numbers) < 5;
}
