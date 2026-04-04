import { pgTable, uuid, text, numeric, timestamp, date, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { contactsTable } from "./tcc";

export const contactIntelligenceTable = pgTable("contact_intelligence", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contactsTable.id, { onDelete: "cascade" }).unique(),
  aiScore: numeric("ai_score", { precision: 5, scale: 2 }),
  aiScoreReason: text("ai_score_reason"),
  aiTags: text("ai_tags").array(),
  stage: text("stage").default("new"),
  lastAiScan: timestamp("last_ai_scan", { withTimezone: true }),
  linkedinUrl: text("linkedin_url"),
  socialProfiles: jsonb("social_profiles").default("{}"),
  companyInfo: jsonb("company_info").default("{}"),
  personalityNotes: text("personality_notes"),
  totalCalls: integer("total_calls").default(0),
  totalEmailsSent: integer("total_emails_sent").default(0),
  totalEmailsReceived: integer("total_emails_received").default(0),
  totalTexts: integer("total_texts").default(0),
  totalMeetings: integer("total_meetings").default(0),
  lastCommunicationDate: timestamp("last_communication_date", { withTimezone: true }),
  lastCommunicationType: text("last_communication_type"),
  lastCommunicationSummary: text("last_communication_summary"),
  nextAction: text("next_action"),
  nextActionDate: date("next_action_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_ci_contact").on(table.contactId),
  index("idx_ci_score").on(table.aiScore),
]);

export const communicationLogTable = pgTable("communication_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  contactName: text("contact_name"),
  channel: text("channel").notNull(),
  direction: text("direction"),
  subject: text("subject"),
  summary: text("summary"),
  fullContent: text("full_content"),
  sentiment: text("sentiment"),
  actionItems: text("action_items").array(),
  gmailThreadId: text("gmail_thread_id"),
  gmailMessageId: text("gmail_message_id"),
  calendarEventId: text("calendar_event_id"),
  plaudTranscriptPath: text("plaud_transcript_path"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_cl_contact").on(table.contactId),
  index("idx_cl_date").on(table.loggedAt),
  index("idx_cl_channel").on(table.channel),
]);

export const contactBriefsTable = pgTable("contact_briefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contactsTable.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  briefText: text("brief_text").notNull(),
  openTasks: text("open_tasks").array(),
  recentCommunications: jsonb("recent_communications"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_cb_contact").on(table.contactId),
]);

export const businessContextTable = pgTable("business_context", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentType: text("document_type").notNull().unique(),
  content: text("content").notNull(),
  summary: text("summary"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
});

export const dailySuggestionsTable = pgTable("daily_suggestions", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  urgentResponses: jsonb("urgent_responses"),
  followUps: jsonb("follow_ups"),
  top10New: jsonb("top_10_new"),
  pipelineSummary: jsonb("pipeline_summary"),
  teamAlerts: jsonb("team_alerts"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_ds_date").on(table.date),
]);

export const chatThreadsTable = pgTable("chat_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title"),
  contextType: text("context_type").default("general"),
  contextId: text("context_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").references(() => chatThreadsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_cm_thread").on(table.threadId),
  index("idx_cm_created").on(table.createdAt),
]);

export const taskWorkNotesTable = pgTable("task_work_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: text("task_id").notNull(),
  date: date("date").notNull(),
  note: text("note").notNull(),
  progress: integer("progress").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_twn_task").on(table.taskId),
  index("idx_twn_date").on(table.date),
]);

export const localTasksTable = pgTable("local_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  text: text("text").notNull(),
  dueDate: date("due_date"),
  priority: integer("priority").default(50),
  status: text("status").default("active"),
  overrideWarning: text("override_warning"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_lt_status").on(table.status),
  index("idx_lt_due").on(table.dueDate),
]);

export const manualScheduleEventsTable = pgTable("manual_schedule_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull(),
  time: text("time").notNull(),
  timeEnd: text("time_end"),
  title: text("title").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  importance: text("importance").default("mid"),
  person: text("person"),
  contactId: uuid("contact_id"),
  description: text("description"),
  briefing: text("briefing"),
  forcedOverride: integer("forced_override").default(0),
  overrideReason: text("override_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_mse_date").on(table.date),
]);
