// One-off: strip reverse-sync code from sheets-sync.ts and business.ts.
// Keeps only DB → Sheets (outbound). Removes Sheets → DB (reverse) functions/routes.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

function stripBlock(src, startMarker, endMarker, includeLineBeforeIfBlank = true) {
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) return { src, removed: 0, found: false };
  const endIdx = src.indexOf(endMarker, startIdx + startMarker.length);
  if (endIdx === -1) throw new Error(`End marker not found for start: ${startMarker.substring(0, 60)}...`);
  const afterEnd = endIdx + endMarker.length;
  // Trim trailing blank line if present
  let cutEnd = afterEnd;
  while (src[cutEnd] === "\n" && src[cutEnd + 1] === "\n") cutEnd++;
  // Trim preceding blank line if the block is preceded by a standalone blank line and the user asks
  let cutStart = startIdx;
  if (includeLineBeforeIfBlank && src[startIdx - 1] === "\n" && src[startIdx - 2] === "\n") cutStart--;
  const before = src.substring(0, cutStart);
  const after = src.substring(cutEnd);
  return { src: before + after, removed: cutEnd - cutStart, found: true };
}

// ────────────────────────────────────────────────────────────────────────
// sheets-sync.ts
// ────────────────────────────────────────────────────────────────────────
const sheetsSyncPath = resolve(REPO_ROOT, "artifacts/api-server/src/routes/tcc/sheets-sync.ts");
let sheets = readFileSync(sheetsSyncPath, "utf8");
const origLen = sheets.length;
// Normalize line endings to LF for robust matching; we'll preserve the file's natural ending on write.
const hadCRLF = sheets.includes("\r\n");
if (hadCRLF) sheets = sheets.replace(/\r\n/g, "\n");

// Remove syncTasksFromSheet function (full body).
// Marker: the export line. End: the closing '}' line just before `export async function syncContactsTab`.
{
  const startLine = "export async function syncTasksFromSheet(): Promise<{ ok: boolean; inserted: number; masters: number; subs: number; skipped: number; flushed: number; error?: string }> {";
  const endMarker = "\n}\n\nexport async function syncContactsTab";
  const startIdx = sheets.indexOf(startLine);
  if (startIdx === -1) console.warn("syncTasksFromSheet start not found");
  else {
    const endIdx = sheets.indexOf(endMarker, startIdx);
    if (endIdx === -1) throw new Error("syncTasksFromSheet end marker not found");
    // cut from startIdx up to (but not including) "\nexport async function syncContactsTab"
    const cutTo = endIdx + "\n}\n\n".length;
    sheets = sheets.substring(0, startIdx) + sheets.substring(cutTo);
    console.log("✓ Removed syncTasksFromSheet");
  }
}

// Remove syncContactsFromSheet function (full body).
{
  const startLine = "// ─── Sheets → DB FULL RESYNC for contacts ───";
  const altStart = "export async function syncContactsFromSheet(): Promise<{ ok: boolean; inserted: number; flushed: number; skipped: number; error?: string }> {";
  const endMarker = "\n}\n\nexport async function syncCommsTab";
  let startIdx = sheets.indexOf(startLine);
  if (startIdx === -1) startIdx = sheets.indexOf(altStart);
  if (startIdx === -1) console.warn("syncContactsFromSheet start not found");
  else {
    const endIdx = sheets.indexOf(endMarker, startIdx);
    if (endIdx === -1) throw new Error("syncContactsFromSheet end marker not found");
    const cutTo = endIdx + "\n}\n\n".length;
    sheets = sheets.substring(0, startIdx) + sheets.substring(cutTo);
    console.log("✓ Removed syncContactsFromSheet");
  }
}

// Remove POST /sheets/sync-tasks-from-sheet route (+ optional preceding comment)
{
  const startMarker = '// ─── Sheets → DB reverse sync for tasks';
  const altStart = 'router.post("/sheets/sync-tasks-from-sheet"';
  const endMarker = "});\n";
  let startIdx = sheets.indexOf(startMarker);
  if (startIdx === -1) startIdx = sheets.indexOf(altStart);
  if (startIdx === -1) console.warn("sync-tasks-from-sheet route not found");
  else {
    const rteStart = sheets.indexOf(altStart, startIdx);
    const endIdx = sheets.indexOf(endMarker, rteStart);
    const cutTo = endIdx + endMarker.length;
    sheets = sheets.substring(0, startIdx) + sheets.substring(cutTo);
    console.log("✓ Removed POST /sheets/sync-tasks-from-sheet");
  }
}

// Remove POST /sheets/sync-contacts-from-sheet route
{
  const startMarker = '// ─── Sheets → DB reverse sync for contacts';
  const altStart = 'router.post("/sheets/sync-contacts-from-sheet"';
  const endMarker = "});\n";
  let startIdx = sheets.indexOf(startMarker);
  if (startIdx === -1) startIdx = sheets.indexOf(altStart);
  if (startIdx === -1) console.warn("sync-contacts-from-sheet route not found");
  else {
    const rteStart = sheets.indexOf(altStart, startIdx);
    const endIdx = sheets.indexOf(endMarker, rteStart);
    const cutTo = endIdx + endMarker.length;
    sheets = sheets.substring(0, startIdx) + sheets.substring(cutTo);
    console.log("✓ Removed POST /sheets/sync-contacts-from-sheet");
  }
}

// Fix sync-master Promise.allSettled — remove sync411FromSheet() + syncTeamFromSheet() from the array
{
  const oldCall = 'await Promise.allSettled([syncTasksTab(), syncContactsTab(), syncCommsTab(), sync411FromSheet(), syncTeamFromSheet()]);\n    res.json({ ok: true, synced: ["Tasks", "Contacts", "Comms", "411 Goals", "Team"] });';
  const newCall = 'await Promise.allSettled([syncTasksTab(), syncContactsTab(), syncCommsTab()]);\n    res.json({ ok: true, synced: ["Tasks", "Contacts", "Comms"] });';
  if (sheets.includes(oldCall)) {
    sheets = sheets.replace(oldCall, newCall);
    console.log("✓ Simplified /sheets/sync-master to outbound-only");
  } else {
    console.warn("sync-master call pattern not found");
  }
}

// Update startAutoSync comment referencing /sheets/sync-tasks-from-sheet
{
  const oldComment = "  // Manual sync is still available via POST /sheets/sync-master and /sheets/sync-tasks-from-sheet.";
  const newComment = "  // Manual sync is still available via POST /sheets/sync-master (outbound only — DB → Sheets).";
  if (sheets.includes(oldComment)) {
    sheets = sheets.replace(oldComment, newComment);
    console.log("✓ Updated startAutoSync comment");
  }
}

// Clean up any "remove extra blank lines 3+ in a row"
sheets = sheets.replace(/\n{3,}/g, "\n\n");

if (hadCRLF) sheets = sheets.replace(/\n/g, "\r\n");
writeFileSync(sheetsSyncPath, sheets);
console.log(`sheets-sync.ts: ${origLen} → ${sheets.length} bytes (${origLen - sheets.length} removed)`);

// ────────────────────────────────────────────────────────────────────────
// business.ts
// ────────────────────────────────────────────────────────────────────────
const businessPath = resolve(REPO_ROOT, "artifacts/api-server/src/routes/tcc/business.ts");
let business = readFileSync(businessPath, "utf8");
const origBizLen = business.length;
const bizHadCRLF = business.includes("\r\n");
if (bizHadCRLF) business = business.replace(/\r\n/g, "\n");

// Remove sync411FromSheet function
{
  const startLine = "export async function sync411FromSheet(): Promise<void> {";
  const endMarker = "\n}\n\nexport async function syncTeamFromSheet";
  const startIdx = business.indexOf(startLine);
  if (startIdx === -1) console.warn("sync411FromSheet not found");
  else {
    const endIdx = business.indexOf(endMarker, startIdx);
    if (endIdx === -1) throw new Error("sync411FromSheet end marker not found");
    const cutTo = endIdx + "\n}\n\n".length;
    business = business.substring(0, startIdx) + business.substring(cutTo);
    console.log("✓ Removed sync411FromSheet");
  }
}

// Remove syncTeamFromSheet function
{
  const startLine = "export async function syncTeamFromSheet(): Promise<void> {";
  const endMarker = "\n}\n";
  const startIdx = business.indexOf(startLine);
  if (startIdx === -1) console.warn("syncTeamFromSheet not found");
  else {
    const endIdx = business.indexOf(endMarker, startIdx);
    if (endIdx === -1) throw new Error("syncTeamFromSheet end marker not found");
    const cutTo = endIdx + endMarker.length;
    business = business.substring(0, startIdx) + business.substring(cutTo);
    console.log("✓ Removed syncTeamFromSheet");
  }
}

// Remove /business/sync-from-sheet route
{
  const startLine = 'router.post("/business/sync-from-sheet"';
  const endMarker = "});\n";
  const startIdx = business.indexOf(startLine);
  if (startIdx === -1) console.warn("/business/sync-from-sheet route not found");
  else {
    const endIdx = business.indexOf(endMarker, startIdx);
    const cutTo = endIdx + endMarker.length;
    business = business.substring(0, startIdx) + business.substring(cutTo);
    console.log("✓ Removed POST /business/sync-from-sheet");
  }
}

// Clean up triple blanks
business = business.replace(/\n{3,}/g, "\n\n");

if (bizHadCRLF) business = business.replace(/\n/g, "\r\n");
writeFileSync(businessPath, business);
console.log(`business.ts: ${origBizLen} → ${business.length} bytes (${origBizLen - business.length} removed)`);
