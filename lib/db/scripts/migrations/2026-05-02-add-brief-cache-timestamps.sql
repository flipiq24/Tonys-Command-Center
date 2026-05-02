-- Per-section cache timestamps for daily_briefs.
-- Used by /brief/today to serve cached data when fresh (<1h old) and re-fetch
-- live (Gmail+AI reclassify, Calendar, Linear) only when stale.

ALTER TABLE daily_briefs ADD COLUMN IF NOT EXISTS emails_refreshed_at   timestamptz;
ALTER TABLE daily_briefs ADD COLUMN IF NOT EXISTS calendar_refreshed_at timestamptz;
ALTER TABLE daily_briefs ADD COLUMN IF NOT EXISTS linear_refreshed_at   timestamptz;
