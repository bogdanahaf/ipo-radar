const MARKET_TIME_ZONE = "America/New_York";

const list = document.querySelector("#list");
const meta = document.querySelector("#meta");

load();

async function load() {
  try {
    const response = await fetch(`data/ipos.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    render(await response.json());
  } catch (error) {
    meta.textContent = "unavailable";
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function render(payload) {
  const visible = (payload.events ?? []).filter((e) => !e.hiddenReason);
  const hidden = (payload.events ?? []).filter((e) => e.hiddenReason);
  const today = ymdInTimeZone(new Date());
  const updated = payload.generatedAt ? shortTime(payload.generatedAt) : "—";
  meta.textContent = `${visible.length} · ${hidden.length} hidden · ${updated}`;

  const sorted = [...visible].sort(
    (a, b) => (a.ipoDate || "").localeCompare(b.ipoDate || "") || (Number(b.buzzScore ?? 0) - Number(a.buzzScore ?? 0))
  );

  if (!sorted.length) {
    list.innerHTML = `<div class="empty">empty</div>`;
    return;
  }

  const groups = new Map();
  for (const row of sorted) {
    const d = row.ipoDate || "—";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(row);
  }

  list.innerHTML = [...groups.entries()]
    .map(([date, rows]) => {
      const label = date === today ? `${fmt(date)} · today` : fmt(date);
      return `<div class="group">${escapeHtml(label)}</div>${rows.map(rowLine).join("")}`;
    })
    .join("");
}

function rowLine(event) {
  const b = event.attentionBand;
  const buzz =
    event.buzzScore != null && b
      ? `<span class="tag ${b === "high" ? "tag--b" : b === "medium" ? "tag--m" : "tag--l"}">${escapeHtml(
          String(event.buzzScore)
        )}</span>`
      : "";
  return `<div class="row">
    <div class="sym">${escapeHtml(event.symbol || "—")}</div>
    <div class="body">
      <div class="name">${escapeHtml(event.companyName || "")}</div>
      <div class="tags">
        ${event.exchange ? `<span class="tag">${escapeHtml(event.exchange)}</span>` : ""}
        ${event.priceRange ? `<span class="tag">${escapeHtml(event.priceRange)}</span>` : ""}
        ${buzz}
      </div>
    </div>
  </div>`;
}

function ymdInTimeZone(date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

function fmt(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

function shortTime(value) {
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
