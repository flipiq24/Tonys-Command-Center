// Multi-provider AI settings CRUD.
//   GET    /ai-settings                       → all 3 tiers (basic/medium/complex)
//   PATCH  /ai-settings/:tier                  → set provider/model/key for a tier
//   POST   /ai-settings/:tier/test             → 1-token connectivity check
//   GET    /ai-settings/models/:provider       → curated model suggestions for autocomplete

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { aiProviderSettingsTable } from "../../lib/schema-v2";
import {
  encryptKey,
  invalidateTierCache,
  MODEL_SUGGESTIONS,
  SUPPORTED_PROVIDERS,
  testProvider,
  type Provider,
} from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const TIERS = ["basic", "medium", "complex"] as const;
type Tier = typeof TIERS[number];

function isTier(t: string): t is Tier {
  return (TIERS as readonly string[]).includes(t);
}

interface PublicRow {
  tier: Tier;
  provider: string;
  model: string;
  keyConfigured: boolean;
  baseUrl: string | null;
  extraOptions: Record<string, unknown>;
  updatedAt: string;
}

function publicRow(row: typeof aiProviderSettingsTable.$inferSelect): PublicRow {
  return {
    tier: row.tier as Tier,
    provider: row.provider,
    model: row.model,
    keyConfigured: Boolean(row.apiKeyCipher),
    baseUrl: row.baseUrl,
    extraOptions: (row.extraOptions ?? {}) as Record<string, unknown>,
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/ai-settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(aiProviderSettingsTable);
  // Order canonically: basic, medium, complex.
  const order: Record<string, number> = { basic: 0, medium: 1, complex: 2 };
  rows.sort((a, b) => (order[a.tier] ?? 99) - (order[b.tier] ?? 99));
  res.json({
    tiers: rows.map(publicRow),
    providers: SUPPORTED_PROVIDERS,
  });
});

router.get("/ai-settings/models/:provider", (req, res): void => {
  const p = req.params.provider as Provider;
  const list = MODEL_SUGGESTIONS[p];
  if (!list) {
    res.status(404).json({ error: `Unknown provider: ${p}` });
    return;
  }
  res.json({ provider: p, suggestions: list });
});

const PatchBody = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS as unknown as [Provider, ...Provider[]]).optional(),
  model: z.string().min(1).optional(),
  apiKey: z.string().min(1).nullable().optional(),
  baseUrl: z.string().nullable().optional(),
  extraOptions: z.record(z.unknown()).optional(),
});

router.patch("/ai-settings/:tier", async (req, res): Promise<void> => {
  const { tier } = req.params;
  if (!isTier(tier)) {
    res.status(400).json({ error: `Invalid tier '${tier}'` });
    return;
  }
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof aiProviderSettingsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.provider !== undefined) updates.provider = parsed.data.provider;
  if (parsed.data.model !== undefined) updates.model = parsed.data.model;
  if (parsed.data.baseUrl !== undefined) updates.baseUrl = parsed.data.baseUrl;
  if (parsed.data.extraOptions !== undefined) updates.extraOptions = parsed.data.extraOptions;

  // API key handling: explicit null clears it; undefined leaves unchanged;
  // a string encrypts and stores fresh ciphertext + IV + tag.
  if (parsed.data.apiKey === null) {
    updates.apiKeyCipher = null as unknown as Buffer;
    updates.apiKeyIv = null as unknown as Buffer;
    updates.apiKeyTag = null as unknown as Buffer;
  } else if (typeof parsed.data.apiKey === "string") {
    try {
      const enc = encryptKey(parsed.data.apiKey);
      updates.apiKeyCipher = enc.cipher;
      updates.apiKeyIv = enc.iv;
      updates.apiKeyTag = enc.tag;
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
  }

  const [row] = await db
    .update(aiProviderSettingsTable)
    .set(updates)
    .where(eq(aiProviderSettingsTable.tier, tier))
    .returning();
  if (!row) {
    res.status(404).json({ error: `No row for tier '${tier}'` });
    return;
  }
  invalidateTierCache(tier);
  res.json(publicRow(row));
});

const TestBody = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS as unknown as [Provider, ...Provider[]]),
  model: z.string().min(1),
  // If absent, use the saved key for this tier (must be already configured).
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().nullable().optional(),
  extraOptions: z.record(z.unknown()).optional(),
});

router.post("/ai-settings/:tier/test", async (req, res): Promise<void> => {
  const { tier } = req.params;
  if (!isTier(tier)) {
    res.status(400).json({ error: `Invalid tier '${tier}'` });
    return;
  }
  const parsed = TestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let apiKey = parsed.data.apiKey;
  if (!apiKey) {
    // Pull saved key from DB (decrypt) — this is a "test currently saved" path.
    const { decryptKey } = await import("@workspace/integrations-anthropic-ai");
    const [row] = await db
      .select()
      .from(aiProviderSettingsTable)
      .where(eq(aiProviderSettingsTable.tier, tier));
    if (!row?.apiKeyCipher || !row.apiKeyIv || !row.apiKeyTag) {
      res.status(400).json({ ok: false, error: "No saved API key for this tier; provide apiKey in the body." });
      return;
    }
    try {
      apiKey = decryptKey({ cipher: row.apiKeyCipher, iv: row.apiKeyIv, tag: row.apiKeyTag });
    } catch (err) {
      res.status(500).json({ ok: false, error: `Decrypt failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
  }

  try {
    const result = await testProvider(parsed.data.provider, parsed.data.model, apiKey, {
      baseUrl: parsed.data.baseUrl ?? undefined,
      extraOptions: parsed.data.extraOptions,
    });
    res.json({
      provider: parsed.data.provider,
      model: parsed.data.model,
      ...result,  // includes ok:true, durationMs, preview, usage
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      provider: parsed.data.provider,
      model: parsed.data.model,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
