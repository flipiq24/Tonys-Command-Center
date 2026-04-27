import type { AgentInfo } from "./types";

export const AGENTS: AgentInfo[] = [
  { id: "orchestrator", label: "Command Brain", icon: "\uD83E\uDDE0", description: "General AI assistant", category: "specialist" },
  { id: "email", label: "Email Agent", icon: "\u2709\uFE0F", description: "Send, draft, search emails", category: "specialist" },
  { id: "tasks", label: "Task Agent", icon: "\u2705", description: "Linear tasks & issues", category: "specialist" },
  { id: "contacts", label: "Contacts Agent", icon: "\uD83D\uDC64", description: "CRM & contact research", category: "specialist" },
  { id: "schedule", label: "Schedule Agent", icon: "\uD83D\uDCC5", description: "Calendar & meetings", category: "specialist" },
  { id: "calls", label: "Calls Agent", icon: "\uD83D\uDCDE", description: "Call logging & follow-ups", category: "specialist" },
  { id: "ideas", label: "Ideas Agent", icon: "\uD83D\uDCA1", description: "Capture & prioritize ideas", category: "specialist" },
  { id: "brief", label: "Brief Agent", icon: "\uD83D\uDCCB", description: "Daily brief & EOD report", category: "specialist" },
  { id: "checkin", label: "Check-in Agent", icon: "\u2600\uFE0F", description: "Morning accountability", category: "specialist" },
  { id: "journal", label: "Journal Agent", icon: "\uD83D\uDCD3", description: "Daily journal", category: "specialist" },
  { id: "ingest", label: "Ingest Agent", icon: "\uD83D\uDCC2", description: "Document analysis", category: "specialist" },
  { id: "coach", label: "Coach Agent", icon: "\uD83C\uDFC6", description: "AI training coach", category: "specialist" },
];

export const INTEGRATIONS: AgentInfo[] = [
  { id: "slack", label: "Slack", icon: "\uD83D\uDCAC", description: "Send/read messages, search channels", category: "integration" },
  { id: "linear", label: "Linear", icon: "\uD83D\uDCCC", description: "Create issues, list members", category: "integration" },
  { id: "drive", label: "Google Drive", icon: "\uD83D\uDCC1", description: "Read sheets, docs, search files", category: "integration" },
  { id: "web", label: "Web Search", icon: "\uD83C\uDF10", description: "Browse the web, fetch URLs", category: "integration" },
  { id: "database", label: "Database", icon: "\uD83D\uDDC4\uFE0F", description: "Query tasks, contacts, history", category: "integration" },
];

export const MENTION_ITEMS: AgentInfo[] = [...AGENTS, ...INTEGRATIONS];
