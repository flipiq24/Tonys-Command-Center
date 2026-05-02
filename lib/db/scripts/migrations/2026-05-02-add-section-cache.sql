-- Single cache table for view-scoped data sections.
-- One row per section name (emails, calendar, linear, slack).
-- /brief/{section} reads here; auto-refresh + manual refresh write here.
-- Email AI reclassification is gated by ai_processed_at (6-hour TTL).

CREATE TABLE IF NOT EXISTS section_cache (
  section          text PRIMARY KEY,
  data             jsonb NOT NULL,
  fetched_at       timestamptz,
  ai_processed_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column adds for re-runs against existing tables
ALTER TABLE section_cache ADD COLUMN IF NOT EXISTS data            jsonb;
ALTER TABLE section_cache ADD COLUMN IF NOT EXISTS fetched_at      timestamptz;
ALTER TABLE section_cache ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;
ALTER TABLE section_cache ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();
