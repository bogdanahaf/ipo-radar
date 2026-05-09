/**
 * Optional OpenAI blurbs for Telegram digests.
 * Uses the Responses API + hosted web_search when enabled; otherwise a light Chat Completions fallback.
 * Outputs qualitative "attention / volatility-risk bucket" language only — not return forecasts or fake probabilities.
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
