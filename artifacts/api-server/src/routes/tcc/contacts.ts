import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { eq, ilike, or, and, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/contacts", async (req, res): Promise<void> => {
  const { status, search, limit = "50", offset = "0" } = req.query as Record<string, string>;
  const lim = Math.min(parseInt(limit) || 50, 200);
  const off = parseInt(offset) || 0;

  const conditions: import("drizzle-orm").SQL[] = [];

  if (status) conditions.push(eq(contactsTable.status, status));

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(contactsTable.name, q),
        ilike(contactsTable.company, q),
        ilike(contactsTable.phone, q),
        ilike(contactsTable.email, q),
      )!
    );
  }

  const where = conditions.length === 1 ? conditions[0]
    : conditions.length > 1 ? and(...conditions)
    : undefined;

  // Priority ordering: Hot > Warm > New, then by name
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(where)
    .orderBy(
      sql`CASE status WHEN 'Hot' THEN 0 WHEN 'Warm' THEN 1 ELSE 2 END`,
      contactsTable.name
    )
    .limit(lim)
    .offset(off);

  // Total count for pagination
  const countResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(contactsTable)
    .where(where);

  res.json({
    contacts,
    total: Number(countResult[0]?.count ?? 0),
    limit: lim,
    offset: off,
  });
});

export default router;
