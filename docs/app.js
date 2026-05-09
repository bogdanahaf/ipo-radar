const MARKET_TIME_ZONE = "America/New_York";

const list = document.querySelector("#list");
const meta = document.querySelector("#meta");

load();

async function load() {
  try {
    const response = await fetch(`data/ipos.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    render(payload);
  } catch (error) {
    meta.textContent = "Data unavailable";
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function render(payload) {
  const events = payload.events ?? [];
  const visible = events.filter((event) => !event.hiddenReason);
  const hidden = events.filter((event) => event.hiddenReason);
  const today = ymdInTimeZone(new Date());

  const updated = payload.generatedAt ? formatShortTime(payload.generatedAt) : "never";
  meta.textContent = `${visible.length} listings · ${hidden.length} filtered · updated ${updated}`;

  const sorted = [...visible].sort(
    (a, b) => (a.ipoDate || "").localeCompare(b.ipoDate || "") || (Number(b.buzzScore ?? 0) - Number(a.buzzScore ?? 0))
  );

  if (!sorted.length) {
    list.innerHTML = `<div class="empty">No visible rows yet.</div>`;
    return;
  }

  const groups = groupByDate(sorted);
  const html = groups
    .map(
      ({ date, rows }) => `
      <div class="group">${escapeHtml(formatGroupLabel(date, today))}</div>
      ${rows.map((row) => renderRow(row)).join("")}`
    )
    .join("");
  list.innerHTML = html;
}

function groupByDate(rows) {
  const map = new Map();
  for (const row of rows) {
    const date = row.ipoDate || "TBD";
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(row);
  }
  return [...map.entries()].map(([date, rows]) => ({ date, rows }));
}

function formatGroupLabel(ymd, todayYmd) {
  if (!ymd || ymd === "TBD") return "Date TBD";
  if (ymd === todayYmd) return `${formatDate(ymd)} · today`;
  return formatDate(ymd);
}

function renderRow(event) {
  const buzzClass =
    event.attentionBand === "high"
      ? "tag--buzz-high"
      : event.attentionBand === "medium"
        ? "tag--buzz-medium"
        : event.attentionBand === "low"
          ? "tag--buzz-low"
          : "";

  const buzzTag =
    event.buzzScore != null && event.attentionBand
      ? `<span class="tag ${buzzClass}">Buzz ${escapeHtml(String(event.buzzScore))} · ${escapeHtml(
          event.attentionBand
        )}</span>`
      : "";

  const buzzNote =
    event.buzzReasons?.length && !event.hiddenReason
      ? `<p class="buzz-line">${escapeHtml(event.buzzReasons.slice(0, 3).join(" · "))}</p>`
      : "";

  return `
    <div class="row">
      <div class="row__left">
        <div class="sym">${escapeHtml(event.symbol || "—")}</div>
        <div class="name">${escapeHtml(event.companyName || "")}</div>
        <div class="row__meta">
          ${event.exchange ? `<span class="tag">${escapeHtml(event.exchange)}</span>` : ""}
          ${event.priceRange ? `<span class="tag tag--price">${escapeHtml(event.priceRange)}</span>` : ""}
          ${buzzTag}
        </div>
        ${buzzNote}
      </div>
      <div class="right">${event.score != null ? escapeHtml(String(event.score)) : ""}</div>
    </div>
  `;
}

function ymdInTimeZone(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatShortTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: MARKET_TIME_ZONE,
    timeZoneName: "short"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
