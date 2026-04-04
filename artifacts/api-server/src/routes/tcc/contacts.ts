import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { ListContactsQueryParams } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/contacts", async (req, res): Promise<void> => {
  const query = ListContactsQueryParams.safeParse(req.query);
  
  let contacts;
  if (query.success && query.data.status) {
    contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.status, query.data.status));
  } else {
    contacts = await db.select().from(contactsTable);
  }

  res.json(contacts);
});

export default router;
