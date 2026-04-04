import React, { useState, useEffect, useCallback } from "react";
import { F, FS } from "./constants";
import { get } from "@/lib/api";
import type { TaskItem, CalItem, EmailItem, SlackItem, LinearItem } from "./types";

interface LocalTask { id: string; text: string; dueDate?: string | null; priority?: number | null; }
interface Contact { name: string; phone?: string; company?: string; nextStep?: string; status?: string; }

interface Props {
  tasks: TaskItem[];
  tDone: Record<string, boolean>;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  slackItems?: SlackItem[];
  linearItems?: LinearItem[];
  topCallContacts?: Contact[];
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}

const DATE_STR = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// ── Shared palette ──
const BLK = "#111";
const BORDER = "1px solid #bbb";
const HEAVY = "2px solid #222";
const HDR_BG = "#F2F2F2";
const PAGE_W = 760;

// ── Checkbox ──
function CB({ id, done, onToggle }: { id: string; done: boolean; onToggle: (id: string) => void }) {
  return (
    <div
      onClick={() => onToggle(id)}
      title="Click to check off"
      style={{
        width: 14, height: 14, border: done ? "2px solid #111" : "1.5px solid #888",
        borderRadius: 2, background: done ? "#111" : "#fff", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        transition: "all 0.1s",
      }}
    >
      {done && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1, fontWeight: 900 }}>✓</span>}
    </div>
  );
}

// ── Table header cell ──
function TH({ children, w, center }: { children: React.ReactNode; w?: number | string; center?: boolean }) {
  return (
    <th style={{
      fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8,
      color: "#444", padding: "4px 6px", textAlign: center ? "center" : "left",
      background: HDR_BG, borderBottom: HEAVY, whiteSpace: "nowrap",
      width: w !== undefined ? (typeof w === "number" ? w : w) : undefined,
    }}>{children}</th>
  );
}

// ── Table data cell ──
function TD({ children, center, bold, small, dim, strike }: {
  children?: React.ReactNode; center?: boolean; bold?: boolean;
  small?: boolean; dim?: boolean; strike?: boolean;
}) {
  return (
    <td style={{
      fontSize: small ? 9 : 11, fontWeight: bold ? 700 : 400,
      color: dim ? "#999" : BLK, padding: "5px 6px",
      textAlign: center ? "center" : "left",
      textDecoration: strike ? "line-through" : "none",
      borderBottom: "1px solid #E8E8E8", verticalAlign: "top",
    }}>{children}</td>
  );
}

// ── Section label ──
function SL({ text, color = "#444" }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.5,
      color, marginBottom: 4, marginTop: 14,
    }}>{text}</div>
  );
}

// ── Page wrapper (both screen + print) ──
function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      background: "#fff",
      width: PAGE_W, minHeight: 980,
      boxShadow: "0 6px 32px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.2)",
      borderRadius: 3, overflow: "hidden", flexShrink: 0, fontFamily: F,
      fontSize: 11, color: BLK,
    }}>
      {children}
    </div>
  );
}

// ── Page header ──
function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{
      padding: "12px 18px 10px", borderBottom: HEAVY,
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div>
        <div style={{ fontFamily: FS, fontSize: 18, fontWeight: 900, letterSpacing: 1, color: BLK }}>{title}</div>
        <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{DATE_STR}</div>
      </div>
      <div style={{ fontSize: 9, color: "#888", fontStyle: "italic", textAlign: "right", maxWidth: 280 }}>
        "{sub}"
      </div>
    </div>
  );
}

export function PrintView({ tasks, tDone, calendarData, emailsImportant, linearItems = [], topCallContacts = [], onClose, onRefresh }: Props) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const toggle = useCallback((id: string) => {
    setDone(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    get<LocalTask[]>("/tasks/local").then(setLocalTasks).catch(() => {});
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
      const fresh = await get<LocalTask[]>("/tasks/local");
      setLocalTasks(fresh);
    } catch { /* ok */ } finally { setRefreshing(false); }
  };

  const ck = (id: string) => done.has(id);

  // Data prep
  const top3 = tasks.filter(t => !tDone[t.id]).slice(0, 3);
  const callList = topCallContacts.slice(0, 10);
  const meetings = calendarData.filter(c => c.real);
  const emails = emailsImportant.slice(0, 6);
  const activeLocals = localTasks.slice(0, 8);
  const linActive = linearItems.slice(0, 8);
  const linHigh = linearItems.filter(l => l.level === "high").slice(0, 4);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 20000, background: "#1C1C1E",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 24px", background: "#111", borderBottom: "1px solid #2a2a2a", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FS, fontSize: 15, color: "#fff", fontWeight: 800, letterSpacing: 0.5 }}>
            FlipIQ Daily Action Sheet
          </div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 1 }}>{DATE_STR}</div>
        </div>
        <Btn label={refreshing ? "Refreshing…" : "↻ Refresh"} onClick={handleRefresh} disabled={refreshing} dim />
        <Btn label="🖨 Print" onClick={() => window.print()} primary />
        <Btn label="✕ Close" onClick={onClose} dim />
      </div>

      {/* ── Scrollable sheets area ── */}
      <div style={{
        flex: 1, overflow: "auto",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "32px 24px 48px", gap: 40,
      }} className="no-print">

        {/* ════ FRONT ════ */}
        <label style={{ fontSize: 9, color: "#666", letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", fontFamily: F, alignSelf: "flex-start", marginLeft: `calc(50% - ${PAGE_W / 2}px)` }}>PAGE 1 — FRONT</label>
        <Page className="print-front">
          <PageHeader title="FLIPIQ DAILY ACTION SHEET" sub="Follow the plan that I gave you! — God" />
          <div style={{ padding: "14px 18px" }}>

            {/* TOP 3 */}
            <SL text="★ Top 3 — Do These First" color="#B7791F" />
            <div style={{ marginBottom: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => {
                const t = top3[i];
                const id = t ? `top3-${t.id}` : `top3-blank-${i}`;
                return (
                  <div key={id} style={{
                    display: "flex", gap: 8, alignItems: "flex-start",
                    padding: "7px 8px", borderBottom: "1px solid #E8E8E8",
                    background: i === 0 ? "#FFFBF2" : "#fff",
                  }}>
                    <CB id={id} done={ck(id)} onToggle={toggle} />
                    <div style={{
                      width: 18, height: 18, background: i === 0 ? BLK : "#E0E0E0",
                      color: i === 0 ? "#fff" : "#888", borderRadius: 3,
                      fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center",
                      justifyContent: "center", flexShrink: 0,
                    }}>{i + 1}</div>
                    {t ? (
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 12, fontWeight: i === 0 ? 700 : 600,
                          color: ck(id) ? "#bbb" : BLK,
                          textDecoration: ck(id) ? "line-through" : "none",
                        }}>{t.text}</div>
                        {t.cat && <div style={{ fontSize: 9, color: "#999", marginTop: 1 }}>{t.cat}</div>}
                      </div>
                    ) : (
                      <div style={{ flex: 1, height: 1, background: "#E8E8E8", marginTop: 8 }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* My Tasks */}
            {activeLocals.length > 0 && (
              <>
                <SL text="My Tasks" color="#555" />
                <div style={{ marginBottom: 10 }}>
                  {activeLocals.map(t => {
                    const id = `local-${t.id}`;
                    return (
                      <div key={id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 8px", borderBottom: "1px solid #E8E8E8" }}>
                        <CB id={id} done={ck(id)} onToggle={toggle} />
                        <div style={{ flex: 1, fontSize: 11, color: ck(id) ? "#bbb" : BLK, textDecoration: ck(id) ? "line-through" : "none" }}>{t.text}</div>
                        {t.dueDate && <div style={{ fontSize: 9, color: "#999", flexShrink: 0 }}>Due {new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* SALES CALLS + APPOINTMENTS side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>

              {/* Sales Calls */}
              <div>
                <SL text="📞 Sales Calls" color="#C62828" />
                <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
                  <thead>
                    <tr>
                      <TH w={22} center>✓</TH>
                      <TH w={20} center>#</TH>
                      <TH>NAME / COMPANY</TH>
                      <TH w={88}>PHONE</TH>
                      <TH w={44}>STATUS</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const c = callList[i];
                      const id = `call-${i}`;
                      const done2 = ck(id);
                      return (
                        <tr key={id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                          <TD center><CB id={id} done={done2} onToggle={toggle} /></TD>
                          <TD center small dim>{i + 1}</TD>
                          {c ? (
                            <>
                              <TD strike={done2}><div style={{ fontWeight: 600, fontSize: 10, color: done2 ? "#bbb" : BLK }}>{c.name}</div>{c.company && <div style={{ fontSize: 8, color: "#888" }}>{c.company}</div>}</TD>
                              <TD small>{c.phone || "—"}</TD>
                              <TD center small bold><span style={{ color: c.status === "Hot" ? "#C62828" : c.status === "Warm" ? "#E65100" : "#555" }}>{c.status || "—"}</span></TD>
                            </>
                          ) : (
                            <><TD /><TD /><TD /></>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Appointments */}
              <div>
                <SL text="📅 Today's Appointments" color="#1565C0" />
                <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
                  <thead>
                    <tr>
                      <TH w={22} center>✓</TH>
                      <TH w={58}>TIME</TH>
                      <TH>TOPIC</TH>
                      <TH w={80}>PREP/NOTES</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {meetings.length === 0 && (
                      <tr><td colSpan={4} style={{ padding: "8px 6px", fontSize: 10, color: "#bbb", fontStyle: "italic", textAlign: "center" }}>No meetings today</td></tr>
                    )}
                    {meetings.map((m, i) => {
                      const id = `meet-${i}`;
                      const done2 = ck(id);
                      return (
                        <tr key={id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                          <TD center><CB id={id} done={done2} onToggle={toggle} /></TD>
                          <TD small bold>{m.t}{m.tEnd ? `–${m.tEnd}` : ""}</TD>
                          <TD strike={done2}>{m.n}</TD>
                          <TD small dim>{m.loc || m.note || ""}</TD>
                        </tr>
                      );
                    })}
                    {Array.from({ length: Math.max(0, 5 - meetings.length) }).map((_, i) => (
                      <tr key={`meetblank-${i}`} style={{ background: (meetings.length + i) % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                        <TD center><CB id={`meetblank-${i}`} done={ck(`meetblank-${i}`)} onToggle={toggle} /></TD>
                        <TD /><TD /><TD />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Priority Emails */}
            <SL text="📧 Priority Emails" color="#E65100" />
            <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
              <thead>
                <tr>
                  <TH w={22} center>✓</TH>
                  <TH w={130}>FROM</TH>
                  <TH>SUBJECT</TH>
                  <TH w={120}>WHY</TH>
                  <TH w={90}>ACTION</TH>
                </tr>
              </thead>
              <tbody>
                {emails.map((e, i) => {
                  const id = `email-${i}`;
                  const done2 = ck(id);
                  return (
                    <tr key={id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                      <TD center><CB id={id} done={done2} onToggle={toggle} /></TD>
                      <TD bold strike={done2}>{e.from}</TD>
                      <TD strike={done2} small>{e.subj}</TD>
                      <TD small dim>{e.why || ""}</TD>
                      <TD small bold><span style={{ color: "#1565C0" }}>{e.p || "—"}</span></TD>
                    </tr>
                  );
                })}
                {Array.from({ length: Math.max(0, 4 - emails.length) }).map((_, i) => (
                  <tr key={`emailblank-${i}`} style={{ background: (emails.length + i) % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <TD center><CB id={`emailblank-${i}`} done={ck(`emailblank-${i}`)} onToggle={toggle} /></TD>
                    <TD /><TD /><TD /><TD />
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        </Page>

        {/* ════ BACK ════ */}
        <label style={{ fontSize: 9, color: "#666", letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", fontFamily: F, alignSelf: "flex-start", marginLeft: `calc(50% - ${PAGE_W / 2}px)` }}>PAGE 2 — BACK</label>
        <Page className="print-back">
          <PageHeader title="OPERATIONS & AWARENESS" sub="North Star: 2 deals/month/AA @ $2,500 per acquisition. Everything else is noise." />
          <div style={{ padding: "14px 18px" }}>

            {/* Linear — Engineering in Progress */}
            <SL text="⚡ Linear — Engineering in Progress" color="#2563EB" />
            <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER, marginBottom: 14 }}>
              <thead>
                <tr>
                  <TH w={22} center>✓</TH>
                  <TH w={70}>ID</TH>
                  <TH>TASK</TH>
                  <TH w={80}>OWNER</TH>
                  <TH w={80}>STATUS</TH>
                </tr>
              </thead>
              <tbody>
                {linActive.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "8px 6px", fontSize: 10, color: "#bbb", fontStyle: "italic", textAlign: "center" }}>No active Linear issues</td></tr>
                )}
                {linActive.map((l, i) => {
                  const id = `linear-${i}`;
                  const done2 = ck(id);
                  const isHigh = l.level === "high";
                  return (
                    <tr key={id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                      <TD center><CB id={id} done={done2} onToggle={toggle} /></TD>
                      <TD small bold><span style={{ color: "#2563EB" }}>{l.id}</span></TD>
                      <TD strike={done2}>{l.task}</TD>
                      <TD small>{l.who || "—"}</TD>
                      <TD small><span style={{ color: isHigh ? "#C62828" : l.level === "mid" ? "#E65100" : "#555", fontWeight: isHigh ? 700 : 400 }}>{isHigh ? "🔴 High" : l.level === "mid" ? "⚠ Mid" : "Low"}</span></TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Flags & Blockers */}
              <div>
                <SL text="⚠ Flags & Blockers" color="#C62828" />
                <div style={{ border: BORDER, borderRadius: 2, overflow: "hidden" }}>
                  {linHigh.length === 0 && (
                    <div style={{ padding: "8px 10px", fontSize: 10, color: "#bbb", fontStyle: "italic" }}>No high-priority flags 🎉</div>
                  )}
                  {linHigh.map((l, i) => (
                    <div key={i} style={{ padding: "7px 10px", borderBottom: i < linHigh.length - 1 ? "1px solid #E8E8E8" : "none", background: "#FFF5F5" }}>
                      <div style={{ fontSize: 9, color: "#2563EB", fontWeight: 700 }}>{l.id}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#C62828" }}>{l.task}</div>
                    </div>
                  ))}
                  {/* Extra warning lines */}
                  {Array.from({ length: Math.max(0, 3 - linHigh.length) }).map((_, i) => (
                    <div key={i} style={{ padding: "7px 10px", borderTop: "1px solid #E8E8E8", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "#E65100" }}>⚠</span>
                      <div style={{ flex: 1, height: 1, background: "#E8E8E8" }} />
                    </div>
                  ))}
                </div>

                {/* Soft Sequence / Next Up */}
                <SL text="○ Soft Sequence — Next Up" color="#555" />
                {[1, 2, 3].map(n => (
                  <div key={n} style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #EBEBEB" }}>
                    <div style={{ width: 14, height: 14, border: "1.5px solid #ccc", borderRadius: "50%", flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 1, background: "#E8E8E8" }} />
                  </div>
                ))}
              </div>

              {/* Today's Win + Notes */}
              <div>
                <SL text="🏆 Today's Win" color="#B7791F" />
                <div style={{ border: BORDER, borderRadius: 2, padding: "8px 10px", background: "#FFFBF2", marginBottom: 8 }}>
                  {[1, 2, 3].map(n => (
                    <div key={n} style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 0", borderBottom: n < 3 ? "1px solid #EBEBEB" : "none" }}>
                      <span style={{ fontSize: 10, color: "#B7791F", fontWeight: 700, width: 12 }}>{n}.</span>
                      <div style={{ flex: 1, height: 1, background: "#E8E8E8" }} />
                    </div>
                  ))}
                </div>

                <SL text="📝 Scratch Notes" color="#555" />
                <div style={{ border: BORDER, borderRadius: 2, padding: "8px 10px" }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ height: 20, borderBottom: "1px solid #E8E8E8" }} />
                  ))}
                </div>

                {/* North Star */}
                <div style={{
                  marginTop: 12, padding: "10px 12px",
                  background: "#F8F8F6", border: "1.5px solid #222", borderRadius: 3,
                }}>
                  <div style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 4 }}>TODAY'S REMINDER</div>
                  <div style={{ fontSize: 10, color: "#333", fontStyle: "italic", fontWeight: 600, lineHeight: 1.5 }}>
                    "Follow the plan that I gave you!" — God
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Page>

        <div style={{ fontSize: 10, color: "#555", fontFamily: F, textAlign: "center", paddingBottom: 8 }}>
          Print → Portrait · Letter · 2 pages (front &amp; back of one sheet)
        </div>
      </div>

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body > * { display: none !important; }
          .print-front, .print-back { display: block !important; }
          .print-front {
            position: fixed; top: 0; left: 0; width: 100vw; min-height: 100vh;
            box-shadow: none !important; border-radius: 0 !important;
            page-break-after: always;
          }
          .print-back {
            position: fixed; top: 0; left: 0; width: 100vw; min-height: 100vh;
            box-shadow: none !important; border-radius: 0 !important;
          }
        }
        @page { size: letter portrait; margin: 0.4in; }
      `}</style>
    </div>
  );
}

// ── Toolbar button ──
function Btn({ label, onClick, disabled, primary, dim }: {
  label: string; onClick: () => void; disabled?: boolean; primary?: boolean; dim?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: disabled ? "default" : "pointer",
      border: primary ? "none" : "1px solid #333",
      background: primary ? "#fff" : "none",
      color: disabled ? "#555" : primary ? "#111" : dim ? "#999" : "#eee",
      fontFamily: F, opacity: disabled ? 0.5 : 1, flexShrink: 0,
    }}>{label}</button>
  );
}
