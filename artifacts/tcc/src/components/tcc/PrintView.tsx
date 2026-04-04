import React, { useState, useEffect, useCallback } from "react";
import { C, F, FS } from "./constants";
import { get } from "@/lib/api";
import type { TaskItem, CalItem, EmailItem, SlackItem, LinearItem } from "./types";

interface LocalTask { id: string; text: string; dueDate?: string | null; priority?: number | null; }

interface Props {
  tasks: TaskItem[];
  tDone: Record<string, boolean>;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  slackItems?: SlackItem[];
  linearItems?: LinearItem[];
  topCallContacts?: { name: string; phone?: string; company?: string; nextStep?: string }[];
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}

const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function CheckBox({ id, checked, onToggle }: { id: string; checked: boolean; onToggle: (id: string) => void }) {
  return (
    <div
      onClick={() => onToggle(id)}
      style={{
        width: 18, height: 18, borderRadius: 3, flexShrink: 0, marginTop: 1, cursor: "pointer",
        border: checked ? "2px solid #222" : "1.5px solid #aaa",
        background: checked ? "#222" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.12s",
      }}
    >
      {checked && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1, fontWeight: 800 }}>✓</span>}
    </div>
  );
}

function SectionLabel({ text, color = "#666" }: { text: string; color?: string }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color, marginBottom: 7 }}>
      {text}
    </div>
  );
}

const LINE: React.CSSProperties = { height: 1, background: "#E8E8E8", margin: "5px 0" };
const DIVIDER = <div style={LINE} />;

export function PrintView({ tasks, tDone, calendarData, emailsImportant, slackItems = [], linearItems = [], topCallContacts = [], onClose, onRefresh }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const toggle = useCallback((id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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
    } catch { /* ok */ } finally {
      setRefreshing(false);
    }
  };

  const topTasks = tasks.filter(t => !tDone[t.id]).slice(0, 3);
  const activeLocals = localTasks.filter(t => t.priority !== undefined).slice(0, 6);
  const realMeetings = calendarData.filter(c => c.real);
  const callList = topCallContacts.slice(0, 10);
  const topEmails = emailsImportant.slice(0, 5);

  const isChecked = (id: string) => checked.has(id);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 20000,
        background: "#1C1C1E",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 24px", background: "#111", borderBottom: "1px solid #333", flexShrink: 0,
      }}>
        <div style={{ fontFamily: FS, fontSize: 16, color: "#fff", fontWeight: 700, flex: 1 }}>
          Daily Sheet — <span style={{ fontWeight: 400, color: "#aaa" }}>{today}</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: "7px 16px", fontSize: 12, fontWeight: 700, border: "1px solid #444",
            borderRadius: 8, background: "none", color: refreshing ? "#666" : "#aaa",
            cursor: refreshing ? "default" : "pointer", fontFamily: F, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 14 }}>↻</span>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button
          onClick={() => window.print()}
          style={{
            padding: "7px 20px", fontSize: 12, fontWeight: 700, border: "none",
            borderRadius: 8, background: "#fff", color: "#111",
            cursor: "pointer", fontFamily: F,
          }}
        >
          🖨 Print
        </button>
        <button
          onClick={onClose}
          style={{
            padding: "7px 16px", fontSize: 12, fontWeight: 700, border: "1px solid #444",
            borderRadius: 8, background: "none", color: "#aaa",
            cursor: "pointer", fontFamily: F,
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* ── Sheets area ── */}
      <div style={{
        flex: 1, overflow: "auto",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "32px 20px 40px", gap: 32,
      }} className="no-print">
        {/* FRONT */}
        <Sheet label="FRONT" sub="Carry this side all day">
          {/* ★ Today's Focus */}
          <section style={{ marginBottom: 14 }}>
            <SectionLabel text="★ Top Focus Tasks" color={C.grn} />
            {topTasks.map((t, i) => (
              <TaskRow
                key={t.id}
                id={`focus-${t.id}`}
                label={t.text}
                sub={t.cat}
                num={i + 1}
                checked={isChecked(`focus-${t.id}`)}
                onToggle={toggle}
                highlight={t.cat === "SALES"}
              />
            ))}
            {Array.from({ length: Math.max(0, 3 - topTasks.length) }).map((_, i) => (
              <BlankRow key={i} num={topTasks.length + i + 1} />
            ))}
          </section>

          {DIVIDER}

          {/* My Tasks */}
          {activeLocals.length > 0 && (
            <section style={{ marginBottom: 14 }}>
              <SectionLabel text="My Tasks" color="#555" />
              {activeLocals.map(t => (
                <TaskRow
                  key={t.id}
                  id={`local-${t.id}`}
                  label={t.text}
                  sub={t.dueDate ? new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : undefined}
                  checked={isChecked(`local-${t.id}`)}
                  onToggle={toggle}
                />
              ))}
            </section>
          )}

          {activeLocals.length > 0 && DIVIDER}

          {/* 10 Sales Calls */}
          <section style={{ marginBottom: 14 }}>
            <SectionLabel text="📞 10 Sales Calls" color={C.red} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
              {callList.map((c, i) => (
                <CallRow
                  key={i}
                  id={`call-${i}`}
                  num={i + 1}
                  name={c.name}
                  phone={c.phone}
                  checked={isChecked(`call-${i}`)}
                  onToggle={toggle}
                />
              ))}
              {Array.from({ length: Math.max(0, 10 - callList.length) }).map((_, i) => (
                <CallRow
                  key={`blank-${i}`}
                  id={`callblank-${i}`}
                  num={callList.length + i + 1}
                  name=""
                  checked={isChecked(`callblank-${i}`)}
                  onToggle={toggle}
                />
              ))}
            </div>
          </section>

          {DIVIDER}

          {/* Meetings */}
          <section>
            <SectionLabel text="📅 Today's Schedule" color={C.blu} />
            {realMeetings.length === 0 && (
              <div style={{ fontSize: 11, color: "#bbb", fontStyle: "italic" }}>No meetings today</div>
            )}
            {realMeetings.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.blu, flexShrink: 0, width: 56 }}>{m.t}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: isChecked(`meet-${i}`) ? "#bbb" : "#222", flex: 1, textDecoration: isChecked(`meet-${i}`) ? "line-through" : "none" }}>{m.n}</span>
                <CheckBox id={`meet-${i}`} checked={isChecked(`meet-${i}`)} onToggle={toggle} />
              </div>
            ))}
          </section>
        </Sheet>

        {/* BACK */}
        <Sheet label="BACK" sub="Reference & context">
          {/* Emails */}
          {topEmails.length > 0 && (
            <section style={{ marginBottom: 14 }}>
              <SectionLabel text="📧 Emails to Respond" color={C.amb} />
              {topEmails.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid #F0F0F0", alignItems: "flex-start" }}>
                  <CheckBox id={`email-${i}`} checked={isChecked(`email-${i}`)} onToggle={toggle} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isChecked(`email-${i}`) ? "#bbb" : "#222", textDecoration: isChecked(`email-${i}`) ? "line-through" : "none" }}>{e.from}</div>
                    <div style={{ fontSize: 10, color: "#666" }}>{e.subj}</div>
                    {e.why && <div style={{ fontSize: 9, color: "#999", fontStyle: "italic" }}>{e.why}</div>}
                  </div>
                </div>
              ))}
            </section>
          )}

          {topEmails.length > 0 && DIVIDER}

          {/* Linear */}
          {linearItems.length > 0 && (
            <section style={{ marginBottom: 14 }}>
              <SectionLabel text="⚡ Linear / Dev" color="#2563EB" />
              {linearItems.slice(0, 5).map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid #F0F0F0", alignItems: "flex-start" }}>
                  <CheckBox id={`linear-${i}`} checked={isChecked(`linear-${i}`)} onToggle={toggle} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: "#2563EB", fontWeight: 700 }}>{l.id}</div>
                    <div style={{ fontSize: 11, color: isChecked(`linear-${i}`) ? "#bbb" : "#222" }}>{l.task}</div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {linearItems.length > 0 && DIVIDER}

          {/* Wins / Goals */}
          <section style={{ marginBottom: 14 }}>
            <SectionLabel text="🏆 3 Wins to Achieve Today" color="#B7791F" />
            {[1, 2, 3].map(n => (
              <div key={n} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #F0F0F0", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#bbb", fontWeight: 700, width: 14 }}>{n}.</span>
                <div style={{ flex: 1, height: 1, borderBottom: "1px solid #E0E0E0" }} />
              </div>
            ))}
          </section>

          {DIVIDER}

          {/* Notes */}
          <section>
            <SectionLabel text="📝 Notes" color="#666" />
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ height: 20, borderBottom: "1px solid #EBEBEB", marginBottom: 2 }} />
            ))}
          </section>

          {/* Affirmation */}
          <div style={{
            marginTop: 16, padding: "10px 12px", background: "#FAFAF9",
            borderRadius: 6, borderLeft: "3px solid #ccc",
          }}>
            <div style={{ fontSize: 9, color: "#999", fontWeight: 700, letterSpacing: 0.8, marginBottom: 3 }}>TODAY'S REMINDER</div>
            <div style={{ fontSize: 11, color: "#555", fontStyle: "italic", lineHeight: 1.5 }}>
              "Follow the plan I gave you!" — God
            </div>
          </div>
        </Sheet>
      </div>

      {/* Print hint */}
      <div style={{ textAlign: "center", padding: "8px 0 12px", color: "#555", fontSize: 11, fontFamily: F, flexShrink: 0 }}>
        Print → Portrait · Letter · 2 pages (front &amp; back of one sheet)
      </div>

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-page, .print-page * { visibility: visible !important; }
          .print-page {
            position: fixed !important;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: white !important;
            overflow: visible !important;
          }
          .print-page-front { page-break-after: always; }
        }
        .no-print {}
      `}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────

function Sheet({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 4,
      boxShadow: "0 4px 24px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2)",
      width: 380, minHeight: 520, flexShrink: 0,
      fontFamily: F, fontSize: 12, color: "#222",
      overflow: "hidden",
    }}>
      {/* Sheet header */}
      <div style={{
        padding: "10px 16px 8px", borderBottom: "2px solid #222",
        display: "flex", alignItems: "baseline", gap: 10,
      }}>
        <div style={{ fontFamily: FS, fontSize: 16, fontWeight: 800, color: "#111" }}>{label}</div>
        <div style={{ flex: 1, height: 1, background: "#ccc", marginBottom: 3 }} />
        <div style={{ fontSize: 9, color: "#999", fontWeight: 600 }}>{sub}</div>
      </div>

      {/* Sheet content */}
      <div style={{ padding: "14px 16px" }}>
        {children}
      </div>
    </div>
  );
}

function TaskRow({ id, label, sub, num, checked, onToggle, highlight = false }: {
  id: string; label: string; sub?: string; num?: number;
  checked: boolean; onToggle: (id: string) => void; highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 6 }}>
      {num !== undefined && (
        <div style={{
          width: 16, height: 16, border: `1.5px solid ${highlight ? C.red : "#555"}`,
          borderRadius: 3, fontSize: 9, fontWeight: 800, color: highlight ? C.red : "#555",
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>{num}</div>
      )}
      {num === undefined && (
        <CheckBox id={id} checked={checked} onToggle={onToggle} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, lineHeight: 1.35,
          color: checked ? "#bbb" : highlight ? C.red : "#222",
          textDecoration: checked ? "line-through" : "none",
          wordBreak: "break-word",
        }}>{label || "—"}</div>
        {sub && <div style={{ fontSize: 9, color: highlight ? C.red : "#999", fontWeight: 700 }}>{sub}</div>}
      </div>
      {num !== undefined && (
        <CheckBox id={id} checked={checked} onToggle={onToggle} />
      )}
    </div>
  );
}

function BlankRow({ num }: { num: number }) {
  return (
    <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 6 }}>
      <div style={{
        width: 16, height: 16, border: "1.5px dashed #ccc", borderRadius: 3,
        fontSize: 9, fontWeight: 800, color: "#ccc", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{num}</div>
      <div style={{ flex: 1, height: 1, borderBottom: "1px dashed #E0E0E0" }} />
    </div>
  );
}

function CallRow({ id, num, name, phone, checked, onToggle }: {
  id: string; num: number; name: string; phone?: string;
  checked: boolean; onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 0", borderBottom: "1px solid #F0F0F0" }}>
      <span style={{ fontSize: 9, color: "#bbb", fontWeight: 700, width: 12, flexShrink: 0 }}>{num}.</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {name ? (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: checked ? "#bbb" : "#222", textDecoration: checked ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            {phone && <div style={{ fontSize: 9, color: "#2563EB", fontWeight: 600 }}>{phone}</div>}
          </>
        ) : (
          <div style={{ height: 1, background: "#E8E8E8" }} />
        )}
      </div>
      <CheckBox id={id} checked={checked} onToggle={onToggle} />
    </div>
  );
}
