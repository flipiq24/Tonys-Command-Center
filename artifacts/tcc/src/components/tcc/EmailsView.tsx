import { useState, useRef } from "react";
import { post } from "@/lib/api";
import { C, F, FS, card, btn1, btn2, TIPS } from "./constants";
import { SmartTip } from "./SmartTip";
import { EmailReplyModal } from "./EmailReplyModal";
import type { EmailItem } from "./types";

interface Props {
  emailsImportant: EmailItem[];
  emailsFyi: EmailItem[];
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

export function EmailsView({ emailsImportant, emailsFyi, snoozed, customTips, onSnooze, onDone, onTipSaved, onRefresh }: Props) {
  const [replyEmail, setReplyEmail] = useState<EmailItem | null>(null);
  const [training, setTraining] = useState<TrainingState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = async () => {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => setRefreshing(false), 600);
    }
  };
  const unresolved = emailsImportant.filter(e => !snoozed[e.id]).length;
  const tip = (key: string) => (customTips ?? {})[key] ?? TIPS[key] ?? "";

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
      <EmailReplyModal email={replyEmail} onClose={() => setReplyEmail(null)} />
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

          {emailsImportant.filter(e => !snoozed[e.id]).map(e => (
            <div key={e.id} style={{ marginBottom: 10 }}>
              <div style={{ padding: 14, background: e.p === "high" ? C.redBg : "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${e.p === "high" ? C.red : e.p === "med" ? C.amb : C.mut}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{e.from}</span>
                  <span style={{ fontSize: 11, color: C.mut }}>{e.time}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{e.subj}</div>
                <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>→ {e.why}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <SmartTip tipKey="suggestReply" tip={tip("suggestReply")} onSaved={onTipSaved}>
                    <button onClick={() => setReplyEmail(e)} style={{ ...btn2, padding: "5px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}>Suggest Reply</button>
                  </SmartTip>
                  <SmartTip tipKey="snooze" tip={tip("snooze")} onSaved={onTipSaved}>
                    <select onChange={ev => {
                      if (ev.target.value) {
                        onSnooze(e.id, ev.target.value);
                        post("/emails/action", { action: "snooze", emailId: e.id, snoozeUntil: ev.target.value }).catch(() => {});
                        ev.target.value = "";
                      }
                    }} defaultValue="" style={{ ...btn2, padding: "5px 8px", fontSize: 11 }}>
                      <option value="">Snooze...</option>
                      <option value="1h">1 hour</option>
                      <option value="2h">2 hours</option>
                      <option value="tom">Tomorrow</option>
                      <option value="nw">Next week</option>
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
          ))}

          {unresolved === 0 && <div style={{ padding: 16, textAlign: "center", color: C.grn, fontWeight: 700, background: C.grnBg, borderRadius: 10 }}>All handled ✓</div>}
        </div>

        <div style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ fontFamily: FS, fontSize: 19, margin: "0 0 14px" }}>FYI — No Reply Needed</h3>
          {emailsFyi.map(e => (
            <div key={e.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.brd}` }}>
              <div style={{ fontSize: 14 }}><strong>{e.from}</strong> — {e.subj}</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>{e.why}</div>
            </div>
          ))}
        </div>

        <button onClick={onDone} style={{ ...btn1, width: "100%", marginBottom: 40 }}>
          Done — Show My Day →
        </button>
      </div>
    </>
  );
}
