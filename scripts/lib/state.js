import { readFile, writeFile } from "node:fs/promises";

export async function readAlertState(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { sent: {} };
    throw error;
  }
}

export async function writeAlertState(path, state) {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
}

export function getAlertKey(type, targetDate) {
  return `${type}:${targetDate}`;
}

export function wasAlertSent(state, type, targetDate) {
  return Boolean(state.sent?.[getAlertKey(type, targetDate)]);
}

export function markAlertSent(state, type, targetDate, events, sentAt = new Date().toISOString()) {
  return {
    ...state,
    sent: {
      ...(state.sent ?? {}),
      [getAlertKey(type, targetDate)]: {
        sentAt,
        symbols: events.map((event) => event.symbol).filter(Boolean)
      }
    }
  };
}
