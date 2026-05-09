export function buildPingMessage({ siteUrl }) {
  const lines = [
    "<b>IPO Radar: Telegram is connected.</b>",
    "",
    "You should receive:",
    "• <b>Sunday</b> — week-ahead digest (Mon–Sun calendar window, filtered list + buzz).",
    "• <b>Weekdays after the close</b> — filtered names for the <b>next</b> market day.",
    "• <b>~1h before the open</b> — only if that session has at least one <b>hype</b> IPO (high buzz / band).",
    "",
    "<i>Buzz is narrative sorting only, not odds of “ripping” or volatility.</i>",
    ""
  ];

  if (siteUrl) {
    lines.push(`<a href="${escapeHtml(siteUrl)}">Open IPO Radar dashboard</a>`);
    lines.push("");
  }

  lines.push("Educational only. Not financial or investment advice.");
  return trimTelegramMessage(lines.join("\n"));
}

const MEDIA_SPOTLIGHT_DISPLAY = {
  VERY_ELEVATED: "Very high outlet heat",
  ELEVATED: "Elevated outlet heat",
  TYPICAL: "Typical coverage",
  QUIET: "Quiet coverage"
};

export function formatMediaSpotlightLabel(key) {
  return MEDIA_SPOTLIGHT_DISPLAY[key] ?? key;
}

/** @param {Record<string, { media_spotlight: string, summary: string }>} webNotesBySymbol */
export function buildWeekDigestMessage({ weekStart, weekEnd, events, siteUrl, webNotesBySymbol = {} }) {
  const lines = [
    `<b>IPO Radar: week ahead (${escapeHtml(weekStart)} → ${escapeHtml(weekEnd)})</b>`,
    "",
    "<i>Heuristic buzz only — not performance, liquidity, or “chance to fly” odds.</i>",
    ""
  ];

  if (events.length === 0) {
    lines.push("No filtered IPOs land in this Mon–Sun window.");
  } else {
    const hasWeb = Object.keys(webNotesBySymbol).length > 0;
    if (hasWeb) {
      lines.push(
        "<i>Web read (below each ticker) = fresh outlet interest from search; spotlight is capped so it cannot overshoot the Buzz/100 line above it.</i>",
        ""
      );
    }
    for (const event of events) {
      lines.push(
        `<b>${escapeHtml(event.symbol || "TBD")}</b> · ${escapeHtml(formatWeekIpoDate(event.ipoDate))} · ${escapeHtml(
          event.companyName || "Unknown company"
        )}`
      );
      const bits = [event.exchange, event.priceRange].filter(Boolean);
      if (bits.length) lines.push(escapeHtml(bits.join(" · ")));
      if (event.buzzScore != null && event.attentionBand) {
        const buzzLine = [
          `Buzz ${event.buzzScore}/100 (${event.attentionBand})`,
          event.buzzReasons?.length ? escapeHtml(event.buzzReasons.slice(0, 3).join("; ")) : ""
        ].filter(Boolean);
        lines.push(buzzLine.join(" — "));
      }
      const sym = event.symbol || "";
      const web = sym ? webNotesBySymbol[sym] : null;
      if (web?.summary) {
        const label = formatMediaSpotlightLabel(web.media_spotlight);
        lines.push(`<i>Web: <b>${escapeHtml(label)}</b> — ${escapeHtml(web.summary)}</i>`);
      }
      lines.push("");
    }
  }

  if (siteUrl) {
    lines.push(`<a href="${escapeHtml(siteUrl)}">Dashboard</a>`);
    lines.push("");
  }

  lines.push("Educational only. Not financial or investment advice.");
  return trimTelegramMessage(lines.join("\n"));
}

function formatWeekIpoDate(ymd) {
  if (!ymd) return "TBD";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatListingDayLabel(ymd) {
  return formatWeekIpoDate(ymd);
}

/** @param {Record<string, { media_spotlight: string, summary: string }>} webNotesBySymbol */
export function buildAlertMessage({ type, targetDate, events, siteUrl, webNotesBySymbol = {}, day1FollowUp = null }) {
  const title =
    type === "today"
      ? `IPO Radar: ~1h to open — high-attention IPOs (${targetDate})`
      : `IPO Radar: interesting IPOs for next market day (${targetDate})`;

  const lines = [escapeHtml(title), ""];

  if (day1FollowUp?.rows?.length) {
    lines.push("<b>Prior daily alert — 1st session (close vs open)</b>", "");
    lines.push(
      `<i>Names from the last IPO digest · listing day ${escapeHtml(
        formatListingDayLabel(day1FollowUp.sessionYmd)
      )} · Alpha Vantage daily bar (approximate; not official NBBO).</i>`,
      ""
    );
    for (const row of day1FollowUp.rows) {
      const pctPart =
        row.pct == null || Number.isNaN(row.pct)
          ? "n/a"
          : `${row.pct >= 0 ? "+" : ""}${row.pct.toFixed(2)}%`;
      const notePart = row.note ? ` <i>(${escapeHtml(row.note)})</i>` : "";
      lines.push(`<b>${escapeHtml(row.symbol)}</b> · ${escapeHtml(pctPart)} O→C${notePart}`);
    }
    lines.push("");
  }

  if (events.length === 0) {
    lines.push("No interesting IPOs matched the v1 filter.");
  } else {
    const hasWeb = Object.keys(webNotesBySymbol).length > 0;
    if (hasWeb) {
      lines.push(
        "<i>Web read (below each ticker) = fresh search snapshot for this session; spotlight is capped vs Buzz/100 above it.</i>",
        ""
      );
    }
    for (const event of events) {
      const details = [
        event.exchange,
        event.priceRange,
        event.reasons?.slice(0, 2).join("; ")
      ].filter(Boolean);

      lines.push(
        `<b>${escapeHtml(event.symbol || "TBD")}</b> - ${escapeHtml(event.companyName || "Unknown company")}`
      );
      if (details.length) lines.push(escapeHtml(details.join(" | ")));
      if (event.buzzScore != null && event.attentionBand) {
        const buzzBits = [
          `Buzz ${event.buzzScore}/100 (${event.attentionBand})`,
          event.buzzReasons?.length ? escapeHtml(event.buzzReasons.slice(0, 3).join("; ")) : ""
        ].filter(Boolean);
        lines.push(buzzBits.join(" — "));
        lines.push("<i>Heuristic only, not a performance forecast.</i>");
      }
      const sym = event.symbol || "";
      const web = sym ? webNotesBySymbol[sym] : null;
      if (web?.summary) {
        const label = formatMediaSpotlightLabel(web.media_spotlight);
        lines.push(`<i>Web: <b>${escapeHtml(label)}</b> — ${escapeHtml(web.summary)}</i>`);
      }
      lines.push("");
    }
  }

  if (siteUrl) {
    lines.push(`<a href="${escapeHtml(siteUrl)}">Open IPO Radar dashboard</a>`);
  }

  lines.push("");
  lines.push("Educational only. Not financial or investment advice.");

  return trimTelegramMessage(lines.join("\n"));
}

export function normalizeTelegramChatId(raw) {
  let id = String(raw ?? "").trim();
  if (!id) return "";
  const tme = id.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)/i);
  if (tme && !id.startsWith("@") && !/^-?\d+$/.test(id)) {
    id = `@${tme[1]}`;
  }
  return id;
}

export async function sendTelegramMessage({ token, chatId, text, dryRun = false }) {
  if (dryRun) {
    return { ok: true, dryRun: true, text };
  }

  const cleanToken = String(token ?? "").trim();
  const cleanChatId = normalizeTelegramChatId(chatId);

  if (!cleanToken) throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  if (!cleanChatId) throw new Error("Missing TELEGRAM_CHAT_ID.");

  const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: cleanChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const hint = String(body.description ?? "")
      .toLowerCase()
      .includes("chat not found")
      ? " For channels: set TELEGRAM_CHAT_ID to @YourChannel (public) or the numeric supergroup id (often -100…); add the bot as a channel admin with Post Messages."
      : "";
    throw new Error(`Telegram sendMessage failed: ${response.status} ${JSON.stringify(body)}.${hint}`);
  }

  return body;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function trimTelegramMessage(text) {
  if (text.length <= 4096) return text;
  return `${text.slice(0, 3950)}\n\nMessage truncated. Open the dashboard for the full list.`;
}
