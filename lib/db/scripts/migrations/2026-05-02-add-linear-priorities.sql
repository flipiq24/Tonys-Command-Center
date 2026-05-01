-- Add linear_priorities table for the Linear Priorities triage view (sub-tab under Master task).
-- Different shape from plan_items: flat triage list, action flags (DO NOW / KEEP / etc.), refreshed quarterly.

CREATE TABLE IF NOT EXISTS linear_priorities (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  priority_order  integer     NOT NULL,
  linear_ref      text        NOT NULL,
  is_project      boolean     NOT NULL DEFAULT false,
  title           text        NOT NULL,
  status          text        NOT NULL DEFAULT '',
  priority        text        NOT NULL DEFAULT '',
  owner           text,
  team            text,
  q2_plan_ref     text,
  action          text        NOT NULL,
  why             text        NOT NULL DEFAULT '',
  next_step       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_order  ON linear_priorities(priority_order);
CREATE INDEX IF NOT EXISTS idx_lp_action ON linear_priorities(action);

-- Idempotent column add for re-runs against existing tables
ALTER TABLE linear_priorities ADD COLUMN IF NOT EXISTS next_step text;
