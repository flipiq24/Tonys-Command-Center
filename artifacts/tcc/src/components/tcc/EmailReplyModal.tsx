import { useState, useEffect, useRef } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";
import { VoiceField } from "./VoiceField";
import type { EmailItem } from "./types";

interface Props {
  email: EmailItem | null;
  onClose: () => void;
  onSnooze?: (emailId: number, until: string) => void;
}

const SNOOZE_OPTIONS = [
  { value: "1h", label: "1 hour" },
  { value: "2h", label: "2 hours" },
  { value: "tom", label: "Tomorrow" },
];

function getNextWeekDay(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const toMon = day === 0 ? 1 : 8 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + toMon + offset);
  return d;
}
const NW_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function EmailReplyModal({ email, onClose, onSnooze }: Props) {
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");
  const [showNwPick, setShowNwPick] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function fetchDraft(extraNotes?: string) {
    if (!email) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSendError("");
    post<{ ok: boolean; draft?: string }>("/emails/action", {
      action: "suggest_reply",
      sender: email.from,
      subject: email.subj,
      gmailMessageId: email.gmailMessageId,
      notes: extraNotes ?? notes,
    }).then(r => {
      if (controller.signal.aborted) return;
      setDraft(r.draft || "");
      setLoading(false);
    }).catch(err => {
      if (controller.signal.aborted) return;
      console.error("[EmailReplyModal] Draft fetch failed:", err);
      setLoading(false);
    });
    return () => controller.abort();
  }

  useEffect(() => {
    if (!email) return;
    setDraft("");
    setNotes("");
    setSent(false);
    setSendError("");
    setSnoozed(false);
    setShowNwPick(false);
    return fetchDraft("");
  }, [email]);

  async function handleSend() {
    if (!email || !draft.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const r = await post<{ ok: boolean; error?: string }>("/emails/action", {
        action: "send_reply",
        sender: email.from,
        subject: email.subj,
        body: draft,
        gmailMessageId: email.gmailMessageId,
      });
      if (r.ok) {
        setSent(true);
        setTimeout(() => onClose(), 1500);
      } else {
        setSendError(r.error || "Send failed — try again");
      }
    } catch {
      setSendError("Send failed — try again");
    } finally {
      setSending(false);
    }
  }

  function handleSnooze(val: string) {
    if (!email) return;
    onSnooze?.(email.id, val);
    post("/emails/action", { action: "snooze", emailId: email.id, snoozeUntil: val }).catch(() => {});
    setSnoozed(true);
    setShowNwPick(false);
  }

  if (!email) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "stretch", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 680, background: C.card, display: "flex", flexDirection: "column",
          margin: "0 auto", boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
        }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.brd}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: FS, fontSize: 20, fontWeight: 800, color: C.tx, marginBottom: 4 }}>
                Reply
              </div>
              <div style={{ fontSize: 13, color: C.sub, fontFamily: F }}>
                <span style={{ fontWeight: 600, color: C.tx }}>{email.from}</span>
                <span style={{ color: C.mut }}> · </span>
                <span>{email.subj}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.mut, padding: "0 0 0 12px", lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Draft reply section */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: FS, fontSize: 14, fontWeight: 700, color: C.tx }}>Your Reply</div>
              <button
                onClick={() => fetchDraft(notes)}
                disabled={loading}
                style={{ ...btn2, fontSize: 11, padding: "4px 12px", color: C.blu, borderColor: C.blu, opacity: loading ? 0.5 : 1 }}
              >
                {loading ? "Drafting..." : "↻ Regenerate"}
              </button>
            </div>
            {loading ? (
              <div style={{
                minHeight: 180, background: C.bluBg, borderRadius: 12, border: `1.5px solid ${C.blu}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.blu, fontFamily: F, fontSize: 13,
              }}>
                AI is drafting your reply...
              </div>
            ) : (
              <VoiceField
                as="textarea"
                value={draft}
                onChange={setDraft}
                placeholder="Your reply..."
                style={{
                  ...inp,
                  minHeight: 200,
                  resize: "vertical",
                  lineHeight: 1.7,
                  fontSize: 14,
                  fontFamily: F,
                }}
              />
            )}
          </div>

          {/* Notes section */}
          <div>
            <div style={{ fontFamily: FS, fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 10 }}>
              Notes / Context
            </div>
            <VoiceField
              as="textarea"
              value={notes}
              onChange={setNotes}
              placeholder="Add context for a better draft (e.g. 'he's interested, schedule a call for next Tuesday')..."
              style={{
                ...inp,
                minHeight: 80,
                resize: "vertical",
                fontSize: 13,
                fontFamily: F,
                color: C.sub,
              }}
            />
          </div>

          {/* Snooze section */}
          <div>
            <div style={{ fontFamily: FS, fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 10 }}>
              Snooze this email
            </div>
            {snoozed ? (
              <div style={{ fontSize: 13, color: C.grn, fontFamily: F }}>✓ Snoozed</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {SNOOZE_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleSnooze(opt.value)}
                      style={{ ...btn2, fontSize: 12, padding: "6px 14px" }}
                    >{opt.label}</button>
                  ))}
                  <button onClick={() => setShowNwPick(v => !v)}
                    style={{ ...btn2, fontSize: 12, padding: "6px 14px", color: showNwPick ? C.blu : undefined, borderColor: showNwPick ? C.blu : undefined }}
                  >Next week →</button>
                </div>
                {showNwPick && (
                  <div style={{ marginTop: 10, padding: "12px 14px", background: C.bluBg, borderRadius: 12, border: `1.5px solid ${C.blu}33` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.blu, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Pick a day next week
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {NW_DAYS.map((label, i) => {
                        const d = getNextWeekDay(i);
                        const dateStr = d.toISOString().split("T")[0];
                        return (
                          <button key={label} onClick={() => handleSnooze(dateStr)}
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
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {sendError && (
            <div style={{ fontSize: 13, color: C.red, fontFamily: F, padding: "10px 14px", background: C.redBg, borderRadius: 10 }}>
              {sendError}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.brd}`, display: "flex", gap: 10, flexShrink: 0, background: C.card }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1, fontSize: 14, padding: "12px 0" }}>
            Cancel
          </button>
          {sent ? (
            <div style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", color: C.grn, fontWeight: 700, fontSize: 15, fontFamily: F }}>
              ✓ Sent!
            </div>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending || loading || !draft.trim()}
              style={{ ...btn1, flex: 2, fontSize: 14, padding: "12px 0", opacity: (sending || loading || !draft.trim()) ? 0.5 : 1 }}
            >
              {sending ? "Sending..." : "Send Reply"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
