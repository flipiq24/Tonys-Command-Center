import { useState, useRef } from "react";
import { post } from "@/lib/api";
import { C, F, FS, card, btn1, btn2, TIPS } from "./constants";
import { SmartTip } from "./SmartTip";
import { EmailReplyModal } from "./EmailReplyModal";
import { HoverCard } from "./HoverCard";
import type { EmailItem } from "./types";

interface Props {
  emailsImportant: EmailItem[];
  emailsFyi: EmailItem[];
  emailsPromotions?: EmailItem[];
  snoozed: Record<number, string>;
  customTips: Record<string, string>;
  onSnooze: (emailId: number, until: string) => void;
  onDone: () => void;
  onTipSaved: (key: string, text: string) => void;
  onRefresh?: () => Promise<void>;
}

interface TrainingState {
  emailId: number;
  vote: "thumbs_up" | "thumbs_down";
  reason: string;
  saved: boolean;
}

export function EmailsView({ emailsImportant, emailsFyi, emailsPromotions = [], snoozed, customTips, onSnooze, onDone, onTipSaved, onRefresh }: Props) {
  const [replyEmail, setReplyEmail] = useState<EmailItem | null>(null);
  const [training, setTraining] = useState<TrainingState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showPromotions, setShowPromotions] = useState(false);
  const [nwPickEmailId, setNwPickEmailId] = useState<number | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function getNextWeekDay(dayOffset: number): Date {
    // dayOffset: 0=Mon 1=Tue 2=Wed 3=Thu 4=Fri
    const now = new Date();
    const day = now.getDay(); // 0=Sun 1=Mon ... 6=Sat
    const daysToNextMon = day === 0 ? 1 : 8 - day;
    const d = new Date(now);
    d.setDate(now.getDate() + daysToNextMon + dayOffset);
    return d;
  }
  const NW_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  function toDateStr(d: Date) {
    return d.toISOString().split("T")[0];
  }

  const handleRefresh = async () => {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => setRefreshing(false), 600);
    }
  };
  const allUnresolved = emailsImportant.filter(e => !snoozed[e.id]);
  const unresolved = allUnresolved.length;
  const visibleEmails = showAll ? allUnresolved : allUnresolved.slice(0, 3);
  const hiddenCount = unresolved - 3;
  const tip = (key: string) => (customTips ?? {})[key] ?? TIPS[key] ?? "";

  const gmailUrl = (e: EmailItem) =>
    e.gmailMessageId
      ? `https://mail.google.com/mail/u/0/#inbox/${e.gmailMessageId}`
      : `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(e.subj || e.from || "")}`;


  const startTraining = (e: EmailItem, vote: "thumbs_up" | "thumbs_down") => {
    setTraining({ emailId: e.id, vote, reason: "", saved: false });
  };

  const submitTraining = async (e: EmailItem) => {
    if (!training) return;
    await post("/emails/action", {
      action: training.vote,
      emailId: e.id,
      sender: e.from,
      subject: e.subj,
      reason: training.reason || undefined,
    }).catch(() => {});
    setTraining(prev => prev ? { ...prev, saved: true } : null);
    setTimeout(() => setTraining(null), 1800);
  };

  const voteColor = training?.vote === "thumbs_up" ? C.grn : C.red;
  const voteLabel = training?.vote === "thumbs_up" ? "👍 Important because…" : "👎 Not important because…";

  return (
    <>
      <EmailReplyModal email={replyEmail} onClose={() => setReplyEmail(null)} onSnooze={onSnooze} />
      <div style={{ maxWidth: 680, margin: "24px auto", padding: "0 20px" }}>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Important Emails</h3>
              {onRefresh && (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh emails"
                  style={{
                    background: "none", border: "none", padding: 0, cursor: refreshing ? "default" : "pointer",
                    color: refreshing ? C.blu : C.mut, fontSize: 16, lineHeight: 1,
                    display: "flex", alignItems: "center",
                    animation: refreshing ? "spin 0.7s linear infinite" : "none",
                    transition: "color 0.2s",
                  }}
                >↻</button>
              )}
            </div>
            <span style={{ color: C.red, fontWeight: 700, fontSize: 13 }}>{unresolved} need attention</span>
          </div>

          {visibleEmails.map(e => (
            <HoverCard key={e.id} rows={[
              { label: "From", value: e.from },
              { label: "Subject", value: e.subj || "—" },
              { label: "Priority", value: e.p === "high" ? "High" : e.p === "med" ? "Medium" : "Normal", color: e.p === "high" ? C.red : e.p === "med" ? C.amb : undefined },
              { label: "Why", value: e.why || "—" },
              ...(e.contactContext ? [{ label: "Context", value: e.contactContext, color: C.blu }] : []),
              ...(e.time ? [{ label: "Time", value: e.time }] : []),
            ]}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ padding: 14, background: e.p === "high" ? C.redBg : "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${e.p === "high" ? C.red : e.p === "med" ? C.amb : C.mut}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <a
                    href={gmailUrl(e)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Gmail"
                    style={{ fontSize: 15, fontWeight: 700, color: C.tx, textDecoration: "none", flexShrink: 1 }}
                  >{e.from}</a>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                    <span style={{ fontSize: 11, color: C.mut }}>{e.time}</span>
                    <a href={gmailUrl(e)} target="_blank" rel="noopener noreferrer" title="Open in Gmail"
                      style={{ fontSize: 13, color: C.blu, textDecoration: "none", lineHeight: 1 }}>✉</a>
                  </div>
                </div>
                <a
                  href={gmailUrl(e)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 14, fontWeight: 600, marginTop: 2, display: "block", color: C.tx, textDecoration: "none" }}
                >{e.subj}</a>
                <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>→ {e.why}</div>
                {e.contactContext && (
                  <div style={{ fontSize: 11, color: C.blu, marginTop: 3, fontStyle: "italic" }}>{e.contactContext}</div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <SmartTip tipKey="suggestReply" tip={tip("suggestReply")} onSaved={onTipSaved}>
                    <button onClick={() => setReplyEmail(e)} style={{ ...btn2, padding: "5px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}>Suggest Reply</button>
                  </SmartTip>
                  <SmartTip tipKey="snooze" tip={tip("snooze")} onSaved={onTipSaved}>
                    <select onChange={ev => {
                      const val = ev.target.value;
                      ev.target.value = "";
                      if (!val) return;
                      if (val === "nw") { setNwPickEmailId(e.id); return; }
                      onSnooze(e.id, val);
                      post("/emails/action", { action: "snooze", emailId: e.id, snoozeUntil: val }).catch(() => {});
                    }} defaultValue="" style={{ ...btn2, padding: "5px 8px", fontSize: 11 }}>
                      <option value="">Snooze...</option>
                      <option value="1h">1 hour</option>
                      <option value="2h">2 hours</option>
                      <option value="tom">Tomorrow</option>
                      <option value="nw">Next week →</option>
                    </select>
                  </SmartTip>

                  {/* Training buttons */}
                  <button
                    title="Train: This email IS important"
                    onClick={() => startTraining(e, "thumbs_up")}
                    style={{
                      background: training?.emailId === e.id && training.vote === "thumbs_up" ? C.grnBg : "none",
                      border: training?.emailId === e.id && training.vote === "thumbs_up" ? `1.5px solid ${C.grn}` : "none",
                      borderRadius: 8, cursor: "pointer", fontSize: 16, padding: "2px 6px",
                    }}>👍</button>
                  <button
                    title="Train: This email is NOT important"
                    onClick={() => startTraining(e, "thumbs_down")}
                    style={{
                      background: training?.emailId === e.id && training.vote === "thumbs_down" ? C.redBg : "none",
                      border: training?.emailId === e.id && training.vote === "thumbs_down" ? `1.5px solid ${C.red}` : "none",
                      borderRadius: 8, cursor: "pointer", fontSize: 16, padding: "2px 6px",
                    }}>👎</button>
                </div>
              </div>

              {/* Next-week day picker */}
              {nwPickEmailId === e.id && (
                <div style={{ margin: "8px 0 2px", padding: "12px 14px", background: C.bluBg, borderRadius: 12, border: `1.5px solid ${C.blu}33` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.blu, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Pick a day next week
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {NW_DAYS.map((label, i) => {
                      const d = getNextWeekDay(i);
                      const dateStr = toDateStr(d);
                      return (
                        <button
                          key={label}
                          onClick={() => {
                            onSnooze(e.id, dateStr);
                            post("/emails/action", { action: "snooze", emailId: e.id, snoozeUntil: dateStr }).catch(() => {});
                            setNwPickEmailId(null);
                          }}
                          style={{
                            flex: 1, minWidth: 52, padding: "8px 4px", borderRadius: 10,
                            border: `1.5px solid ${C.blu}55`, background: C.card,
                            color: C.blu, fontFamily: F, fontSize: 11, fontWeight: 700,
                            cursor: "pointer", textAlign: "center", lineHeight: 1.4,
                          }}
                        >
                          <div>{label}</div>
                          <div style={{ fontSize: 10, fontWeight: 500, color: C.mut }}>{d.getMonth() + 1}/{d.getDate()}</div>
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setNwPickEmailId(null)}
                      style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.brd}`, background: "none", color: C.mut, fontFamily: F, fontSize: 11, cursor: "pointer" }}
                    >✕</button>
                  </div>
                </div>
              )}

              {/* Inline training reason capture */}
              {training && training.emailId === e.id && !training.saved && (
                <div style={{ margin: "6px 0 2px", padding: "12px 14px", background: "#FAFAF8", borderRadius: 10, border: `2px solid ${voteColor}30`, borderLeft: `4px solid ${voteColor}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: voteColor, marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    {voteLabel}
                  </div>
                  <div style={{ fontSize: 11, color: C.mut, marginBottom: 7 }}>
                    This trains your email brain. The reason helps Claude understand your priorities.
                  </div>
                  <input
                    autoFocus
                    placeholder="e.g. Chris is our equity partner — always reply fast"
                    value={training.reason}
                    onChange={ev => setTraining(prev => prev ? { ...prev, reason: ev.target.value } : null)}
                    onKeyDown={ev => { if (ev.key === "Enter") submitTraining(e); if (ev.key === "Escape") setTraining(null); }}
                    style={{ width: "100%", padding: "8px 11px", borderRadius: 8, border: `1.5px solid ${C.brd}`, fontSize: 13, fontFamily: F, boxSizing: "border-box", outline: "none", marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 7 }}>
                    <button
                      onClick={() => submitTraining(e)}
                      style={{ flex: 1, padding: "7px 0", background: voteColor, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                      Train Brain ↵
                    </button>
                    <button
                      onClick={() => submitTraining(e)}
                      style={{ padding: "7px 14px", background: C.card, color: C.sub, border: `1.5px solid ${C.brd}`, borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: F }}>
                      Skip reason
                    </button>
                    <button
                      onClick={() => setTraining(null)}
                      style={{ padding: "7px 10px", background: "none", color: C.mut, border: "none", cursor: "pointer", fontSize: 12, fontFamily: F }}>
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Saved confirmation */}
              {training && training.emailId === e.id && training.saved && (
                <div style={{ margin: "6px 0 2px", padding: "9px 14px", background: C.grnBg, borderRadius: 10, fontSize: 12, color: C.grn, fontWeight: 700 }}>
                  ✓ Brain updated — Claude will learn from this
                </div>
              )}
            </div>
            </HoverCard>
          ))}

          {unresolved === 0 && <div style={{ padding: 16, textAlign: "center", color: C.grn, fontWeight: 700, background: C.grnBg, borderRadius: 10 }}>All handled ✓</div>}

          {hiddenCount > 0 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              style={{ ...btn2, width: "100%", marginTop: 4, fontSize: 12, color: C.blu, borderColor: C.blu, textAlign: "center" }}
            >Show {hiddenCount} more important email{hiddenCount !== 1 ? "s" : ""} ▾</button>
          )}
          {showAll && unresolved > 3 && (
            <button
              onClick={() => setShowAll(false)}
              style={{ ...btn2, width: "100%", marginTop: 4, fontSize: 12, color: C.mut, textAlign: "center" }}
            >Show less ▴</button>
          )}
        </div>

        <div style={{ ...card, marginBottom: 16 }}>
          {/* FYI header */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>FYI</h3>
            <span style={{ fontSize: 13, color: C.mut, fontFamily: F }}>{emailsFyi.length} email{emailsFyi.length !== 1 ? "s" : ""} · no reply needed</span>
          </div>

          {emailsFyi.length === 0 && (
            <div style={{ fontSize: 13, color: C.mut, padding: "8px 0" }}>No FYI emails right now.</div>
          )}

          {emailsFyi.map(e => {
            const subjectLower = (e.subj || "").toLowerCase();
            const whyLower = (e.why || "").toLowerCase();
            const isContract = /contract|agreement|sign|signature|nda|escrow|closing|addendum|addend/.test(subjectLower + " " + whyLower);
            const isHot = !isContract && (e.p === "high" || /urgent|deadline|immediate|time.?sensitive|critical/.test(whyLower));
            const senderName = e.from.replace(/<[^>]+>/, "").trim() || e.from;
            const url = gmailUrl(e);

            if (isContract) {
              return (
                <div key={e.id} style={{
                  marginBottom: 10, padding: "12px 14px", borderRadius: 12,
                  border: `1.5px solid ${C.amb}55`, background: C.ambBg,
                  borderLeft: `4px solid ${C.amb}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.amb, textTransform: "uppercase", letterSpacing: 0.8, background: `${C.amb}22`, padding: "2px 8px", borderRadius: 20 }}>📄 Contract</span>
                    {e.time && <span style={{ fontSize: 11, color: C.mut, marginLeft: "auto" }}>{e.time}</span>}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, fontFamily: F }}>{senderName}</div>
                      <div style={{ fontSize: 13, color: C.sub, marginTop: 2, fontFamily: F }}>{e.subj}</div>
                      {e.why && <div style={{ fontSize: 12, color: C.mut, marginTop: 5, fontFamily: F }}>{e.why}</div>}
                    </div>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: C.amb, fontWeight: 700, textDecoration: "none", flexShrink: 0, padding: "4px 10px", border: `1.5px solid ${C.amb}55`, borderRadius: 20 }}>
                      Open →
                    </a>
                  </div>
                </div>
              );
            }

            return (
              <div key={e.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 0", borderBottom: `1px solid ${C.brd}`,
              }}>
                {isHot
                  ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, flexShrink: 0, display: "inline-block" }} />
                  : <span style={{ width: 8, flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, fontFamily: F, flexShrink: 0, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{senderName}</span>
                    <span style={{ fontSize: 12, color: C.sub, fontFamily: F, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>— {e.subj}</span>
                  </div>
                </div>
                {e.time && <span style={{ fontSize: 11, color: C.mut, flexShrink: 0, whiteSpace: "nowrap" }}>{e.time}</span>}
                <a href={url} target="_blank" rel="noopener noreferrer"
                  title="Open in Gmail"
                  style={{ fontSize: 14, color: C.blu, textDecoration: "none", flexShrink: 0, lineHeight: 1 }}>✉</a>
              </div>
            );
          })}
        </div>

        {emailsPromotions.length > 0 && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showPromotions ? 10 : 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Promotions/Spam</h3>
                <span style={{ fontSize: 13, color: C.mut, fontFamily: F }}>{emailsPromotions.length} email{emailsPromotions.length !== 1 ? "s" : ""} · low priority</span>
              </div>
              <button
                onClick={() => setShowPromotions(p => !p)}
                style={{ ...btn2, fontSize: 12, padding: "4px 10px", color: C.mut, borderColor: C.brd }}
              >
                {showPromotions ? "Hide ▴" : `Show ${emailsPromotions.length} promotion${emailsPromotions.length !== 1 ? "s" : ""} ▾`}
              </button>
            </div>
            {showPromotions && emailsPromotions.map(e => {
              const url = gmailUrl(e);
              const senderName = e.from.replace(/<[^>]+>/, "").trim() || e.from;
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.brd}` }}>
                  <span style={{ width: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.sub, fontFamily: F, flexShrink: 0, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{senderName}</span>
                      <span style={{ fontSize: 12, color: C.mut, fontFamily: F, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>— {e.subj}</span>
                    </div>
                  </div>
                  {e.time && <span style={{ fontSize: 11, color: C.mut, flexShrink: 0, whiteSpace: "nowrap" }}>{e.time}</span>}
                  <a href={url} target="_blank" rel="noopener noreferrer" title="Open in Gmail" style={{ fontSize: 14, color: C.mut, textDecoration: "none", flexShrink: 0, lineHeight: 1 }}>✉</a>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={onDone} style={{ ...btn1, width: "100%", marginBottom: 40 }}>
          Done — Show My Day →
        </button>
      </div>
    </>
  );
}
