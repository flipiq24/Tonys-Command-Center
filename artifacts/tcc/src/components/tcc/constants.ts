export const F = "'Instrument Sans','DM Sans',-apple-system,sans-serif";
export const FS = "'Instrument Serif','DM Serif Display',Georgia,serif";
export const C = {
  bg: "#F7F6F3", card: "#FFF", brd: "#E8E6E1", tx: "#1A1A1A",
  sub: "#6B6B6B", mut: "#A3A3A3", red: "#C62828", grn: "#2E7D32",
  amb: "#E65100", blu: "#1565C0", redBg: "#FFEBEE", grnBg: "#E8F5E9",
  ambBg: "#FFF3E0", bluBg: "#E3F2FD",
};
export const SC: Record<string, string> = { Hot: C.red, Warm: C.amb, New: C.blu, Cold: C.mut };

export const PIPELINE_STAGES = ["Lead", "Qualified", "Demo Scheduled", "Proposal Sent", "Negotiation", "Closed Won", "Closed Lost"] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];
export const PC: Record<string, string> = {
  "Lead": "#607D8B",
  "Qualified": C.blu,
  "Demo Scheduled": "#7B1FA2",
  "Proposal Sent": C.amb,
  "Negotiation": "#E65100",
  "Closed Won": C.grn,
  "Closed Lost": C.mut,
};
export const PCBg: Record<string, string> = {
  "Lead": "#ECEFF1",
  "Qualified": C.bluBg,
  "Demo Scheduled": "#F3E5F5",
  "Proposal Sent": C.ambBg,
  "Negotiation": "#FBE9E7",
  "Closed Won": C.grnBg,
  "Closed Lost": "#F5F5F5",
};

export const LEAD_SOURCES = ["LinkedIn", "Referral", "Cold Outreach", "Event", "Website", "Partner", "Other"] as const;
export const STATUS_OPTIONS = ["Hot", "Warm", "New", "Cold"] as const;

export const TIPS: Record<string, string> = {
  checkin: "Morning gate. System locked until done. Bedtime, wake, Bible, workout, journal, nutrition, unplug. Saved to database.",
  journal: "Brain dump. Auto-formats: Mood, Key Events, Reflection. Saved to database.",
  ideas: "Capture ideas. Auto-prioritizes against business plan. Tech → Slack notification.",
  gmail: "Important Emails with reply/snooze/train. FYI (no reply). Badge shows unresolved.",
  snooze: "Removes email until chosen time. Restored from DB on next load.",
  suggestReply: "AI drafts reply in Tony's voice. You approve and copy.",
  attempt: "Log call attempt. Give follow-up instructions. AI drafts email.",
  connected: "Log outcome, notes, next step, follow-up.",
  eod: "Generate EOD report and send to tony@flipiq.com and ethan@flipiq.com.",
  chat: "Open AI chat for any question or request.",
};

export const TODAY_STR = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

export const card: React.CSSProperties = { background: C.card, borderRadius: 14, padding: "20px 24px", border: `1px solid ${C.brd}` };
export const inp: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 10, border: `2px solid ${C.brd}`, fontSize: 15, fontFamily: F, boxSizing: "border-box", outline: "none" };
export const btn1: React.CSSProperties = { padding: "14px 28px", background: C.tx, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F };
export const btn2: React.CSSProperties = { padding: "10px 18px", background: C.card, color: C.tx, border: `2px solid ${C.brd}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F };
export const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 };
