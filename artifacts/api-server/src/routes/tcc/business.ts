import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { eq, asc, desc, and } from "drizzle-orm";
import { companyGoalsTable, teamRolesTable, goalCompletionsTable, businessContextTable } from "../../lib/schema-v2";
import { getSheetValues, getSheetsClient } from "../../lib/google-sheets";

const router: IRouter = Router();

const BUSINESS_MASTER_SHEET_ID = process.env.BUSINESS_MASTER_SHEET_ID || "1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw";

const HORIZON_ORDER = ["5yr", "1yr", "quarterly", "monthly", "weekly", "daily"];

// ─── Goals ───────────────────────────────────────────────────────────────────

router.get("/business/goals", async (req, res): Promise<void> => {
  try {
    const { horizon, owner, status } = req.query;
    const goals = await db.select().from(companyGoalsTable)
      .orderBy(asc(companyGoalsTable.position), asc(companyGoalsTable.createdAt));
    let filtered = goals;
    if (horizon) filtered = filtered.filter(g => g.horizon === horizon);
    if (owner) filtered = filtered.filter(g => g.owner?.toLowerCase() === String(owner).toLowerCase());
    if (status) filtered = filtered.filter(g => g.status === status);
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/business/goals/by-horizon", async (_req, res): Promise<void> => {
  try {
    const goals = await db.select().from(companyGoalsTable)
      .orderBy(asc(companyGoalsTable.position), asc(companyGoalsTable.createdAt));
    const grouped: Record<string, typeof goals> = {};
    for (const h of HORIZON_ORDER) grouped[h] = [];
    for (const g of goals) {
      const h = g.horizon || "other";
      if (!grouped[h]) grouped[h] = [];
      grouped[h].push(g);
    }
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/business/goals", async (req, res): Promise<void> => {
  try {
    const { horizon, title, description, owner, status, dueDate } = req.body;
    if (!horizon || !title) { res.status(400).json({ error: "horizon and title required" }); return; }
    const [goal] = await db.insert(companyGoalsTable).values({
      horizon, title, description, owner: owner || "Tony",
      status: status || "active", dueDate: dueDate || null,
    }).returning();
    push411ToSheet().catch(() => {});
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch("/business/goals/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, owner, status, dueDate, position, horizon } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (owner !== undefined) updates.owner = owner;
    if (status !== undefined) {
      updates.status = status;
      if (status === "done") updates.completedAt = new Date();
    }
    if (dueDate !== undefined) updates.dueDate = dueDate || null;
    if (position !== undefined) updates.position = position;
    if (horizon !== undefined) updates.horizon = horizon;

    const [goal] = await db.update(companyGoalsTable).set(updates).where(eq(companyGoalsTable.id, id)).returning();
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }

    if (status === "done") {
      await db.insert(goalCompletionsTable).values({ goalId: id, goalTitle: goal.title, horizon: goal.horizon }).catch(() => {});
    }

    push411ToSheet().catch(() => {});

    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/business/goals/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(companyGoalsTable).where(eq(companyGoalsTable.id, req.params.id));
    push411ToSheet().catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/business/goals/reorder", async (req, res): Promise<void> => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    if (!Array.isArray(orderedIds)) { res.status(400).json({ error: "orderedIds array required" }); return; }
    await Promise.all(orderedIds.map((id, pos) =>
      db.update(companyGoalsTable).set({ position: pos, updatedAt: new Date() }).where(eq(companyGoalsTable.id, id))
    ));
    push411ToSheet().catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Team ────────────────────────────────────────────────────────────────────

router.get("/business/team", async (_req, res): Promise<void> => {
  try {
    const team = await db.select().from(teamRolesTable).orderBy(asc(teamRolesTable.position), asc(teamRolesTable.name));
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/business/team", async (req, res): Promise<void> => {
  try {
    const { name, slackId, email, role, responsibilities, currentFocus, metrics } = req.body;
    if (!name || !role) { res.status(400).json({ error: "name and role required" }); return; }
    const [member] = await db.insert(teamRolesTable).values({
      name, slackId, email, role,
      responsibilities: responsibilities || [],
      currentFocus, metrics: metrics || {},
    }).returning();
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch("/business/team/:id", async (req, res): Promise<void> => {
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const fields = ["name", "slackId", "email", "role", "responsibilities", "currentFocus", "metrics", "position"] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f === "slackId" ? "slackId" : f] = req.body[f];
    }
    const [member] = await db.update(teamRolesTable).set(updates).where(eq(teamRolesTable.id, req.params.id)).returning();
    if (!member) { res.status(404).json({ error: "Team member not found" }); return; }
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Seed default team members if none exist ─────────────────────────────────

router.post("/business/team/seed", async (_req, res): Promise<void> => {
  try {
    const defaults = [
      {
        name: "Tony Diaz", slackId: "U0991BAS0TC", email: "tony@flipiq.com", role: "CEO",
        responsibilities: ["Sales strategy", "Acquisition associate oversight", "Key deal relationships", "Company vision"],
        currentFocus: "Closing 2 deals/month per AA, hitting $100K revenue", position: 0,
      },
      {
        name: "Ethan", slackId: "U0991BD321Y", email: "ethan@flipiq.com", role: "COO",
        responsibilities: ["Operations", "Team management", "Accountability reporting", "Process optimization"],
        currentFocus: "Keeping team on track with 90-day plan", position: 1,
      },
      {
        name: "Nate", slackId: "U0991BFNZ7U", email: "nate@flipiq.com", role: "Tech Lead",
        responsibilities: ["Platform development", "AI/tech features", "Infrastructure", "System reliability"],
        currentFocus: "Building COO Dashboard and AI tooling", position: 2,
      },
      {
        name: "Ramy", slackId: null, email: null, role: "Acquisition Associate",
        responsibilities: ["Sales calls", "Lead follow-up", "Demo scheduling", "Pipeline management"],
        currentFocus: "2 deals/month target", position: 3,
      },
    ];
    for (const m of defaults) {
      await db.insert(teamRolesTable).values(m).onConflictDoUpdate({
        target: teamRolesTable.name,
        set: { role: m.role, slackId: m.slackId, email: m.email, currentFocus: m.currentFocus, position: m.position, updatedAt: new Date() },
      });
    }
    res.json({ ok: true, seeded: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Business context (plans/docs) ───────────────────────────────────────────

router.get("/business/context", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(businessContextTable);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Goal completions history ─────────────────────────────────────────────────

router.get("/business/goal-completions", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(goalCompletionsTable).orderBy(desc(goalCompletionsTable.completedAt)).limit(100);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Sync 411 plan from Google Sheet ─────────────────────────────────────────

export async function sync411FromSheet(): Promise<void> {
  if (!BUSINESS_MASTER_SHEET_ID) return;
  try {
    const rows = await getSheetValues(BUSINESS_MASTER_SHEET_ID, "411 Plan!A:G");
    if (!rows || rows.length < 2) {
      console.log("[business] sync411FromSheet: No data in '411 Plan' tab");
      return;
    }
    const header = rows[0].map((h: string) => String(h).toLowerCase().trim());
    const horizonIdx = header.findIndex((h: string) => h.includes("horizon") || h.includes("timeframe"));
    const titleIdx = header.findIndex((h: string) => h.includes("goal") || h.includes("one thing") || h.includes("title"));
    const ownerIdx = header.findIndex((h: string) => h.includes("owner") || h.includes("who"));
    const statusIdx = header.findIndex((h: string) => h.includes("status"));
    const dueDateIdx = header.findIndex((h: string) => h.includes("due") || h.includes("date"));
    const descIdx = header.findIndex((h: string) => h.includes("desc") || h.includes("notes") || h.includes("detail"));

    if (horizonIdx === -1 || titleIdx === -1) {
      console.warn("[business] sync411FromSheet: Could not find Horizon or Goal/Title column");
      return;
    }

    let synced = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const horizon = String(row[horizonIdx] || "").trim().toLowerCase();
      const title = String(row[titleIdx] || "").trim();
      if (!horizon || !title) continue;

      const normalized = horizon.replace(/[^a-z0-9]/g, "").replace("year", "yr").replace("quarter", "quarterly").replace("5yr", "5yr").replace("1yr", "1yr");
      const finalHorizon = HORIZON_ORDER.includes(normalized) ? normalized : horizon;

      const owner = ownerIdx >= 0 ? String(row[ownerIdx] || "Tony").trim() || "Tony" : "Tony";
      const status = statusIdx >= 0 ? String(row[statusIdx] || "active").trim().toLowerCase() || "active" : "active";
      const description = descIdx >= 0 ? String(row[descIdx] || "").trim() || null : null;
      const dueDate = dueDateIdx >= 0 ? String(row[dueDateIdx] || "").trim() || null : null;
      const sheetRowRef = String(i + 1);
      const rowData = {
        horizon: finalHorizon, title, description, owner, status,
        dueDate: dueDate || null, position: i - 1, sheetRowRef,
      };

      // Use sheetRowRef as the stable identity: update if exists, otherwise insert.
      // This avoids a unique-violation on sheetRowRef when a sheet row's title changes.
      const existing = await db.select({ id: companyGoalsTable.id })
        .from(companyGoalsTable)
        .where(eq(companyGoalsTable.sheetRowRef, sheetRowRef))
        .limit(1);

      if (existing.length > 0) {
        await db.update(companyGoalsTable)
          .set({ ...rowData, updatedAt: new Date() })
          .where(eq(companyGoalsTable.id, existing[0].id));
      } else {
        await db.insert(companyGoalsTable).values(rowData)
          .onConflictDoUpdate({
            target: [companyGoalsTable.horizon, companyGoalsTable.title],
            set: { description, owner, status, dueDate: dueDate || null, position: i - 1, sheetRowRef, updatedAt: new Date() },
          });
      }
      synced++;
    }
    console.log(`[business] sync411FromSheet: ${synced} goals synced from sheet`);
  } catch (err) {
    console.warn("[business] sync411FromSheet failed:", (err as Error).message);
  }
}

export async function syncTeamFromSheet(): Promise<void> {
  if (!BUSINESS_MASTER_SHEET_ID) return;
  try {
    const rows = await getSheetValues(BUSINESS_MASTER_SHEET_ID, "Team Roster!A:G");
    if (!rows || rows.length < 2) {
      console.log("[business] syncTeamFromSheet: No data in 'Team Roster' tab");
      return;
    }
    const header = rows[0].map((h: string) => String(h).toLowerCase().trim());
    const nameIdx = header.findIndex((h: string) => h.includes("name"));
    const roleIdx = header.findIndex((h: string) => h.includes("role") || h.includes("title"));
    const emailIdx = header.findIndex((h: string) => h.includes("email"));
    const focusIdx = header.findIndex((h: string) => h.includes("focus") || h.includes("priority"));
    const respIdx = header.findIndex((h: string) => h.includes("resp") || h.includes("duties"));

    if (nameIdx === -1 || roleIdx === -1) {
      console.log("[business] syncTeamFromSheet: Missing Name or Role column");
      return;
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row[nameIdx] || "").trim();
      const role = String(row[roleIdx] || "").trim();
      if (!name || !role) continue;

      const teamEmail = emailIdx >= 0 ? String(row[emailIdx] || "").trim() || null : null;
      const teamFocus = focusIdx >= 0 ? String(row[focusIdx] || "").trim() || null : null;
      const teamResp = respIdx >= 0 ? String(row[respIdx] || "").split(",").map((s: string) => s.trim()).filter(Boolean) : [];
      await db.insert(teamRolesTable).values({
        name, role,
        email: teamEmail,
        currentFocus: teamFocus,
        responsibilities: teamResp,
        position: i - 1,
      }).onConflictDoUpdate({
        target: teamRolesTable.name,
        set: { role, email: teamEmail, currentFocus: teamFocus, responsibilities: teamResp, position: i - 1, updatedAt: new Date() },
      });
    }
    console.log(`[business] syncTeamFromSheet: team synced from sheet`);
  } catch (err) {
    console.warn("[business] syncTeamFromSheet failed:", (err as Error).message);
  }
}

export async function push411ToSheet(): Promise<void> {
  if (!BUSINESS_MASTER_SHEET_ID) return;
  try {
    const sheets = await getSheetsClient();
    const goals = await db.select().from(companyGoalsTable).orderBy(asc(companyGoalsTable.position));
    const header = ["Horizon", "Goal / ONE THING", "Owner", "Status", "Due Date", "Description"];
    const rows = goals.map(g => [
      g.horizon, g.title, g.owner || "Tony", g.status || "active",
      g.dueDate || "", g.description || "",
    ]);
    await sheets.spreadsheets.values.clear({ spreadsheetId: BUSINESS_MASTER_SHEET_ID, range: "411 Plan!A:Z" });
    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: BUSINESS_MASTER_SHEET_ID,
        range: "411 Plan!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [header, ...rows] },
      });
    }
    console.log(`[business] push411ToSheet: ${rows.length} goals pushed`);
  } catch (err) {
    console.warn("[business] push411ToSheet failed:", (err as Error).message);
  }
}

router.post("/business/sync-from-sheet", async (_req, res): Promise<void> => {
  try {
    await Promise.allSettled([sync411FromSheet(), syncTeamFromSheet()]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/business/push-to-sheet", async (_req, res): Promise<void> => {
  try {
    await push411ToSheet();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
