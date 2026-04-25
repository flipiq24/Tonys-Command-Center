import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 5.1 Knowledge store — replaces filesystem .md files at runtime.
// Seeded from ai-outputs/ai-architecture/**/*.md. Coach can only edit kind='memory'.
export const agentMemoryEntriesTable = pgTable("agent_memory_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  agent: text("agent").notNull(),                    // 'email' | 'tasks' | ... | 'coach' | '_shared'
  kind: text("kind").notNull(),                      // 'soul' | 'user' | 'identity' | 'agents' | 'tools' | 'skill' | 'memory'
  sectionName: text("section_name").notNull(),       // e.g. 'tone-preferences', 'reply-draft'
  content: text("content").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),                     // 'seed' | 'tony' | 'coach' | 'developer'
}, (t) => [
  uniqueIndex("agent_memory_entries_unique_idx").on(t.agent, t.kind, t.sectionName),
  index("agent_memory_entries_agent_idx").on(t.agent),
]);

// 5.1b Skill registry — frontmatter parsed from SKILLS/<name>.md files.
// Drives runtime skill lookup: model, max_tokens, declared tools, declared memory_sections.
export const agentSkillsTable = pgTable("agent_skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  agent: text("agent").notNull(),
  skillName: text("skill_name").notNull(),           // e.g. 'reply.draft', 'classify'
  model: text("model").notNull(),                    // e.g. 'claude-haiku-4-5', 'claude-sonnet-4-6'
  maxTokens: integer("max_tokens").notNull().default(1024),
  tools: jsonb("tools").notNull().default(sql`'[]'::jsonb`),                   // string[] of tool names
  memorySections: jsonb("memory_sections").notNull().default(sql`'[]'::jsonb`), // string[] of section_name
  autoExamples: jsonb("auto_examples").notNull().default(sql`'false'::jsonb`),  // boolean — Coach may auto-append examples
  modelOverride: text("model_override"),             // optional dashboard-set override
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("agent_skills_unique_idx").on(t.agent, t.skillName),
  index("agent_skills_agent_idx").on(t.agent),
]);

// 5.1c Tool registry — function-tool definitions parsed from TOOLS.md per agent.
// Bound at runtime: skill declares tool names; runtime resolves to handlers.
export const agentToolsTable = pgTable("agent_tools", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolName: text("tool_name").notNull().unique(),    // e.g. 'get_email_thread'
  agent: text("agent"),                              // owning agent (null = shared)
  description: text("description"),
  inputSchema: jsonb("input_schema").notNull(),      // JSONSchema for Anthropic tool spec
  handlerPath: text("handler_path").notNull(),       // file path relative to artifacts/api-server/src/agents/tools/
  isNative: integer("is_native").notNull().default(0), // 1 = Anthropic native tool (e.g. web_search)
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("agent_tools_agent_idx").on(t.agent),
]);

// 5.2 Captured feedback queue — all 👍/👎 / overrides / reorders / corrections land here.
export const agentFeedbackTable = pgTable("agent_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  agent: text("agent").notNull(),
  skill: text("skill").notNull(),
  sourceType: text("source_type").notNull(),         // 'thumbs' | 'reorder' | 'override' | 'correction' | 'rating' | 'free_text'
  sourceId: text("source_id").notNull(),             // FK-ish to whatever the feedback is about (emailId, taskId, ideaId)
  rating: integer("rating"),                         // 1 | -1 | NULL
  reviewText: text("review_text"),
  contextSnapshot: jsonb("context_snapshot").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }), // NULL until used in a training run
  trainingRunId: uuid("training_run_id"),
  consumedOutcome: text("consumed_outcome"),         // 'proposal_created' | 'no_proposal' | 'noise'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("agent_feedback_agent_idx").on(t.agent),
  index("agent_feedback_skill_idx").on(t.skill),
  // Partial index for "available for training" queries — fast Train modal load.
  index("agent_feedback_unconsumed_idx").on(t.agent, t.createdAt).where(sql`consumed_at IS NULL`),
]);

// 5.3 Each Train-button click — tracks status, prevents double-click via partial unique-ish index.
export const agentTrainingRunsTable = pgTable("agent_training_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agent: text("agent").notNull(),
  startedBy: text("started_by").notNull(),           // user email
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(),                  // 'running' | 'success' | 'failed' | 'no_proposal'
  feedbackIds: uuid("feedback_ids").array().notNull(),
  proposalId: uuid("proposal_id"),                   // 0 or 1 proposal per run
  failureReason: text("failure_reason"),
}, (t) => [
  index("agent_training_runs_agent_idx").on(t.agent),
  // Partial index for "is there an active run for agent X?" — drives Train button disable state.
  index("agent_training_runs_running_idx").on(t.agent).where(sql`status = 'running'`),
]);

// 5.4 Coach output — Git-commit-style bundle of N memory-section diffs. Approved/rejected atomically.
export const agentMemoryProposalsTable = pgTable("agent_memory_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  agent: text("agent").notNull(),
  trainingRunId: uuid("training_run_id").notNull(),
  reason: text("reason").notNull(),                  // one summary across all changes
  diffs: jsonb("diffs").notNull(),                   // [{ section_name, kind, before, after }, ...]
  feedbackIds: uuid("feedback_ids").array().notNull(),
  status: text("status").notNull(),                  // 'pending' | 'approved' | 'rejected'
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
}, (t) => [
  index("agent_memory_proposals_agent_idx").on(t.agent),
  // Partial index for "any pending review?" banner.
  index("agent_memory_proposals_pending_idx").on(t.agent).where(sql`status = 'pending'`),
]);

// 5.5 Per-run cost/latency tracking (extends ai_usage_logs with agent/skill labels).
export const agentRunsTable = pgTable("agent_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agent: text("agent").notNull(),
  skill: text("skill").notNull(),
  caller: text("caller"),                            // 'direct' | 'orchestrator' | 'coach' | 'cron'
  callerThreadId: uuid("caller_thread_id"),          // chat_thread_id when caller='orchestrator'
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  cacheReadTokens: integer("cache_read_tokens").default(0),
  cacheCreationTokens: integer("cache_creation_tokens").default(0),
  costUsd: text("cost_usd"),                         // numeric stored as text to avoid float issues
  durationMs: integer("duration_ms"),
  status: text("status").notNull().default("success"), // 'success' | 'error'
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("agent_runs_agent_idx").on(t.agent),
  index("agent_runs_skill_idx").on(t.skill),
  index("agent_runs_created_idx").on(t.createdAt),
]);
