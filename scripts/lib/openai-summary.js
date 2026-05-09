/**
 * Optional OpenAI blurbs for Telegram digests.
 * Uses the Responses API + hosted web_search when enabled; otherwise a light Chat Completions fallback.
 * Week digests use structured per-ticker JSON (web outlet heat, capped vs calendar Buzz). Today/tomorrow use a short paragraph.
 */

export function pickTopBuzzEvents(events, limit = 8) {
  return [...events]
    .sort(
      (a, b) =>
        Number(b.buzzScore ?? 0) - Number(a.buzzScore ?? 0) ||
        (a.symbol || "").localeCompare(b.symbol || "")
    )
    .slice(0, Math.max(1, limit));
}

export function buildAttentionPrompt(events, contextLine) {
  const slice = pickTopBuzzEvents(events, 8);
  const lines = slice
    .map((e) => `${e.symbol ?? "TBD"} — ${e.companyName ?? ""} (IPO ${e.ipoDate ?? "?"}, buzz ${e.buzzScore ?? "n/a"})`)
    .join("\n");

  return `${contextLine}

You are helping a retail reader skim a FILTERED US IPO calendar (obvious SPAC/unit junk is already removed upstream — do not waste space on blank-check vehicles).

Symbols to research with web_search (prioritize fresh English-language business / finance / tech wires and major newspapers):
${lines}

Use the web_search tool. Summarize what is *actually* being covered in reputable outlets lately (if coverage is thin, say so plainly).

Return ONE dense paragraph in English (aim under ~900 characters; hard cap 2200 characters):
- Which names have clearly outsized mainstream attention vs quiet retail listings.
- For the top 1–3 attention names only, assign a qualitative **day-one attention / two-way volatility risk bucket**: pick exactly one label per name from **VERY_ELEVATED**, **ELEVATED**, **TYPICAL**, **QUIET** — these describe expected media/social heat and how wild the *session* might feel, **not** predicted direction or magnitude of returns.
- **Forbidden:** numeric percentages, "probability of doubling", buy/sell, price targets, legal advice, or claiming insider knowledge.

End with: "(Heuristic narrative only, not investment advice.)"`;
}

export function extractResponsesOutputText(body) {
  const output = body?.output;
  if (!Array.isArray(output)) return "";

  for (let i = output.length - 1; i >= 0; i -= 1) {
    const item = output[i];
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
          return part.text.trim();
        }
      }
    }
  }
  return "";
}

export function flattenMarkdownLinks(text) {
  return String(text).replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)");
}

export function trimForTelegram(text, max = 3200) {
  const t = collapseWhitespace(text);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 20)}…`;
}

export function webSearchEnabled(env = process.env) {
  return String(env.OPENAI_WEB_SEARCH ?? "true").toLowerCase() !== "false";
}

export function responsesModelFromEnv(env = process.env) {
  const m = String(env.OPENAI_RESPONSES_MODEL ?? "").trim();
  return m || "gpt-4o";
}

/** Monotonic media-spotlight labels (web outlet heat), capped vs calendar Buzz. */
export const MEDIA_SPOTLIGHT_LEVELS = ["QUIET", "TYPICAL", "ELEVATED", "VERY_ELEVATED"];

export function mediaSpotlightCeilingFromBuzz(event) {
  const buzz = Number(event.buzzScore ?? 0);
  const band = String(event.attentionBand || "").toLowerCase();
  if (band === "high" || buzz >= 55) return "VERY_ELEVATED";
  if (band === "medium" || buzz >= 32) return "ELEVATED";
  if (buzz >= 18) return "TYPICAL";
  return "QUIET";
}

export function normalizeMediaSpotlight(raw) {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return MEDIA_SPOTLIGHT_LEVELS.includes(u) ? u : "TYPICAL";
}

export function clampMediaSpotlight(value, ceiling) {
  const v = normalizeMediaSpotlight(value);
  const c = normalizeMediaSpotlight(ceiling);
  const vi = MEDIA_SPOTLIGHT_LEVELS.indexOf(v);
  const ci = MEDIA_SPOTLIGHT_LEVELS.indexOf(c);
  if (ci < 0) return v;
  if (vi < 0) return "TYPICAL";
  return MEDIA_SPOTLIGHT_LEVELS[Math.min(vi, ci)];
}

/**
 * @param {"week_ahead" | "listing_session"} promptMode
 */
export function buildPerTickerWebPrompt(events, contextLine, promptMode = "week_ahead", summaryMax = 300) {
  const rows = events
    .map((e) => {
      const ceiling = mediaSpotlightCeilingFromBuzz(e);
      return `${e.symbol ?? "TBD"} — ${e.companyName ?? ""} (IPO ${e.ipoDate ?? "?"}; Buzz ${e.buzzScore ?? "n/a"}/100, band ${
        e.attentionBand ?? "n/a"
      }); spotlight_ceiling=${ceiling}`;
    })
    .join("\n");

  const modeHint =
    promptMode === "week_ahead"
      ? "This is a **week-ahead** digest: give a slightly richer read per name (still not investment advice) — latest reputable wires, pricing/allocation/greenshoe or valuation chatter **only if clearly sourced**; if thin coverage, say so."
      : "This is a **listing-session** alert: prioritize **fresh wires** since prior digest (overnight / weekend), IPO-day pricing or allocation color **only if outlets report it**; if nothing new, say that plainly.";

  return `${contextLine}

${modeHint}

Filtered US IPO list (order matters). For EACH row use web_search as needed.

Return ONLY valid JSON (no markdown code fences, no commentary before or after) with this exact shape:
{"tickers":[{"symbol":"STRING","media_spotlight":"QUIET|TYPICAL|ELEVATED|VERY_ELEVATED","summary":"tight English; no buy/sell; no numeric % return forecasts; cite outlets as plain names (Reuters), not URLs"}]}

Rules:
- Include exactly one ticker object per row below, in the SAME ORDER, same symbols.
- media_spotlight MUST NOT exceed that row's spotlight_ceiling (QUIET ≤ TYPICAL ≤ ELEVATED ≤ VERY_ELEVATED).
- If search finds little reputable coverage, use QUIET or TYPICAL and say so plainly.
- Keep each summary under ~${summaryMax} characters.

Rows:
${rows}`;
}

/** @deprecated use buildPerTickerWebPrompt */
export function buildWeekPerTickerWebPrompt(events, contextLine) {
  return buildPerTickerWebPrompt(events, contextLine, "week_ahead", 300);
}

export function parsePerTickerWebJson(text) {
  let cleaned = String(text ?? "").trim();
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) cleaned = fence[1].trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);

  try {
    const data = JSON.parse(cleaned);
    if (!data || !Array.isArray(data.tickers)) return null;
    return data.tickers;
  } catch {
    return null;
  }
}

function trimTickerSummary(text, max = 240) {
  const t = collapseWhitespace(flattenMarkdownLinks(String(text ?? "")));
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export async function fetchOpenAiPerTickerWebNotes(events, options = {}) {
  const env = options.env ?? process.env;
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey || !events.length) return {};

  const promptMode = options.promptMode ?? "week_ahead";
  const summaryMax =
    typeof options.summaryMax === "number" && Number.isFinite(options.summaryMax)
      ? options.summaryMax
      : promptMode === "week_ahead"
        ? 340
        : 280;

  const weekStart = options.weekStart ?? "";
  const weekEnd = options.weekEnd ?? "";
  const contextLine =
    String(options.contextLine ?? "").trim() ||
    `Week window ${weekStart}..${weekEnd}.`;

  const slice = events.slice(0, 12);
  const prompt = buildPerTickerWebPrompt(slice, contextLine, promptMode, summaryMax);

  let rawText = "";
  if (webSearchEnabled(env)) {
    rawText = await callResponsesWithWebSearch({
      apiKey,
      model: responsesModelFromEnv(env),
      input: prompt,
      timeoutMs: 120_000
    });
  }
  if (!rawText) {
    rawText = await chatCompletionsFallbackJson({ apiKey, env, prompt });
  }

  const rows = parsePerTickerWebJson(rawText);
  if (!rows?.length) return {};

  const bySymbol = new Map();
  for (const row of rows) {
    const sym = String(row?.symbol ?? "")
      .trim()
      .toUpperCase();
    if (sym) bySymbol.set(sym, row);
  }

  const out = {};
  for (const ev of slice) {
    const symKey = String(ev.symbol ?? "")
      .trim()
      .toUpperCase();
    const row = bySymbol.get(symKey);
    if (!row?.summary) continue;
    const ceiling = mediaSpotlightCeilingFromBuzz(ev);
    const spotlight = clampMediaSpotlight(row.media_spotlight ?? row.mediaSpotlight, ceiling);
    out[ev.symbol] = {
      media_spotlight: spotlight,
      summary: trimTickerSummary(row.summary, summaryMax)
    };
  }
  return out;
}

/** Week-ahead digest (richer per-ticker cap). */
export async function fetchOpenAiWeekPerTickerWebNotes(events, options = {}) {
  const weekStart = options.weekStart ?? "";
  const weekEnd = options.weekEnd ?? "";
  return fetchOpenAiPerTickerWebNotes(events, {
    ...options,
    promptMode: "week_ahead",
    contextLine: options.contextLine ?? `Week window ${weekStart}..${weekEnd}.`
  });
}

async function chatCompletionsFallbackJson({ apiKey, env, prompt }) {
  const model = String(env.OPENAI_MODEL ?? "").trim() || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You return only compact JSON for IPO ticker web blurbs. No live web: infer cautiously from prompt rows. Never investment advice."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn(`OpenAI chat JSON fallback HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
      return "";
    }

    const text = body.choices?.[0]?.message?.content?.trim();
    return text ? flattenMarkdownLinks(text) : "";
  } catch (error) {
    console.warn(`OpenAI chat JSON fallback failed: ${error.message}`);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOpenAiAttentionBlurb(events, contextLine, options = {}) {
  const env = options.env ?? process.env;
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey || !events.length) return "";

  const prompt = buildAttentionPrompt(events, contextLine);

  if (webSearchEnabled(env)) {
    const webText = await callResponsesWithWebSearch({
      apiKey,
      model: responsesModelFromEnv(env),
      input: prompt,
      timeoutMs: 90_000
    });
    if (webText) return trimForTelegram(flattenMarkdownLinks(webText));
  }

  return trimForTelegram(await chatCompletionsFallback({ apiKey, env, prompt }));
}

async function callResponsesWithWebSearch({ apiKey, model, input, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const tryBodies = [
    { tool_choice: "required" },
    { tool_choice: "auto" },
    {}
  ];

  try {
    for (const extra of tryBodies) {
      const body = {
        model,
        input,
        tools: [{ type: "web_search", search_context_size: "medium" }]
      };
      if (extra.tool_choice) body.tool_choice = extra.tool_choice;

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn(
          `OpenAI Responses attempt (${JSON.stringify(extra)}) HTTP ${response.status}: ${JSON.stringify(json).slice(0, 240)}`
        );
        continue;
      }

      const text = extractResponsesOutputText(json);
      if (text) return text;
    }
  } catch (error) {
    console.warn(`OpenAI Responses web search failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  return "";
}

async function chatCompletionsFallback({ apiKey, env, prompt }) {
  const model = String(env.OPENAI_MODEL ?? "").trim() || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content:
              "You write tight English summaries of IPO calendar rows without live web access. Never investment advice. Never numeric probabilities of returns. Use qualitative attention labels only when justified."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn(`OpenAI chat fallback HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
      return "";
    }

    const text = body.choices?.[0]?.message?.content?.trim();
    return text ? flattenMarkdownLinks(text) : "";
  } catch (error) {
    console.warn(`OpenAI chat fallback failed: ${error.message}`);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function collapseWhitespace(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/** @deprecated use fetchOpenAiAttentionBlurb */
export async function fetchOpenAiWeekSkim(events, options = {}) {
  const weekStart = options.weekStart ?? "";
  const weekEnd = options.weekEnd ?? "";
  return fetchOpenAiAttentionBlurb(events, `Week window ${weekStart}..${weekEnd}.`, options);
}
