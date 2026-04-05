import { useState, useRef, useEffect, useCallback } from "react";
import { FontLink } from "./FontLink";
import { C, F, FS, TODAY_STR } from "./constants";
import { post } from "@/lib/api";
import type { Idea, SlackItem, LinearItem } from "./types";

// ─── High-urgency Slack banner ────────────────────────────────────────────────
function HighUrgencyBanner({ items, onDismiss }: { items: SlackItem[]; onDismiss: () => void }) {
  const high = items.filter(i => i.level === "high");

  useEffect(() => {
    if (high.length === 0) return;
    const timer = setTimeout(onDismiss, 15000);
    return () => clearTimeout(timer);
  }, [high.length, onDismiss]);

  if (high.length === 0) return null;
  return (
    <div style={{
      background: C.red, color: "#fff", padding: "10px 20px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontFamily: F, zIndex: 48,
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>🔴 {high.length} High-Urgency Slack Item{high.length > 1 ? "s" : ""}</div>
        {high[0] && <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{high[0].message?.substring(0, 100) || "Needs immediate attention"}</div>}
      </div>
      <button onClick={onDismiss} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: F }}>Dismiss</button>
    </div>
  );
}

interface Props {
  clock: string;
  ideas: Idea[];
  unresolved: number;
  snoozedCount?: number;
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
  onShowCheckin: () => void;
  onEod: () => void;
  onTipSaved: (key: string, text: string) => void;
  onRefresh?: (sources: string[]) => void;
  onDismissWarning?: () => void;
  onPrint?: () => void;
}

const ALL_SOURCES = ["emails", "calendar", "slack", "linear", "ai"];

const levelColor = (level?: string) =>
  level === "high" ? C.red : level === "mid" ? C.amb : C.grn;

const topLevel = (items: { level: string }[]) => {
  if (!items.length) return null;
  if (items.some(i => i.level === "high")) return "high";
  if (items.some(i => i.level === "mid")) return "mid";
  return "low";
};

export function Header({ clock, ideas, unresolved, snoozedCount = 0, calSide, eod, customTips: _customTips, lastRefresh, refreshing, slackItems = [], linearItems = [], meetingWarning, onSetView, onToggleCal, onShowIdea, onShowChat, onShowCheckin, onEod, onTipSaved: _onTipSaved, onRefresh, onDismissWarning, onPrint }: Props) {
  const [open, setOpen] = useState(false);
  const [dismissedHighUrgency, setDismissedHighUrgency] = useState(false);
  const [showSlackPopover, setShowSlackPopover] = useState(false);
  const [attendeeBriefExpanded, setAttendeeBriefExpanded] = useState(false);
  const [showEodModal, setShowEodModal] = useState(false);
  const [eodText, setEodText] = useState("");
  const [eodTo, setEodTo] = useState("ethan@flipiq.com");
  const [eodLoading, setEodLoading] = useState(false);
  const [eodSending, setEodSending] = useState(false);
  const [eodResult, setEodResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const openEodModal = useCallback(async () => {
    setOpen(false);
    setShowEodModal(true);
    setEodResult(null);
    if (eodText) return; // already loaded
    setEodLoading(true);
    try {
      const r = await post<{ ok: boolean; reportText: string }>("/eod-report/preview", {});
      if (r.ok) setEodText(r.reportText);
    } catch {
      setEodText("Could not generate preview. Edit this field with your EOD summary.");
    } finally {
      setEodLoading(false);
    }
  }, [eodText]);

  const sendEod = useCallback(async () => {
    if (eodSending || !eodTo.trim()) return;
    setEodSending(true);
    setEodResult(null);
    try {
      const r = await post<{ ok: boolean }>("/eod-report", { to: eodTo.trim(), body: eodText });
      if (r.ok) {
        setEodResult({ ok: true, msg: `Sent to ${eodTo.trim()}` });
        onEod();
      } else {
        setEodResult({ ok: false, msg: "Send failed — try again" });
      }
    } catch {
      setEodResult({ ok: false, msg: "Error sending — check connection" });
    } finally {
      setEodSending(false);
    }
  }, [eodSending, eodTo, eodText, onEod]);
  const menuRef = useRef<HTMLDivElement>(null);
  const slackPopoverRef = useRef<HTMLDivElement>(null);

  const handleDismissSlackPopover = useCallback(() => setShowSlackPopover(false), []);

  useEffect(() => {
    if (!showSlackPopover) return;
    const handler = (e: MouseEvent) => {
      if (slackPopoverRef.current && !slackPopoverRef.current.contains(e.target as Node)) {
        setShowSlackPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSlackPopover]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const slackLevel = topLevel(slackItems);
  const hasNotif = unresolved > 0 || ideas.length > 0 || !!slackLevel;
  const sep = <div style={{ height: 1, background: C.brd, margin: "6px 0" }} />;

  const menuItem = (
    icon: string,
    label: string,
    badge: string | number | null,
    onClick: () => void,
    accent?: string,
  ) => (
    <button
      onClick={() => { onClick(); setOpen(false); }}
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

        {/* ── Left: Title + Date ── */}
        <div style={{ cursor: "pointer" }} onClick={() => onSetView("dashboard")}>
          <div style={{ fontFamily: FS, fontSize: 22, fontWeight: 700, color: C.tx, lineHeight: 1.1 }}>
            Tony's Command Center
          </div>
          <div style={{ fontSize: 12, color: C.mut, marginTop: 2, fontFamily: F }}>
            {TODAY_STR} · {clock}
            {refreshing && (
              <span style={{ marginLeft: 8, color: C.blu, fontWeight: 600 }}>⟳ Refreshing…</span>
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

        {/* ── Right: Slack Bell + Hamburger ── */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

        {/* Standalone Slack notification bell */}
        {slackItems.length > 0 && (
          <div ref={slackPopoverRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowSlackPopover(p => !p)}
              title={`${slackItems.length} Slack mention${slackItems.length > 1 ? "s" : ""} — click to view`}
              style={{
                width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                background: showSlackPopover ? C.bluBg : "none",
                border: `1.5px solid ${showSlackPopover ? C.blu : C.brd}`,
                borderRadius: 10, cursor: "pointer", position: "relative", flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 15 }}>💬</span>
              <span style={{
                position: "absolute", top: -5, right: -5,
                minWidth: 17, height: 17, borderRadius: 9,
                background: slackLevel === "high" ? C.red : C.amb,
                border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 800, color: "#fff", padding: "0 3px", lineHeight: 1,
              }}>
                {slackItems.length}
              </span>
            </button>
            {showSlackPopover && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                background: C.card, border: `1px solid ${C.brd}`,
                borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
                width: 310, zIndex: 300, fontFamily: F, padding: "0 0 6px",
                animation: "fadeIn 0.12s ease-out",
              }}>
                <div style={{ padding: "10px 14px 8px", fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.brd}` }}>
                  Slack Mentions · {slackItems.length}
                </div>
                {slackItems.map((item, i) => {
                  const slackDeepLink = item.url
                    ? item.url
                    : item.channel
                      ? `slack://channel?team=&id=${item.channel}`
                      : "slack://open";
                  return (
                    <div key={i} style={{ padding: "9px 14px", borderBottom: i < slackItems.length - 1 ? `1px solid ${C.brd}` : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: item.level === "high" ? C.red : item.level === "mid" ? C.amb : C.mut, borderRadius: 3, padding: "1px 5px", textTransform: "uppercase" }}>
                          {item.level || "low"}
                        </span>
                        {item.channel && <span style={{ fontSize: 11, color: C.mut }}>{item.channel}</span>}
                        <a href={slackDeepLink} target={item.url && item.url.startsWith("http") ? "_blank" : "_self"} rel="noopener noreferrer" style={{ marginLeft: "auto", fontSize: 10, color: C.blu, textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>
                          Open ↗
                        </a>
                      </div>
                      <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.45 }}>
                        {item.from && <span style={{ fontWeight: 700 }}>{item.from}: </span>}
                        {(item.message || "").substring(0, 140)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Hamburger */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setOpen(p => !p)}
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
            {!open && slackItems.length > 0 && (
              <span style={{
                position: "absolute", top: -6, left: -6,
                minWidth: 16, height: 16, borderRadius: 8,
                background: slackLevel === "high" ? C.red : C.amb,
                border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 800, color: "#fff", padding: "0 3px",
                lineHeight: 1,
              }}>
                {slackItems.length}
              </span>
            )}
            {!open && unresolved > 0 && slackItems.length === 0 && (
              <span style={{
                position: "absolute", top: -3, right: -3,
                width: 9, height: 9, borderRadius: "50%",
                background: C.red, border: "2px solid #fff",
              }} />
            )}
          </button>

          {open && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: C.card, border: `1px solid ${C.brd}`,
              borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
              width: 260, zIndex: 200, fontFamily: F,
              padding: "8px 6px",
              animation: "fadeIn 0.12s ease-out",
            }}>

              {/* Refresh status row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px 10px", borderBottom: `1px solid ${C.brd}`, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: C.mut }}>
                  {refreshing
                    ? <span style={{ color: C.blu, fontWeight: 600 }}>⟳ Refreshing…</span>
                    : lastRefresh ? `Updated ${lastRefresh}` : "Not yet refreshed"}
                </span>
                <button
                  onClick={() => { if (!refreshing && onRefresh) { setOpen(false); onRefresh(ALL_SOURCES); } }}
                  disabled={refreshing}
                  title="Refresh all"
                  style={{
                    background: "none", border: `1px solid ${C.brd}`, borderRadius: 6,
                    padding: "3px 10px", fontSize: 13, color: refreshing ? C.mut : C.blu,
                    cursor: refreshing ? "default" : "pointer", fontFamily: F,
                    opacity: refreshing ? 0.5 : 1,
                  }}
                >↻</button>
              </div>

              {/* Navigate */}
              <div style={{ padding: "4px 10px 6px", fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8 }}>Navigate</div>
              {menuItem("🏠", "Dashboard", null, () => onSetView("dashboard"))}
              {menuItem("📞", "Sales Mode", null, () => onSetView("sales"))}
              {menuItem("📅", "Calendar", null, () => onSetView("schedule"))}
              {menuItem("✉️", `Emails${snoozedCount > 0 ? ` (${snoozedCount} snoozed)` : ""}`, unresolved || null, () => onSetView("emails"), unresolved > 0 ? C.red : undefined)}
              {menuItem("✅", "Tasks", null, () => onSetView("tasks"))}
              {menuItem("💬", "AI Chat", null, () => onShowChat())}

              {sep}

              {/* Tools */}
              <div style={{ padding: "4px 10px 6px", fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.8 }}>Tools</div>
              {menuItem("💡", "Ideas", null, () => onShowIdea())}
              {menuItem("☀️", "Morning Check-in", null, () => onShowCheckin())}
              {onPrint && menuItem("🖨", "Print Daily Sheet", null, () => onPrint())}
              {sep}

              {/* EOD Report — always available, shows sent status if already sent */}
              <div
                onClick={openEodModal}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 14px", fontFamily: F, cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>📊</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: eod ? C.grn : C.tx }}>
                  {eod ? "EOD Sent ✓ — Resend" : "Send EOD Report"}
                </span>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* High-urgency Slack banner */}
      {!dismissedHighUrgency && slackItems.some(i => i.level === "high") && (
        <HighUrgencyBanner items={slackItems} onDismiss={() => setDismissedHighUrgency(true)} />
      )}

      {/* Meeting warning banner */}
      {meetingWarning && (
        <div style={{
          background: "#1565C0", color: "#fff", padding: "10px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontFamily: F, zIndex: 49,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>⏰ Meeting in 5 min: {meetingWarning.title} at {meetingWarning.time}</div>
              {meetingWarning.location && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>📍 {meetingWarning.location}</div>}
              {meetingWarning.attendeeBrief && (
                <button
                  onClick={() => setAttendeeBriefExpanded(p => !p)}
                  style={{ marginTop: 4, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontFamily: F }}
                >
                  {attendeeBriefExpanded ? "▴ Hide Brief" : "▾ View Full Brief"}
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
              {meetingWarning.location?.startsWith("http") && (
                <a href={meetingWarning.location} target="_blank" rel="noreferrer" style={{ padding: "5px 12px", background: "#fff", color: "#1565C0", borderRadius: 7, fontWeight: 700, fontSize: 12, textDecoration: "none" }}>Join</a>
              )}
              <button onClick={onDismissWarning} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: F }}>Dismiss</button>
            </div>
          </div>
          {meetingWarning.attendeeBrief && attendeeBriefExpanded && (
            <div style={{
              marginTop: 10, padding: "10px 14px", background: "rgba(255,255,255,0.12)",
              borderRadius: 8, fontSize: 12, lineHeight: 1.6, fontStyle: "italic",
              whiteSpace: "pre-wrap",
            }}>
              {meetingWarning.attendeeBrief}
            </div>
          )}
        </div>
      )}

      {/* ── EOD Report Modal ── */}
      {showEodModal && (
        <div
          onClick={() => setShowEodModal(false)}
          style={{ position: "fixed", inset: 0, background: "#00000066", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", maxWidth: 600, width: "94%", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", fontFamily: F }}
          >
            <div style={{ fontFamily: FS, fontSize: 18, fontWeight: 800, color: "#111" }}>📊 EOD Report</div>

            {/* To field */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5 }}>To</div>
              <input
                value={eodTo}
                onChange={e => setEodTo(e.target.value)}
                placeholder="ethan@flipiq.com"
                style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1px solid #DDD", borderRadius: 8, fontFamily: F, boxSizing: "border-box" }}
              />
            </div>

            {/* Report body */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5 }}>Message</div>
              {eodLoading ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF8", borderRadius: 8, border: "1px solid #EEE", color: "#999", fontSize: 13, minHeight: 200 }}>
                  Generating EOD report…
                </div>
              ) : (
                <textarea
                  value={eodText}
                  onChange={e => setEodText(e.target.value)}
                  style={{ flex: 1, minHeight: 260, padding: "12px 14px", fontSize: 13, lineHeight: 1.65, border: "1px solid #DDD", borderRadius: 8, fontFamily: F, resize: "vertical", boxSizing: "border-box", width: "100%" }}
                />
              )}
            </div>

            {/* Result banner */}
            {eodResult && (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: eodResult.ok ? "#F0FDF4" : "#FFF5F5", color: eodResult.ok ? "#15803D" : "#B91C1C", fontSize: 13, fontWeight: 600 }}>
                {eodResult.ok ? "✓ " : "⚠ "}{eodResult.msg}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setEodText(""); setEodResult(null); openEodModal(); }}
                disabled={eodLoading}
                style={{ fontSize: 12, padding: "8px 14px", background: "none", border: "1px solid #DDD", borderRadius: 8, cursor: "pointer", fontFamily: F, color: "#666" }}
              >
                ↻ Regenerate
              </button>
              <button
                onClick={() => setShowEodModal(false)}
                style={{ fontSize: 12, padding: "8px 14px", background: "none", border: "1px solid #DDD", borderRadius: 8, cursor: "pointer", fontFamily: F, color: "#666" }}
              >
                Cancel
              </button>
              <button
                onClick={sendEod}
                disabled={eodSending || eodLoading || !eodTo.trim()}
                style={{ fontSize: 13, fontWeight: 700, padding: "8px 22px", background: eodSending ? "#888" : "#111", color: "#fff", border: "none", borderRadius: 8, cursor: eodSending ? "default" : "pointer", fontFamily: F }}
              >
                {eodSending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </>
  );
}
