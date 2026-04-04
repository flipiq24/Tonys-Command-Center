import { pgTable, text, boolean, numeric, integer, jsonb, date, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checkinsTable = pgTable("checkins", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  bedtime: text("bedtime"),
  waketime: text("waketime"),
  sleepHours: numeric("sleep_hours", { precision: 3, scale: 1 }),
  bible: boolean("bible").default(false),
  workout: boolean("workout").default(false),
  journal: boolean("journal").default(false),
  nutrition: text("nutrition"),
  unplug: boolean("unplug").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const journalsTable = pgTable("journals", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  rawText: text("raw_text"),
  formattedText: text("formatted_text"),
  mood: text("mood"),
  keyEvents: text("key_events"),
  reflection: text("reflection"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ideasTable = pgTable("ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  text: text("text").notNull(),
  category: text("category").notNull(),
  urgency: text("urgency").notNull(),
  techType: text("tech_type"),
  priorityPosition: integer("priority_position"),
  status: text("status").default("parked"),
  override: boolean("override").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("ideas_status_idx").on(t.status),
  index("ideas_created_idx").on(t.createdAt),
]);

export const contactsTable = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  status: text("status").default("New"),
  phone: text("phone"),
  email: text("email"),
  type: text("type"),
  title: text("title"),
  nextStep: text("next_step"),
  lastContactDate: date("last_contact_date"),
  notes: text("notes"),
  source: text("source"),
  pipelineStage: text("pipeline_stage").default("Lead"),
  dealValue: numeric("deal_value", { precision: 12, scale: 2 }),
  leadSource: text("lead_source"),
  linkedinUrl: text("linkedin_url"),
  website: text("website"),
  tags: jsonb("tags").$type<string[]>(),
  followUpDate: date("follow_up_date"),
  expectedCloseDate: date("expected_close_date"),
  dealProbability: integer("deal_probability"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("contacts_status_idx").on(t.status),
  index("contacts_name_idx").on(t.name),
  index("contacts_email_idx").on(t.email),
  index("contacts_pipeline_stage_idx").on(t.pipelineStage),
  index("contacts_follow_up_idx").on(t.followUpDate),
]);

export const callLogTable = pgTable("call_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  contactName: text("contact_name").notNull(),
  type: text("type").notNull(),
  notes: text("notes"),
  followUpSent: boolean("follow_up_sent").default(false),
  followUpText: text("follow_up_text"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("call_log_contact_id_idx").on(t.contactId),
  index("call_log_created_idx").on(t.createdAt),
]);

export const contactNotesTable = pgTable("contact_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("contact_notes_contact_id_idx").on(t.contactId),
  index("contact_notes_created_idx").on(t.createdAt),
]);

export const emailTrainingTable = pgTable("email_training", {
  id: uuid("id").defaultRandom().primaryKey(),
  sender: text("sender").notNull(),
  subject: text("subject"),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("email_training_sender_idx").on(t.sender),
]);

export const emailSnoozesTable = pgTable("email_snoozes", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull(),
  emailId: integer("email_id").notNull(),
  snoozeUntil: text("snooze_until").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("email_snoozes_date_idx").on(t.date),
]);

export const dailyBriefsTable = pgTable("daily_briefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  calendarData: jsonb("calendar_data"),
  emailsImportant: jsonb("emails_important"),
  emailsFyi: jsonb("emails_fyi"),
  slackItems: jsonb("slack_items"),
  linearItems: jsonb("linear_items"),
  tasks: jsonb("tasks"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const taskCompletionsTable = pgTable("task_completions", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: text("task_id").notNull(),
  taskText: text("task_text").notNull(),
  completedAt: timestamp("completed_at").defaultNow(),
}, (t) => [
  index("task_completions_task_id_idx").on(t.taskId),
  index("task_completions_completed_idx").on(t.completedAt),
]);

export const demosTable = pgTable("demos", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactName: text("contact_name"),
  scheduledDate: date("scheduled_date"),
  status: text("status").default("scheduled"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("demos_status_idx").on(t.status),
  index("demos_scheduled_idx").on(t.scheduledDate),
]);

export const systemInstructionsTable = pgTable("system_instructions", {
  id: uuid("id").defaultRandom().primaryKey(),
  section: text("section").notNull().unique(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const meetingHistoryTable = pgTable("meeting_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull(),
  contactName: text("contact_name"),
  summary: text("summary"),
  nextSteps: text("next_steps"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("meeting_history_date_idx").on(t.date),
]);

export const eodReportsTable = pgTable("eod_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  callsMade: integer("calls_made").default(0),
  demosBooked: integer("demos_booked").default(0),
  tasksCompleted: integer("tasks_completed").default(0),
  reportText: text("report_text"),
  sentTo: text("sent_to"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const phoneLogTable = pgTable("phone_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  contactName: text("contact_name"),
  phoneNumber: text("phone_number").notNull(),
  type: text("type").notNull(), // 'call_outbound' | 'call_inbound' | 'sms_outbound' | 'sms_inbound'
  durationSeconds: integer("duration_seconds"),
  smsBody: text("sms_body"),
  matched: boolean("matched").default(false),
  loggedAt: timestamp("logged_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("phone_log_phone_number_idx").on(t.phoneNumber),
  index("phone_log_logged_at_idx").on(t.loggedAt),
  index("phone_log_contact_id_idx").on(t.contactId),
]);

export const insertCheckinSchema = createInsertSchema(checkinsTable).omit({ id: true, createdAt: true });
export const insertJournalSchema = createInsertSchema(journalsTable).omit({ id: true, createdAt: true });
export const insertIdeaSchema = createInsertSchema(ideasTable).omit({ id: true, createdAt: true });
export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCallLogSchema = createInsertSchema(callLogTable).omit({ id: true, createdAt: true });
export const insertEmailTrainingSchema = createInsertSchema(emailTrainingTable).omit({ id: true, createdAt: true });
export const insertDailyBriefSchema = createInsertSchema(dailyBriefsTable).omit({ id: true, createdAt: true });
export const insertTaskCompletionSchema = createInsertSchema(taskCompletionsTable).omit({ id: true, completedAt: true });

export type Checkin = typeof checkinsTable.$inferSelect;
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Journal = typeof journalsTable.$inferSelect;
export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type Idea = typeof ideasTable.$inferSelect;
export type InsertIdea = z.infer<typeof insertIdeaSchema>;
export type Contact = typeof contactsTable.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type ContactNote = typeof contactNotesTable.$inferSelect;
export type CallLog = typeof callLogTable.$inferSelect;
export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
export type DailyBrief = typeof dailyBriefsTable.$inferSelect;
export type Demo = typeof demosTable.$inferSelect;
export type EodReport = typeof eodReportsTable.$inferSelect;
export type PhoneLog = typeof phoneLogTable.$inferSelect;
