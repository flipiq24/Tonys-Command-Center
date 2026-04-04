import { useState, useRef, useEffect } from "react";
import { FontLink } from "./FontLink";
import { C, F, FS, TODAY_STR, TIPS } from "./constants";
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
  meetingWarning?: { title: string; time: string; location?: string; attendeeBrief?: string } | null;
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
  { id: "emails",   label: "Emails",       icon: "✉️",  desc: "Re-fetch inbox & triage" },
  { id: "calendar", label: "Calendar",      icon: "📅",  desc: "Pull today's events" },
  { id: "slack",    label: "Slack",         icon: "💬",  desc: "Latest messages & mentions" },
  { id: "linear",   label: "Linear Tasks",  icon: "📋",  desc: "Open tech issues" },
  { id: "ai",       label: "AI Brief",      icon: "🤖",  desc: "Regenerate emails & tasks via AI" },
];

const levelColor = (level?: string) =>
  level === "high" ? C.red : level === "mid" ? C.amb : C.grn;

const topLevel = (items: { level: string }[]) => {
  if (!items.length) return null;
  if (items.some(i => i.level === "high")) return "high";
  if (items.some(i => i.level === "mid")) return "mid";
  return "low";
};

export function Header({ clock, ideas, unresolved, calSide, eod, customTips: _customTips, lastRefresh, refreshing, slackItems = [], linearItems = [], meetingWarning, onSetView, onToggleCal, onShowIdea, onShowChat, onEod, onTipSaved: _onTipSaved, onRefresh, onDismissWarning }: Props) {
  const [open, setOpen] = useState(false);
  const [showRefresh, setShowRefresh] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(SOURCES.map(s => [s.id, true]))
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowRefresh(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleSource = (id: string) =>
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  const handleRefresh = () => {
    const selected = SOURCES.map(s => s.id).filter(id => checked[id]);
    if (!selected.length || !onRefresh) return;
    setOpen(false);
    setShowRefresh(false);
    onRefresh(selected);
  };

  const selectedCount = SOURCES.filter(s => checked[s.id]).length;
  const slackLevel = topLevel(slackItems);
  const linearLevel = topLevel(linearItems);

  const hasNotif = unresolved > 0 || ideas.length > 0 || !!slackLevel || !!linearLevel;

  const sep = <div style={{ height: 1, background: C.brd, margin: "6px 0" }} />;

  const menuItem = (
    icon: string,
    label: string,
    badge: string | number | null,
    onClick: () => void,
    accent?: string,
  ) => (
    <button
      onClick={() => { onClick(); setOpen(false); setShowRefresh(false); }}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "9px 14px", background: "none", border: "none",
        textAlign: "left", cursor: "pointer", fontFamily: F, borderRadius: 8,
        transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "#F5F4F1")}
      onMouseLeave={e => (e.currentTarget.style.background = "none")}
    >
      <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: accent || C.tx }}>{label}</span>
      {badge !== null && badge !== undefined && Number(badge) > 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, background: accent ? `${accent}22` : C.bluBg, color: accent || C.blu, borderRadius: 10, padding: "1px 7px", minWidth: 20, textAlign: "center" }}>{badge}</span>
      )}
    </button>
  );

  return (
    <>
      <FontLink />
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.brd}`,
        padding: "12px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>

        {/* ── Left: Title + Quote + Date ── */}
        <div style={{ cursor: "pointer" }} onClick={() => onSetView("schedule")}>
          <div style={{ fontFamily: FS, fontSize: 22, fontWeight: 700, color: C.tx, lineHeight: 1.1 }}>
            Tony's Command Center
          </div>
          <div style={{ fontSize: 12, color: C.mut, marginTop: 2, fontFamily: F }}>
            {TODAY_STR} · {clock}
            {refreshing && (
              <span style={{ marginLeft: 8, color: C.blu, fontWeight: 600 }}>
                ⟳ Refreshing…
              </span>
            )}
            {!refreshing && lastRefresh && (
              <span style={{ marginLeft: 8 }}>· Updated {lastRefresh}</span>
            )}
          </div>
        </div>

        {/* ── Center: Quote ── */}
        <p style={{
          fontFamily: F, fontSize: 20, color: C.tx, fontStyle: "italic",
          margin: 0, position: "absolute", left: "50%", transform: "translateX(-50%)",
          whiteSpace: "nowrap", pointerEvents: "none", fontWeight: 700,
          WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale",
          letterSpacing: "-0.3px",
        }}>
          "Follow the plan I gave you!" — God
        </p>

        {/* ── Right: Hamburger ── */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => { setOpen(p => !p); setShowRefresh(false); }}
            style={{
              display: "flex", flexDirection: "column", justifyContent: "center",
              alignItems: "center", gap: 4, width: 40, height: 40,
              background: open ? C.bluBg : "none",
              border: `1.5px solid ${open ? C.blu : C.brd}`,
              borderRadius: 10, cursor: "pointer", padding: 0,
              position: "relative",
            }}
          >
            <span style={{ display: "block", width: 18, height: 2, background: open ? C.blu : C.tx, borderRadius: 2, transition: "all 0.2s" }} />
            <span style={{ display: "block", width: 18, height: 2, background: open ? C.blu : C.tx, borderRadius: 2, transition: "all 0.2s" }} />
            <span style={{ display: "block", width: 18, height: 2, background: open ? C.blu : C.tx, borderRadius: 2, transition: "all 0.2s" }} />
            {hasNotif && !open && (
              <span style={{
                position: "absolute", top: -3, right: -3,
                width: 9, height: 9, borderRadius: "50%",
                background: unresolved > 0 ? C.red : slackLevel === "high" ? C.red : C.amb,
                border: "2px solid #fff",
              }} />
            )}
          </button>

          {open && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: C.card, border: `1px solid ${C.brd}`,
              borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
              width: 280, zIndex: 200, fontFamily: F,
              padding: "8px 6px",
              animation: "fadeIn 0.12s ease-out",
            }}>

              {/* Refresh status row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px 10px", borderBottom: `1px solid ${C.brd}`, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: C.mut, fontFamily: F }}>
                  {refreshing ? (
                    <span style={{ color: C.blu, fontWeight: 600 }}>⟳ Refreshing…</span>
                  ) : lastRefresh ? (
                    `· Updated ${lastRefresh}`
                  ) : "Not yet refreshed"}
                </span>
                <button
                  onClick={() => { if (!refreshing && onRefresh) { setOpen(false); onRefresh(SOURCES.map(s => s.id)); } }}
                  disabled={refreshing}
                  title="Refresh all sources"
                  style={{
                    background: "none", border: `1px solid ${C.brd}`, borderRadius: 6,
                    padding: "3px 10px", fontSize: 13, color: refreshing ? C.mut : C.blu,
                    cursor: refreshing ? "default" : "pointer", fontFamily: F,
                    opacity: refreshing ? 0.5 : 1,
                  }}
                >
                  ↻
                </button>
              </div>

              {/* Nav */}
              <div style={{ padding: "4px 10px 6px", fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8 }}>Navigate</div>
              {menuItem("✉️", "Emails", unresolved || null, () => onSetView("emails"), unresolved > 0 ? C.red : undefined)}
              {menuItem("📞", "Sales", null, () => onSetView("sales"))}
              {menuItem("✅", "Tasks", null, () => onSetView("tasks"))}
              {menuItem("💬", "AI Chat", null, () => { onShowChat(); })}

              {sep}

              {/* Tools */}
              <div style={{ padding: "4px 10px 6px", fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8 }}>Tools</div>
              {menuItem("💡", "Ideas", null, () => onShowIdea())}
              {menuItem("📅", `Calendar sidebar`, null, () => { onToggleCal(); }, calSide ? C.blu : undefined)}
              {slackItems.length > 0 && menuItem(
                "💬",
                `Slack · ${slackItems.length} item${slackItems.length > 1 ? "s" : ""}`,
                null,
                () => {},
                levelColor(slackLevel || undefined),
              )}
              {linearItems.length > 0 && menuItem(
                "📋",
                `Linear · ${linearItems.length} issue${linearItems.length > 1 ? "s" : ""}`,
                null,
                () => {},
                levelColor(linearLevel || undefined),
              )}

              {sep}

              {/* Refresh */}
              {!showRefresh ? (
                <button
                  onClick={() => setShowRefresh(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "9px 14px", background: "none", border: "none",
                    textAlign: "left", cursor: "pointer", fontFamily: F, borderRadius: 8,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F5F4F1")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{refreshing ? "⟳" : "↻"}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: refreshing ? C.blu : C.tx }}>
                    {refreshing ? "Refreshing…" : "Refresh Data"}
                  </span>
                  {lastRefresh && !refreshing && (
                    <span style={{ fontSize: 10, color: C.mut }}>{lastRefresh}</span>
                  )}
                  <span style={{ fontSize: 12, color: C.mut }}>›</span>
                </button>
              ) : (
                <div style={{ padding: "6px 10px 10px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Choose sources</div>
                  {SOURCES.map(s => (
                    <label
                      key={s.id}
                      onClick={() => toggleSource(s.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 9,
                        padding: "6px 6px", borderRadius: 7, cursor: "pointer",
                        background: checked[s.id] ? C.bluBg : "transparent",
                        marginBottom: 2,
                      }}
                    >
                      <div style={{
                        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                        border: `1.5px solid ${checked[s.id] ? C.blu : C.brd}`,
                        background: checked[s.id] ? C.blu : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {checked[s.id] && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13 }}>{s.icon}</span>
                      <span style={{ fontSize: 13, color: C.tx, fontWeight: checked[s.id] ? 600 : 400 }}>{s.label}</span>
                    </label>
                  ))}
                  <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                    <button
                      onClick={handleRefresh}
                      disabled={selectedCount === 0 || refreshing}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 7, border: "none",
                        background: selectedCount > 0 && !refreshing ? C.blu : C.brd,
                        color: selectedCount > 0 && !refreshing ? "#fff" : C.mut,
                        fontSize: 13, fontWeight: 600, cursor: selectedCount > 0 && !refreshing ? "pointer" : "default", fontFamily: F,
                      }}
                    >
                      {refreshing ? "Refreshing…" : `Refresh (${selectedCount})`}
                    </button>
                    <button
                      onClick={() => setShowRefresh(false)}
                      style={{ padding: "8px 12px", borderRadius: 7, border: `1px solid ${C.brd}`, background: "#FAFAF8", fontSize: 12, color: C.mut, cursor: "pointer", fontFamily: F }}
                    >
                      ‹ Back
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6 }}>
                    <button onClick={() => setChecked(Object.fromEntries(SOURCES.map(s => [s.id, true])))} style={{ fontSize: 10, color: C.blu, background: "none", border: "none", cursor: "pointer", padding: 0 }}>all</button>
                    <span style={{ fontSize: 10, color: C.mut }}>·</span>
                    <button onClick={() => setChecked(Object.fromEntries(SOURCES.map(s => [s.id, false])))} style={{ fontSize: 10, color: C.mut, background: "none", border: "none", cursor: "pointer", padding: 0 }}>none</button>
                  </div>
                </div>
              )}

              {sep}

              {/* EOD */}
              {menuItem("📊", eod ? "EOD Sent ✓" : "Send EOD Report", null, () => { onEod(); }, eod ? C.grn : undefined)}
            </div>
          )}
        </div>
      </div>

      {/* Meeting warning banner */}
      {meetingWarning && (
        <div style={{
          background: "#1565C0", color: "#fff", padding: "10px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontFamily: F, zIndex: 49,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>⏰ Meeting in 5 min: {meetingWarning.title} at {meetingWarning.time}</div>
            {meetingWarning.location && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>📍 {meetingWarning.location}</div>}
            {meetingWarning.attendeeBrief && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3, fontStyle: "italic" }}>{meetingWarning.attendeeBrief}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {meetingWarning.location?.startsWith("http") && (
              <a href={meetingWarning.location} target="_blank" rel="noreferrer" style={{ padding: "5px 12px", background: "#fff", color: "#1565C0", borderRadius: 7, fontWeight: 700, fontSize: 12, textDecoration: "none" }}>Join</a>
            )}
            <button onClick={onDismissWarning} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: F }}>Dismiss</button>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </>
  );
}
