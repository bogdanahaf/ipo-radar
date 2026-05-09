const MARKET_TIME_ZONE = "America/New_York";

const elements = {
  status: document.querySelector("#status"),
  visibleCount: document.querySelector("#visible-count"),
  hiddenCount: document.querySelector("#hidden-count"),
  updatedAt: document.querySelector("#updated-at"),
  todayTitle: document.querySelector("#today-title"),
  tomorrowTitle: document.querySelector("#tomorrow-title"),
  todayList: document.querySelector("#today-list"),
  tomorrowList: document.querySelector("#tomorrow-list"),
  upcomingList: document.querySelector("#upcoming-list"),
  hiddenList: document.querySelector("#hidden-list")
};

load();

async function load() {
  try {
    const response = await fetch(`data/ipos.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load data: ${response.status}`);
    const payload = await response.json();
    render(payload);
  } catch (error) {
    elements.status.textContent = "Data unavailable";
    elements.status.style.color = "var(--rose)";
    elements.todayList.innerHTML = emptyState(error.message);
  }
}

function render(payload) {
  const events = payload.events ?? [];
  const visible = events.filter((event) => !event.hiddenReason);
  const hidden = events.filter((event) => event.hiddenReason);
  const today = ymdInTimeZone(new Date());
  const tomorrow = nextBusinessDay(today);

  elements.status.textContent = visible.length ? "Live calendar" : "Waiting for data";
  elements.visibleCount.textContent = String(visible.length);
  elements.hiddenCount.textContent = String(hidden.length);
  elements.updatedAt.textContent = payload.generatedAt ? formatDateTime(payload.generatedAt) : "Never";
  elements.todayTitle.textContent = `Today, ${formatDate(today)}`;
  elements.tomorrowTitle.textContent = `Next market day, ${formatDate(tomorrow)}`;

  renderList(elements.todayList, visible.filter((event) => event.ipoDate === today), "No interesting IPOs today.");
  renderList(
    elements.tomorrowList,
    visible.filter((event) => event.ipoDate === tomorrow),
    "No interesting IPOs for the next market day."
  );
  renderList(
    elements.upcomingList,
    visible.filter((event) => event.ipoDate > today).slice(0, 24),
    "No upcoming visible IPOs."
  );
  renderList(elements.hiddenList, hidden.slice(0, 24), "No filtered rows.");
}

function renderList(container, events, emptyText) {
  container.innerHTML = events.length
    ? events.map((event) => renderCard(event)).join("")
    : emptyState(emptyText);
}

function renderCard(event) {
  const hidden = Boolean(event.hiddenReason);
  const reasons = hidden ? [`filtered: ${event.hiddenReason}`] : event.reasons ?? [];

  return `
    <article class="ipo-card">
      <div class="ipo-card__top">
        <div>
          <div class="ticker">${escapeHtml(event.symbol || "TBD")}</div>
          <div class="company">${escapeHtml(event.companyName || "Unknown company")}</div>
        </div>
        <div class="score ${hidden ? "score--hidden" : ""}">${Number(event.score ?? 0)}</div>
      </div>
      <div class="meta">
        ${event.ipoDate ? `<span class="pill">${formatDate(event.ipoDate)}</span>` : ""}
        ${event.exchange ? `<span class="pill">${escapeHtml(event.exchange)}</span>` : ""}
        ${event.priceRange ? `<span class="pill pill--alert">${escapeHtml(event.priceRange)}</span>` : ""}
      </div>
      <p class="reasons">${escapeHtml(reasons.slice(0, 3).join(" | ") || "No scoring details.")}</p>
    </article>
  `;
}

function emptyState(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
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

function nextBusinessDay(ymd) {
  let cursor = addDays(ymd, 1);
  while (isWeekend(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

function addDays(ymd, days) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function isWeekend(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return [0, 6].includes(date.getUTCDay());
}

function formatDate(ymd) {
  if (!ymd) return "Date TBD";
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateTime(value) {
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
