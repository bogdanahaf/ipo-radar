export function buildPingMessage({ siteUrl }) {
  const lines = [
    "<b>IPO Radar: Telegram is connected.</b>",
    "",
    "You should receive:",
    "• After the US close — filtered names for the <b>next</b> market day.",
    "• On listing day — about <b>one hour before</b> the regular session opens.",
    "",
    "<i>Buzz scores are heuristic “narrative heat” only, not forecasts of returns or volatility.</i>",
    ""
  ];

  if (siteUrl) {
    lines.push(`<a href="${escapeHtml(siteUrl)}">Open IPO Radar dashboard</a>`);
    lines.push("");
  }

  lines.push("Educational only. Not financial or investment advice.");
  return trimTelegramMessage(lines.join("\n"));
}

export function buildAlertMessage({ type, targetDate, events, siteUrl }) {
  const title =
    type === "today"
      ? `IPO Radar: market opens in about 1 hour (${targetDate})`
      : `IPO Radar: interesting IPOs for next market day (${targetDate})`;

  const lines = [escapeHtml(title), ""];

  if (events.length === 0) {
    lines.push("No interesting IPOs matched the v1 filter.");
  } else {
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

export async function sendTelegramMessage({ token, chatId, text, dryRun = false }) {
  if (dryRun) {
    return { ok: true, dryRun: true, text };
  }

  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  if (!chatId) throw new Error("Missing TELEGRAM_CHAT_ID.");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`Telegram sendMessage failed: ${response.status} ${JSON.stringify(body)}`);
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
