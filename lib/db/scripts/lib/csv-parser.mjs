// Tiny RFC 4180 CSV parser — handles quoted cells, escaped quotes ("") inside
// cells, and embedded newlines + commas in quoted cells. Returns an array of
// row arrays; the caller handles header mapping.
//
// Built specifically for the FlipIQ Q2 plan CSVs which have Notes / Alignment
// columns that contain quoted multi-line text with commas. Avoids pulling in
// a dependency for a one-off migration script.

import { readFileSync } from "node:fs";

export function parseCsv(filePath) {
  const text = readFileSync(filePath, "utf8");
  return parseCsvText(text);
}

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        cell += ch;
        i++;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += ch;
    i++;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

// Map a header row + data rows to an array of objects keyed by header.
// Caller passes headerRowIndex (default 0) since some CSVs have a banner row.
export function parseCsvAsObjects(filePath, opts = {}) {
  const rows = parseCsv(filePath);
  if (rows.length < 2) return [];
  const headerRowIndex = opts.headerRowIndex ?? 0;
  const headers = rows[headerRowIndex].map((h) => h.trim());
  const out = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] ?? "").trim();
    }
    obj.__rowIndex = r;
    out.push(obj);
  }
  return out;
}
