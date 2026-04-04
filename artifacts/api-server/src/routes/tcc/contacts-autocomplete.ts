import { Router, type IRouter } from "express";
import { getPeople } from "../../lib/google-auth";
import { searchEmails } from "../../lib/gmail.js";

const router: IRouter = Router();

let cachedContacts: { name: string; email: string }[] = [];
let cacheExpiry = 0;

router.get("/contacts/autocomplete", async (req, res): Promise<void> => {
  const query = String(req.query.q || "").toLowerCase().trim();
  if (!query || query.length < 3) {
    res.json([]);
    return;
  }

  try {
    if (Date.now() > cacheExpiry || cachedContacts.length === 0) {
      const people = getPeople();
      const response = await people.people.connections.list({
        resourceName: "people/me",
        pageSize: 1000,
        personFields: "names,emailAddresses",
      });

      cachedContacts = (response.data.connections || [])
        .filter(c => c.emailAddresses?.length)
        .map(c => ({
          name: c.names?.[0]?.displayName || "",
          email: c.emailAddresses![0].value || "",
        }));

      try {
        const otherResponse = await people.otherContacts.list({
          pageSize: 1000,
          readMask: "names,emailAddresses",
        });
        const others = (otherResponse.data.otherContacts || [])
          .filter(c => c.emailAddresses?.length)
          .map(c => ({
            name: c.names?.[0]?.displayName || "",
            email: c.emailAddresses![0].value || "",
          }));
        cachedContacts = [...cachedContacts, ...others];
      } catch {
        // otherContacts may fail if scope doesn't cover it
      }

      cacheExpiry = Date.now() + 10 * 60 * 1000;
    }

    const matches = cachedContacts
      .filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query)
      )
      .slice(0, 10);

    res.json(matches);
  } catch (err) {
    console.warn("[Contacts] autocomplete failed:", err instanceof Error ? err.message : err);
    res.json([]);
  }
});

// ── Email history for a contact ───────────────────────────────────────────────
router.get("/contacts/email-history", async (req, res): Promise<void> => {
  const email = String(req.query.email || "").trim();
  if (!email || !email.includes("@")) {
    res.json([]);
    return;
  }

  try {
    const results = await searchEmails(`from:${email} OR to:${email}`, 20);

    // Deduplicate by threadId, keep most recent occurrence per thread
    const seen = new Set<string>();
    const threads: typeof results = [];
    for (const r of results) {
      if (!seen.has(r.threadId)) {
        seen.add(r.threadId);
        threads.push(r);
      }
      if (threads.length >= 6) break;
    }

    res.json(threads);
  } catch (err) {
    console.warn("[contacts/email-history] failed:", err instanceof Error ? err.message : err);
    res.json([]);
  }
});

export default router;
