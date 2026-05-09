import test from "node:test";
import assert from "node:assert/strict";
import { csvToObjects, parseCsv } from "../scripts/lib/csv.js";

test("parseCsv handles quoted commas and escaped quotes", () => {
  const rows = parseCsv('symbol,name\nABC,"Acme, Inc"\nDEF,"Quote ""Test"""');
  assert.deepEqual(rows, [
    ["symbol", "name"],
    ["ABC", "Acme, Inc"],
    ["DEF", 'Quote "Test"']
  ]);
});

test("csvToObjects normalizes headers", () => {
  const rows = csvToObjects("IPO Date,Company Name\n2026-05-11,Figma");
  assert.deepEqual(rows, [{ ipodate: "2026-05-11", companyname: "Figma" }]);
});
