import { useState, useRef, useEffect } from "react";
import { SmartTip } from "./SmartTip";
import { FontLink } from "./FontLink";
import { C, F, FS, TODAY_STR, btn2, TIPS } from "./constants";
import type { Idea, SlackItem, LinearItem } from "./types";

interface Props {
  clock: string;
  ideas: Idea[];
  unresolved: number;
  calSide: boolean;
  eod: boolean;
  customTips: Record<string, string>;
  lastRefresh?: string;
  refreshing?: boolean;
  slackItems?: SlackItem[];
  linearItems?: LinearItem[];
  meetingWarning?: { title: string; time: string; location?: string } | null;
  onSetView: (v: string) => void;
  onToggleCal: () => void;
  onShowIdea: () => void;
  onShowChat: () => void;
  onEod: () => void;
  onTipSaved: (key: string, text: string) => void;
  onRefresh?: (sources: string[]) => void;
  onDismissWarning?: () => void;
}

const SOURCES = [
  { id: "emails",   label: "Emails",           icon: "✉️",  desc: "Re-fetch inbox & triage" },
  { id: "calendar", label: "Calendar",          icon: "📅",  desc: "Pull today's events" },
  { id: "slack",    label: "Slack",             icon: "💬",  desc: "Latest messages & mentions" },
  { id: "linear",   label: "Linear Tasks",      icon: "📋",  desc: "Open tech issues" },
  { id: "ai",       label: "AI Brief",          icon: "🤖",  desc: "Regenerate emails & tasks via AI" },
];

const levelColor = (level?: string) =>
  level === "high" ? C.red : level === "mid" ? C.amb : C.grn;

const topLevel = (items: { level: string }[]) => {
  if (!items.length) return null;
  if (items.some(i => i.level === "high")) return "high";
  if (items.some(i => i.level === "mid")) return "mid";
  return "low";
};

function NotifDot({ color }: { color: string }) {
  return (
    <span style={{
      position: "absolute", top: -3, right: -3,
      width: 8, height: 8, borderRadius: "50%",
      background: color, border: "1.5px solid #fff",
      pointerEvents: "none",
    }} />
  );
}

export function Header({ clock, ideas, unresolved, calSide, eod, customTips, lastRefresh, refreshing, slackItems = [], linearItems = [], meetingWarning, onSetView, onToggleCal, onShowIdea, onShowChat, onEod, onTipSaved, onRefresh, onDismissWarning }: Props) {
  const tip = (key: string) => (customTips ?? {})[key] ?? TIPS[key] ?? "";

  const [showPanel, setShowPanel] = useState(false);
  const [showSlack, setShowSlack] = useState(false);
  const [showLinear, setShowLinear] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(SOURCES.map(s => [s.id, true]))
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const slackRef = useRef<HTMLDivElement>(null);
  const linearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPanel && !showSlack && !showLinear) return;
    const handler = (e: MouseEvent) => {
      if (showPanel && panelRef.current && !panelRef.current.contains(e.target as Node)) setShowPanel(false);
      if (showSlack && slackRef.current && !slackRef.current.contains(e.target as Node)) setShowSlack(false);
      if (showLinear && linearRef.current && !linearRef.current.contains(e.target as Node)) setShowLinear(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel, showSlack, showLinear]);

  const toggleSource = (id: string) =>
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  const handleRefresh = () => {
    const selected = SOURCES.map(s => s.id).filter(id => checked[id]);
    if (!selected.length || !onRefresh) return;
    setShowPanel(false);
    onRefresh(selected);
  };

  const selectedCount = SOURCES.filter(s => checked[s.id]).length;
  const slackLevel = topLevel(slackItems);
  const linearLevel = topLevel(linearItems);

  const popoverStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    background: C.card,
    border: `1px solid ${C.brd}`,
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    padding: "12px 14px",
    width: 280,
    zIndex: 200,
    fontFamily: F,
  };

  return (
    <>
      <div style={{ background: C.card, borderBottom: `1px solid ${C.brd}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <FontLink />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1 onClick={() => onSetView("schedule")} style={{ fontFamily: FS, fontSize: 18, margin: 0, cursor: "pointer" }}>Tony's Command Center</h1>
          <span style={{ fontSize: 11, color: C.mut }}>{TODAY_STR} · {clock}</span>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: C.mut, marginLeft: 2 }}>· Updated {lastRefresh}</span>
          )}

          {onRefresh && (
            <div ref={panelRef} style={{ position: "relative", display: "inline-block" }}>
              <button
                onClick={() => !refreshing && setShowPanel(p => !p)}
                disabled={refreshing}
                title="Choose what to refresh"
                style={{
                  background: showPanel ? C.bluBg : "none",
                  border: showPanel ? `1px solid ${C.blu}` : "none",
                  borderRadius: 6,
                  cursor: refreshing ? "default" : "pointer",
                  fontSize: 12,
                  color: showPanel ? C.blu : C.mut,
                  padding: "1px 6px",
                  opacity: refreshing ? 0.4 : 1,
                  lineHeight: 1.4,
                  transition: "all 0.15s",
                }}
              >
                {refreshing ? "⟳" : "↻"}
              </button>

              {showPanel && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: C.card,
                  border: `1px solid ${C.brd}`,
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  padding: "12px 14px",
                  width: 240,
                  zIndex: 200,
                  fontFamily: F,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                    Refresh sources
                  </div>

                  {SOURCES.map(s => (
                    <label
                      key={s.id}
                      onClick={() => toggleSource(s.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        padding: "6px 4px",
                        borderRadius: 6,
                        cursor: "pointer",
                        background: checked[s.id] ? C.bluBg : "transparent",
                        marginBottom: 2,
                        transition: "background 0.1s",
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: `1.5px solid ${checked[s.id] ? C.blu : C.brd}`,
                        background: checked[s.id] ? C.blu : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, transition: "all 0.1s",
                      }}>
                        {checked[s.id] && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13 }}>{s.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: C.tx, fontWeight: checked[s.id] ? 600 : 400 }}>{s.label}</div>
                        <div style={{ fontSize: 10, color: C.mut }}>{s.desc}</div>
                      </div>
                    </label>
                  ))}

                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button
                      onClick={handleRefresh}
                      disabled={selectedCount === 0}
                      style={{
                        flex: 1,
                        background: selectedCount > 0 ? C.blu : C.brd,
                        color: selectedCount > 0 ? "#fff" : C.mut,
                        border: "none",
                        borderRadius: 7,
                        padding: "8px 0",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: selectedCount > 0 ? "pointer" : "default",
                        fontFamily: F,
                      }}
                    >
                      Refresh {selectedCount > 0 ? `(${selectedCount})` : ""}
                    </button>
                    <button
                      onClick={() => setShowPanel(false)}
                      style={{ background: C.brd, border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: C.mut, cursor: "pointer", fontFamily: F }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "center" }}>
                    <button onClick={() => setChecked(Object.fromEntries(SOURCES.map(s => [s.id, true])))} style={{ fontSize: 10, color: C.blu, background: "none", border: "none", cursor: "pointer", padding: 0 }}>all</button>
                    <span style={{ fontSize: 10, color: C.mut }}>·</span>
                    <button onClick={() => setChecked(Object.fromEntries(SOURCES.map(s => [s.id, false])))} style={{ fontSize: 10, color: C.mut, background: "none", border: "none", cursor: "pointer", padding: 0 }}>none</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p style={{ fontFamily: FS, fontSize: 12, color: C.sub, fontStyle: "italic", margin: 0, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          "Follow the plan I gave you!" — God
        </p>

        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <SmartTip tipKey="ideas" tip={tip("ideas")} onSaved={onTipSaved}>
            <button onClick={onShowIdea} style={{ ...btn2, padding: "5px 10px", fontSize: 11 }}>
              💡{ideas.length > 0 ? ` (${ideas.length})` : ""}
            </button>
          </SmartTip>
          <SmartTip tipKey="gmail" tip={tip("gmail")} onSaved={onTipSaved}>
            <button onClick={() => onSetView("emails")} style={{ ...btn2, padding: "5px 10px", fontSize: 11, position: "relative" }}>
              ✉️{unresolved > 0 && (
                <span style={{ position: "absolute", top: -5, right: -5, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {unresolved}
                </span>
              )}
            </button>
          </SmartTip>

          {/* Slack notification dot */}
          <div ref={slackRef} style={{ position: "relative", display: "inline-block" }}>
            <button
              onClick={() => slackItems.length > 0 && setShowSlack(p => !p)}
              style={{ ...btn2, padding: "5px 10px", fontSize: 11, position: "relative", opacity: slackItems.length === 0 ? 0.45 : 1, cursor: slackItems.length === 0 ? "default" : "pointer" }}
              title={slackItems.length === 0 ? "No Slack items" : `${slackItems.length} Slack item${slackItems.length > 1 ? "s" : ""}`}
            >
              💬
              {slackLevel && <NotifDot color={levelColor(slackLevel)} />}
            </button>
            {showSlack && slackItems.length > 0 && (
              <div style={popoverStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Slack · {slackItems.length} item{slackItems.length > 1 ? "s" : ""}</div>
                {slackItems.map((item, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: i < slackItems.length - 1 ? `1px solid ${C.brd}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: levelColor(item.level), textTransform: "uppercase" }}>{item.level}</span>
                      <span style={{ fontSize: 11, color: C.sub }}>{item.channel}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{item.from}</div>
                    <div style={{ fontSize: 12, color: C.sub, marginTop: 2, lineHeight: 1.4 }}>{item.message.slice(0, 100)}{item.message.length > 100 ? "…" : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linear notification dot */}
          <div ref={linearRef} style={{ position: "relative", display: "inline-block" }}>
            <button
              onClick={() => linearItems.length > 0 && setShowLinear(p => !p)}
              style={{ ...btn2, padding: "5px 10px", fontSize: 11, position: "relative", opacity: linearItems.length === 0 ? 0.45 : 1, cursor: linearItems.length === 0 ? "default" : "pointer" }}
              title={linearItems.length === 0 ? "No Linear items" : `${linearItems.length} Linear issue${linearItems.length > 1 ? "s" : ""}`}
            >
              📋
              {linearLevel && <NotifDot color={levelColor(linearLevel)} />}
            </button>
            {showLinear && linearItems.length > 0 && (
              <div style={popoverStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Linear · {linearItems.length} issue{linearItems.length > 1 ? "s" : ""}</div>
                {linearItems.map((item, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: i < linearItems.length - 1 ? `1px solid ${C.brd}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: levelColor(item.level), textTransform: "uppercase" }}>{item.level}</span>
                      <span style={{ fontSize: 11, color: C.sub, fontFamily: "monospace" }}>{item.id}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{item.task}</div>
                    <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>Assigned to {item.who}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={onToggleCal} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: calSide ? C.bluBg : C.card, color: calSide ? C.blu : C.tx }}>📅</button>
          <SmartTip tipKey="eod" tip={tip("eod")} onSaved={onTipSaved}>
            <button onClick={onEod} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: eod ? C.grnBg : C.card }}>{eod ? "✓" : "📊"}</button>
          </SmartTip>
          <SmartTip tipKey="chat" tip={tip("chat")} onSaved={onTipSaved}>
            <button onClick={onShowChat} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: C.tx, color: "#fff", border: "none" }}>💬 AI</button>
          </SmartTip>
        </div>

        <div style={{ position: "fixed", bottom: 14, right: 14, fontSize: 10, color: C.mut, fontFamily: F, background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8, padding: "4px 10px", pointerEvents: "none", zIndex: 100 }}>
          Hold <kbd style={{ background: "#F0F0F0", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", border: "1px solid #CCC" }}>Ctrl</kbd> + hover any button to edit its instruction
        </div>
      </div>

      {/* 5-min meeting warning banner */}
      {meetingWarning && (
        <div style={{
          background: "#1565C0", color: "#fff", padding: "10px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontFamily: F, zIndex: 49,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>⏰ Meeting in 5 min: {meetingWarning.title} at {meetingWarning.time}</div>
            {meetingWarning.location && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>📍 {meetingWarning.location}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {meetingWarning.location?.startsWith("http") && (
              <a href={meetingWarning.location} target="_blank" rel="noreferrer" style={{ padding: "5px 12px", background: "#fff", color: "#1565C0", borderRadius: 7, fontWeight: 700, fontSize: 12, textDecoration: "none" }}>Join</a>
            )}
            <button onClick={onDismissWarning} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: F }}>Dismiss</button>
          </div>
        </div>
      )}
    </>
  );
}
