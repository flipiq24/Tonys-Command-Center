// get_daily_checkin_history — orchestrator wrapper. Reads tcc_checkins rows.

import type { ToolHandler } from "../index.js";
import { db, checkinsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const handler: ToolHandler = async (input) => {
  const days = typeof input.days === "number" ? Math.min(input.days, 30) : 7;
  const rows = await db.select().from(checkinsTable).orderBy(desc(checkinsTable.date)).limit(days);
  if (rows.length === 0) return "No check-in history found.";
  return rows.map((r, i) => {
    const parts = [`${i + 1}. [${r.date}]`];
    if (r.sleepHours != null) parts.push(`Sleep: ${r.sleepHours}h`);
    if (r.bibleRead != null) parts.push(`Bible: ${r.bibleRead ? "✓" : "✗"}`);
    if (r.exercised != null) parts.push(`Exercise: ${r.exercised ? "✓" : "✗"}`);
    if (r.mood) parts.push(`Mood: ${r.mood}`);
    if (r.priority1) parts.push(`\n   P1: ${r.priority1}`);
    if (r.priority2) parts.push(`P2: ${r.priority2}`);
    if (r.priority3) parts.push(`P3: ${r.priority3}`);
    return parts.join(" | ");
  }).join("\n");
};

export default handler;
