/** Maps tool names to human-readable specialist labels for the streaming UI. */
export const TOOL_AGENT_MAP: Record<string, string> = {
  // Email
  send_email: "Email Specialist",
  compose_email: "Email Specialist",
  list_recent_emails: "Email Specialist",
  draft_gmail_reply: "Email Specialist",
  get_email_brain: "Email Specialist",
  search_emails: "Email Specialist",
  read_email_thread: "Email Specialist",
  read_email_message: "Email Specialist",

  // Slack
  send_slack_message: "Slack Agent",
  read_slack_channel: "Slack Agent",
  list_slack_channels: "Slack Agent",
  search_slack: "Slack Agent",

  // Linear / Tasks
  create_linear_issue: "Task Agent",
  create_task: "Task Agent",
  get_all_tasks: "Task Agent",
  get_linear_members: "Task Agent",

  // Calendar / Schedule
  schedule_meeting: "Schedule Agent",
  get_today_calendar: "Schedule Agent",
  create_calendar_event: "Schedule Agent",
  get_calendar_range: "Schedule Agent",
  create_calendar_reminder: "Schedule Agent",
  update_calendar_event: "Schedule Agent",
  delete_calendar_event: "Schedule Agent",

  // Contacts
  research_contact: "Contacts Specialist",
  update_contact_stage: "Contacts Specialist",
  search_contacts: "Contacts Specialist",
  get_contact_brief: "Contacts Specialist",
  get_communication_log: "Contacts Specialist",

  // Drive
  search_drive: "Drive Agent",
  search_google_drive: "Drive Agent",
  read_google_sheet: "Drive Agent",
  read_google_doc: "Drive Agent",

  // Reports
  send_eod_report: "Brief Agent",

  // Business context
  get_business_context: "Business Intelligence",
  get_daily_checkin_history: "Check-in Agent",
  get_411_plan: "Business Intelligence",
  get_team_roster: "Business Intelligence",
  update_goal_status: "Business Intelligence",

  // Meetings
  get_meeting_history: "Meeting Agent",
  log_meeting_context: "Meeting Agent",
  analyze_transcript: "Meeting Agent",

  // Web
  web_search: "Web Search",
  browse_url: "Web Search",

  // DB
  query_database: "Database Agent",
};

/** Returns the specialist label for a tool, or "Command Brain" if unknown. */
export function getAgentForTool(toolName: string): string {
  return TOOL_AGENT_MAP[toolName] || "Command Brain";
}
