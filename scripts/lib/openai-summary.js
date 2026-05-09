/**
 * Optional OpenAI "skim" for week digests. Never substitute for filings or your own research.
 */

export function buildWeekSkimPrompt(events, { weekStart, weekEnd } = {}) {
  const header = `IPO calendar window ${weekStart ?? "?"}..${weekEnd ?? "?"}.`;
  const lines = events
    .slice(0, 36)
    .map((event) => {
      const buzz = event.buzzScore != null ? ` buzz=${event.buzzScore}/${event.attentionBand ?? "n/a"}` : "";
      return `- ${event.symbol ?? "TBD"} | ${event.companyName ?? ""} | ${event.ipoDate ?? ""}${buzz}`;
    })
    .join("\n");

  return `${header}\n${lines}\n\nReply with 2-3 short sentences on sector or story themes only. No buy/sell, no targets, no odds, no legal advice.`;
}

export async function fetchOpenAiWeekSkim(events, options = {}) {
  const env = options.env ?? process.env;
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey || !events.length) return "";

  const model = String(env.OPENAI_MODEL ?? "").trim() || "gpt-4o-mini";
  const weekStart = options.weekStart ?? "";
  const weekEnd = options.weekEnd ?? "";
  const prompt = buildWeekSkimPrompt(events, { weekStart, weekEnd });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

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
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "You summarize IPO calendar rows for a quick thematic skim. Never investment advice. Never probabilities of returns."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn(`OpenAI week skim skipped: HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
      return "";
    }

    const text = body.choices?.[0]?.message?.content?.trim();
    return text ? collapseWhitespace(text) : "";
  } catch (error) {
    console.warn(`OpenAI week skim skipped: ${error.message}`);
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function collapseWhitespace(text) {
  return String(text).replace(/\s+/g, " ").trim();
}
