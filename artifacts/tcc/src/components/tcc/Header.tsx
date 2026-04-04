import { useState, useRef, useEffect } from "react";
import { SmartTip } from "./SmartTip";
import { FontLink } from "./FontLink";
import { C, F, FS, TODAY_STR, btn2, TIPS } from "./constants";
import type { Idea } from "./types";

interface Props {
  clock: string;
  ideas: Idea[];
  unresolved: number;
  calSide: boolean;
  eod: boolean;
  customTips: Record<string, string>;
  lastRefresh?: string;
  refreshing?: boolean;
  onSetView: (v: string) => void;
  onToggleCal: () => void;
  onShowIdea: () => void;
  onShowChat: () => void;
  onEod: () => void;
  onTipSaved: (key: string, text: string) => void;
  onRefresh?: (sources: string[]) => void;
}

const SOURCES = [
  { id: "emails",   label: "Emails",           icon: "✉️",  desc: "Re-fetch inbox & triage" },
  { id: "calendar", label: "Calendar",          icon: "📅",  desc: "Pull today's events" },
  { id: "slack",    label: "Slack",             icon: "💬",  desc: "Latest messages & mentions" },
  { id: "linear",   label: "Linear Tasks",      icon: "📋",  desc: "Open tech issues" },
  { id: "ai",       label: "AI Brief",          icon: "🤖",  desc: "Regenerate emails & tasks via AI" },
];

export function Header({ clock, ideas, unresolved, calSide, eod, customTips, lastRefresh, refreshing, onSetView, onToggleCal, onShowIdea, onShowChat, onEod, onTipSaved, onRefresh }: Props) {
  const tip = (key: string) => (customTips ?? {})[key] ?? TIPS[key] ?? "";

  const [showPanel, setShowPanel] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(SOURCES.map(s => [s.id, true]))
  );
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    if (!showPanel) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel]);

  const toggleSource = (id: string) =>
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  const handleRefresh = () => {
    const selected = SOURCES.map(s => s.id).filter(id => checked[id]);
    if (!selected.length || !onRefresh) return;
    setShowPanel(false);
    onRefresh(selected);
  };

  const selectedCount = SOURCES.filter(s => checked[s.id]).length;

  return (
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
                      <div style={{ fontSize: 13, color: C.fg, fontWeight: checked[s.id] ? 600 : 400 }}>{s.label}</div>
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
                      background: selectedCount > 0 ? C.acc : C.brd,
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
        <button onClick={onToggleCal} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: calSide ? C.bluBg : C.card, color: calSide ? C.blu : C.tx }}>📅</button>
        <SmartTip tipKey="eod" tip={tip("eod")} onSaved={onTipSaved}>
          <button onClick={onEod} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: eod ? C.grnBg : C.card }}>{eod ? "✓" : "📊"}</button>
        </SmartTip>
        <SmartTip tipKey="chat" tip={tip("chat")} onSaved={onTipSaved}>
          <button onClick={onShowChat} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: C.tx, color: "#fff", border: "none" }}>💬</button>
        </SmartTip>
      </div>

      <div style={{ position: "fixed", bottom: 14, right: 14, fontSize: 10, color: C.mut, fontFamily: F, background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8, padding: "4px 10px", pointerEvents: "none", zIndex: 100 }}>
        Hold <kbd style={{ background: "#F0F0F0", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", border: "1px solid #CCC" }}>Ctrl</kbd> + hover any button to edit its instruction
      </div>
    </div>
  );
}
