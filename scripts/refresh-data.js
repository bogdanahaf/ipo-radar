#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createIpoPayload, parseAlphaVantageCsv } from "./lib/ipo.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(rootDir, args.output ?? "docs/data/ipos.json");

try {
  const csv = args.input ? await readFile(resolve(rootDir, args.input), "utf8") : await fetchAlphaVantageCsv();
  const generatedAt = new Date().toISOString();
  const events = parseAlphaVantageCsv(csv, { updatedAt: generatedAt });
  const payload = createIpoPayload(events, { generatedAt });

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `Wrote ${payload.counts.total} IPO rows (${payload.counts.visible} visible, ${payload.counts.hidden} hidden) to ${outputPath}`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

async function fetchAlphaVantageCsv() {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ALPHAVANTAGE_API_KEY. Use --input for local fixture runs.");
  }

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "IPO_CALENDAR");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Alpha Vantage request failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (/thank you for using alpha vantage/i.test(text) && /rate limit/i.test(text)) {
    throw new Error("Alpha Vantage rate limit reached.");
  }
  if (/invalid api call/i.test(text)) {
    throw new Error(`Alpha Vantage returned an invalid API response: ${text.slice(0, 160)}`);
  }

  return text;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") parsed.input = argv[++index];
    else if (arg === "--output") parsed.output = argv[++index];
  }
  return parsed;
}
