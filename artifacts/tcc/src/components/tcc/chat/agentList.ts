import type { AgentInfo } from "./types";

/** Available specialists for @-mention in the chat input. */
export const AGENTS: AgentInfo[] = [
  { id: "orchestrator", label: "Command Brain", icon: "\uD83E\uDDE0", description: "General AI assistant" },
  { id: "email", label: "Email Agent", icon: "\u2709\uFE0F", description: "Send, draft, search emails" },
  { id: "tasks", label: "Task Agent", icon: "\u2705", description: "Linear tasks & issues" },
  { id: "contacts", label: "Contacts Agent", icon: "\uD83D\uDC64", description: "CRM & contact research" },
  { id: "schedule", label: "Schedule Agent", icon: "\uD83D\uDCC5", description: "Calendar & meetings" },
  { id: "calls", label: "Calls Agent", icon: "\uD83D\uDCDE", description: "Call logging & follow-ups" },
  { id: "ideas", label: "Ideas Agent", icon: "\uD83D\uDCA1", description: "Capture & prioritize ideas" },
  { id: "brief", label: "Brief Agent", icon: "\uD83D\uDCCB", description: "Daily brief & EOD report" },
  { id: "checkin", label: "Check-in Agent", icon: "\u2600\uFE0F", description: "Morning accountability" },
  { id: "journal", label: "Journal Agent", icon: "\uD83D\uDCD3", description: "Daily journal" },
  { id: "ingest", label: "Ingest Agent", icon: "\uD83D\uDCC2", description: "Document analysis" },
  { id: "coach", label: "Coach Agent", icon: "\uD83C\uDFC6", description: "AI training coach" },
];
