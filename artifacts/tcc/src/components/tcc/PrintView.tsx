import { C, F, FS } from "./constants";
import type { TaskItem, CalItem, EmailItem, SlackItem, LinearItem } from "./types";

interface Props {
  tasks: TaskItem[];
  tDone: Record<string, boolean>;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  slackItems?: SlackItem[];
  linearItems?: LinearItem[];
  topCallContacts?: { name: string; phone?: string; company?: string; nextStep?: string }[];
  onClose: () => void;
}

export function PrintView({ tasks, tDone, calendarData, emailsImportant, slackItems = [], linearItems = [], topCallContacts = [], onClose }: Props) {
  const topTasks = tasks.filter(t => !tDone[t.id]).slice(0, 3);
  const realMeetings = calendarData.filter(c => c.real);
  const callList = topCallContacts.slice(0, 10);
  const topEmails = emailsImportant.slice(0, 5);
  const highSlack = slackItems.filter(s => s.level === "high" || s.level === "mid").slice(0, 5);
  const activeLinear = linearItems.slice(0, 6);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.card, borderRadius: 16, maxWidth: 780, width: "95vw", maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>

        {/* ── Toolbar ────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${C.brd}` }}>
          <div style={{ fontFamily: FS, fontSize: 17 }}>🖨 Print Preview — {today}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => window.print()} style={{ padding: "8px 20px", background: C.tx, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: F, fontSize: 13, fontWeight: 700 }}>
              Print
            </button>
            <button onClick={onClose} style={{ padding: "8px 16px", background: "none", border: `1px solid ${C.brd}`, borderRadius: 8, cursor: "pointer", fontFamily: F, fontSize: 13, color: C.mut }}>
              Close
            </button>
          </div>
        </div>

        <div style={{ padding: "24px 28px" }} className="print-area">

          {/* ══════════════ FRONT PAGE ══════════════ */}
          <div style={{ borderBottom: `3px dashed ${C.brd}`, paddingBottom: 28, marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ fontFamily: FS, fontSize: 22, fontWeight: 700 }}>FRONT</div>
              <div style={{ flex: 1, height: 1, background: C.brd }} />
              <div style={{ fontSize: 12, color: C.mut, fontFamily: F }}>Carry this side all day</div>
            </div>

            {/* Top 3 Focus */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.grn, marginBottom: 10 }}>★ TOP 3 FOCUS TASKS</div>
              {topTasks.length === 0 ? (
                <div style={{ fontSize: 13, color: C.mut, fontStyle: "italic" }}>All tasks complete — great work!</div>
              ) : topTasks.map((t, i) => (
                <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, border: `2px solid ${C.tx}`, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{i + 1}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{t.text}</div>
                  <div style={{ fontSize: 10, color: t.cat === "SALES" ? C.grn : t.cat === "TECH" ? "#7B1FA2" : C.amb, fontWeight: 700, marginLeft: "auto", flexShrink: 0 }}>{t.cat}</div>
                </div>
              ))}
              {/* Fill remaining slots */}
              {Array.from({ length: Math.max(0, 3 - topTasks.length) }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, border: `2px dashed ${C.brd}`, borderRadius: 4, flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: C.mut, fontStyle: "italic" }}>—</div>
                </div>
              ))}
            </div>

            {/* 10 Sales Calls */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.red, marginBottom: 10 }}>📞 10 SALES CALLS TODAY</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
                {callList.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "6px 0", borderBottom: `1px solid ${C.brd}` }}>
                    <div style={{ fontSize: 11, color: C.mut, fontWeight: 700, flexShrink: 0, width: 16 }}>{i + 1}.</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: C.blu, fontWeight: 600 }}>{c.phone || "—"}</div>
                      {c.nextStep && <div style={{ fontSize: 10, color: C.mut }}>{c.nextStep}</div>}
                    </div>
                    <div style={{ marginLeft: "auto", width: 14, height: 14, border: `1.5px solid ${C.brd}`, borderRadius: 3, flexShrink: 0 }} />
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 10 - callList.length) }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.brd}` }}>
                    <div style={{ fontSize: 11, color: C.mut, fontWeight: 700, flexShrink: 0, width: 16 }}>{callList.length + i + 1}.</div>
                    <div style={{ flex: 1, height: 1, background: C.brd }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Today's Meetings */}
            {realMeetings.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.blu, marginBottom: 10 }}>📅 TODAY'S MEETINGS</div>
                {realMeetings.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.blu, flexShrink: 0, width: 70 }}>{m.t}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{m.n}</div>
                    {m.loc && <div style={{ fontSize: 11, color: C.mut, flexShrink: 0 }}>{m.loc}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ══════════════ BACK PAGE ══════════════ */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ fontFamily: FS, fontSize: 22, fontWeight: 700 }}>BACK</div>
              <div style={{ flex: 1, height: 1, background: C.brd }} />
              <div style={{ fontSize: 12, color: C.mut, fontFamily: F }}>Reference when you need context</div>
            </div>

            {/* Important Emails */}
            {topEmails.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.amb, marginBottom: 10 }}>📧 EMAILS NEEDING RESPONSE</div>
                {topEmails.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.brd}` }}>
                    <div style={{ fontSize: 11, color: C.mut, flexShrink: 0, width: 16, paddingTop: 1 }}>{i + 1}.</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{e.from}</div>
                      <div style={{ fontSize: 12, color: C.sub }}>{e.subj}</div>
                      <div style={{ fontSize: 11, color: C.mut }}>{e.why}</div>
                    </div>
                    <div style={{ width: 14, height: 14, border: `1.5px solid ${C.brd}`, borderRadius: 3, flexShrink: 0, marginTop: 3 }} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Slack */}
              {highSlack.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: "#7C3AED", marginBottom: 10 }}>💬 SLACK ITEMS</div>
                  {highSlack.map((s, i) => (
                    <div key={i} style={{ marginBottom: 8, padding: "6px 0", borderBottom: `1px solid ${C.brd}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{s.from} <span style={{ color: C.mut, fontWeight: 400, fontSize: 11 }}>{s.channel}</span></div>
                      <div style={{ fontSize: 11, color: C.sub }}>{s.message.slice(0, 80)}{s.message.length > 80 ? "…" : ""}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Linear */}
              {activeLinear.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: "#2563EB", marginBottom: 10 }}>⚡ LINEAR — DEV TODAY</div>
                  {activeLinear.map((l, i) => (
                    <div key={i} style={{ marginBottom: 8, padding: "6px 0", borderBottom: `1px solid ${C.brd}` }}>
                      <div style={{ fontSize: 10, color: C.blu, fontWeight: 700, marginBottom: 1 }}>{l.id}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{l.who}: {l.task}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(.print-area) { display: none !important; }
          .print-area { display: block !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
