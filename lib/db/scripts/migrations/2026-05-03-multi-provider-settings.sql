-- Multi-provider AI settings: tier-based model/provider config + accuracy
-- columns on existing telemetry tables. See plan: feat/multi-provider-ai.

-- ─── 1. ai_provider_settings: per-tier provider/model/key config ─────────────
CREATE TABLE IF NOT EXISTS ai_provider_settings (
  tier            text PRIMARY KEY  CHECK (tier IN ('basic','medium','complex')),
  provider        text NOT NULL     CHECK (provider IN ('anthropic','openai','google','openrouter')),
  model           text NOT NULL,
  api_key_cipher  bytea,
  api_key_iv      bytea,
  api_key_tag     bytea,
  base_url        text,
  extra_options   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text
);

-- Seed defaults — all 3 tiers point at current Anthropic models. No keys
-- stored; falls back to ANTHROPIC_API_KEY env var until UI sets one.
INSERT INTO ai_provider_settings (tier, provider, model)
VALUES
  ('basic',   'anthropic', 'claude-haiku-4-5'),
  ('medium',  'anthropic', 'claude-sonnet-4-6'),
  ('complex', 'anthropic', 'claude-sonnet-4-6')
ON CONFLICT (tier) DO NOTHING;

-- ─── 2. ai_usage_logs: add cache + tier columns ──────────────────────────────
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS cache_read_input_tokens     integer DEFAULT 0;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS cache_creation_input_tokens integer DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_aul_tier ON ai_usage_logs(tier);

-- ─── 3. agent_skills: add tier column + backfill from current model ──────────
ALTER TABLE agent_skills ADD COLUMN IF NOT EXISTS tier text;

UPDATE agent_skills SET tier = CASE
  WHEN model LIKE 'claude-haiku%'  THEN 'basic'
  WHEN model LIKE 'claude-sonnet%' THEN 'medium'
  WHEN model LIKE 'claude-opus%'   THEN 'complex'
  ELSE 'medium'
END
WHERE tier IS NULL;

-- Don't enforce NOT NULL yet — leave optional for safe rollout. After
-- application code is verified to set it on every insert, follow up with:
--   ALTER TABLE agent_skills ALTER COLUMN tier SET NOT NULL;
