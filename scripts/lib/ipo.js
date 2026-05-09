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

  const enriched = {
    ...event,
    exchange: event.exchange || undefined,
    priceRange: event.priceRange || undefined,
    score,
    reasons,
    hiddenReason
  };

  const buzz = computeBuzzMetrics(enriched, { matchedWatchlist });
  return { ...enriched, ...buzz };
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
  const numbers = numbersFromPriceRange(priceRange);
  if (!numbers?.length) return false;
  return Math.max(...numbers) < 5;
}

function numbersFromPriceRange(priceRange = "") {
  return String(priceRange)
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((value) => Number.isFinite(value));
}

function maxPriceFromRange(priceRange = "") {
  const numbers = numbersFromPriceRange(priceRange);
  if (!numbers?.length) return null;
  return Math.max(...numbers);
}

/**
 * Narrative "heat" from name, exchange, and price band — not volatility or return prediction.
 */
export function computeBuzzMetrics(event, { matchedWatchlist } = {}) {
  const name = (event.companyName ?? "").toLowerCase();
  const exchange = normalizeExchange(event.exchange ?? "");
  const buzzReasons = [];
  let buzzScore = 12;

  if (matchedWatchlist) {
    buzzScore += 26;
    buzzReasons.push(`watchlist: ${matchedWatchlist}`);
  }

  const narrativeGroups = [
    {
      pattern:
        /(\bai\b|artificial intelligence|machine learning|semiconductor|\bchip\b|quantum|robotics|autonomous)/i,
      weight: 22,
      label: "AI / semis / autonomy"
    },
    {
      pattern: /\b(cloud|cyber|fintech|software|platform|saas|data center|infrastructure)\b/i,
      weight: 17,
      label: "software / infra / fintech"
    },
    {
      pattern: /\b(biotech|pharma|therapeutic|clinical|medical device|diagnostic)\b/i,
      weight: 14,
      label: "bio / health"
    },
    {
      pattern: /\b(battery|electric vehicle|\bev\b|space|satellite|carbon capture)\b/i,
      weight: 12,
      label: "mobility / climate / space"
    }
  ];

  let narrativePoints = 0;
  for (const group of narrativeGroups) {
    if (group.pattern.test(name)) {
      narrativePoints += group.weight;
      buzzReasons.push(group.label);
    }
  }
  buzzScore += Math.min(48, narrativePoints);

  if (MAJOR_EXCHANGES.has(exchange)) {
    buzzScore += 8;
    buzzReasons.push("major listing venue");
  }
  if (exchange === "nasdaq") {
    buzzScore += 4;
  }

  const topPrice = maxPriceFromRange(event.priceRange ?? "");
  if (topPrice != null) {
    if (topPrice >= 22) {
      buzzScore += 14;
      buzzReasons.push("higher indicated price band");
    } else if (topPrice >= 15) {
      buzzScore += 8;
      buzzReasons.push("mid price band");
    }
  }

  buzzScore = Math.min(100, Math.round(buzzScore));
  const attentionBand = buzzScore >= 68 ? "high" : buzzScore >= 44 ? "medium" : "low";

  return {
    buzzScore,
    buzzReasons: [...new Set(buzzReasons)].slice(0, 5),
    attentionBand
  };
}
