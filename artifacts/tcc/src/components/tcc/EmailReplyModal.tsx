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

function gmailLink(threadId: string | null, msgId?: string): string {
  if (threadId) return `https://mail.google.com/mail/u/0/#all/${threadId}`;
  if (msgId) return `https://mail.google.com/mail/u/0/#all/${msgId}`;
  return "https://mail.google.com/mail/u/0/";
}

export function EmailReplyModal({ email, onClose, onSnooze }: Props) {
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");
  const [showNwPick, setShowNwPick] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [threadBody, setThreadBody] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showThread, setShowThread] = useState(false);
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

  async function fetchThread() {
    if (!email?.gmailMessageId) return;
    setThreadLoading(true);
    try {
      const r = await post<{ ok: boolean; body: string | null; threadId: string | null }>(
        "/emails/action",
        { action: "fetch_thread", gmailMessageId: email.gmailMessageId }
      );
      setThreadBody(r.body);
      setThreadId(r.threadId);
    } catch {
      setThreadBody(null);
    } finally {
      setThreadLoading(false);
    }
  }

  useEffect(() => {
    if (!email) return;
    setDraft("");
    setNotes("");
    setSent(false);
    setSendError("");
    setSnoozed(false);
    setShowNwPick(false);
    setCopied(false);
    setThreadBody(null);
    setThreadId(null);
    setShowThread(false);
    fetchThread();
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
    // Auto-close after the success state has had time to register so Tony
    // can move on without a stray click.
    setTimeout(() => onClose(), 1500);
  }

  async function copyDraft() {
    if (!draft.trim()) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select + copy
    }
  }

  if (!email) return null;

  const link = gmailLink(threadId, email.gmailMessageId);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "stretch", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 700, background: C.card, display: "flex", flexDirection: "column",
          margin: "0 auto", boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
        }}
      >
        {/* ── Header ── */}
        <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${C.brd}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FS, fontSize: 18, fontWeight: 800, color: C.tx, marginBottom: 3 }}>
                Reply
              </div>
              <div style={{ fontSize: 12, color: C.sub, fontFamily: F }}>
                <span style={{ fontWeight: 600, color: C.tx }}>{email.from}</span>
                <span style={{ color: C.mut }}> · </span>
                <span style={{ color: C.sub }}>{email.subj}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.mut, padding: "0 0 0 12px", lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Context card: Why important + Action needed ── */}
          {(email.why || email.p) && (
            <div style={{ background: "#F8F8F6", border: `1px solid ${C.brd}`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 16, flexWrap: "wrap" }}>
              {email.why && (
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: C.sub, marginBottom: 4 }}>Why Important</div>
                  <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.5 }}>{email.why}</div>
                </div>
              )}
              {email.p && (
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: C.amb, marginBottom: 4 }}>Action Needed</div>
                  <div style={{ fontSize: 12, color: C.tx, fontWeight: 600, lineHeight: 1.5 }}>{email.p}</div>
                </div>
              )}
            </div>
          )}

          {/* ── Email thread content ── */}
          <div>
            <button
              onClick={() => setShowThread(v => !v)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 11, fontWeight: 700, color: C.sub, fontFamily: F,
              }}
            >
              <span style={{ fontSize: 10, color: C.mut, transition: "transform 0.15s", display: "inline-block", transform: showThread ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
              {threadLoading ? "Loading email content..." : (showThread ? "Hide email content" : "Show email content")}
            </button>

            {showThread && (
              <div style={{
                marginTop: 8, padding: "12px 14px",
                background: "#FAFAFA", border: `1px solid ${C.brd}`,
                borderRadius: 8, fontSize: 12, color: C.sub,
                lineHeight: 1.65, maxHeight: 220, overflowY: "auto",
                fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {threadLoading
                  ? "Fetching content..."
                  : (threadBody || "No readable content found for this email.")}
              </div>
            )}
          </div>

          {/* ── Draft reply ── */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontFamily: FS, fontSize: 13, fontWeight: 700, color: C.tx }}>Your Reply</div>
              <button
                onClick={() => fetchDraft(notes)}
                disabled={loading}
                style={{ ...btn2, fontSize: 11, padding: "3px 10px", color: C.blu, borderColor: C.blu, opacity: loading ? 0.5 : 1 }}
              >
                {loading ? "Drafting..." : "↻ Regenerate"}
              </button>
            </div>
            {loading ? (
              <div style={{
                minHeight: 160, background: C.bluBg, borderRadius: 10, border: `1.5px solid ${C.blu}33`,
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
                style={{ ...inp, minHeight: 180, resize: "vertical", lineHeight: 1.7, fontSize: 13, fontFamily: F }}
              />
            )}

            {/* Copy + Open Gmail row */}
            {!loading && draft.trim() && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={copyDraft}
                  style={{
                    flex: 1, padding: "8px 0", border: `1px solid ${C.brd}`, borderRadius: 8,
                    background: copied ? C.grnBg : "transparent", cursor: "pointer",
                    fontFamily: F, fontSize: 12, fontWeight: 600,
                    color: copied ? C.grn : C.sub, transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}
                >
                  {copied ? "✓ Copied!" : "⎘ Copy Reply"}
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={copyDraft}
                  style={{
                    flex: 2, padding: "8px 0", border: `1px solid ${C.blu}55`, borderRadius: 8,
                    background: C.bluBg, cursor: "pointer",
                    fontFamily: F, fontSize: 12, fontWeight: 700,
                    color: C.blu, textDecoration: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  📋 Copy & Open in Gmail →
                </a>
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          <div>
            <div style={{ fontFamily: FS, fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
              Notes / Context
            </div>
            <VoiceField
              as="textarea"
              value={notes}
              onChange={setNotes}
              placeholder="Add context for a better draft (e.g. 'he's interested, schedule a call for next Tuesday')..."
              style={{ ...inp, minHeight: 60, resize: "vertical", fontSize: 12, fontFamily: F, color: C.sub }}
            />
            {notes.trim() && (
              <button
                onClick={() => fetchDraft(notes)}
                disabled={loading}
                style={{ ...btn2, marginTop: 6, fontSize: 11, padding: "4px 12px", color: C.blu, borderColor: C.blu, opacity: loading ? 0.5 : 1 }}
              >
                ↻ Regenerate with notes
              </button>
            )}
          </div>

          {/* ── Snooze ── */}
          <div>
            <div style={{ fontFamily: FS, fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
              Snooze this email
            </div>
            {snoozed ? (
              <div style={{ fontSize: 13, color: C.grn, fontFamily: F }}>✓ Snoozed</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {SNOOZE_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleSnooze(opt.value)}
                      style={{ ...btn2, fontSize: 12, padding: "5px 13px" }}
                    >{opt.label}</button>
                  ))}
                  <button onClick={() => setShowNwPick(v => !v)}
                    style={{ ...btn2, fontSize: 12, padding: "5px 13px", color: showNwPick ? C.blu : undefined, borderColor: showNwPick ? C.blu : undefined }}
                  >Next week →</button>
                </div>
                {showNwPick && (
                  <div style={{ marginTop: 10, padding: "12px 14px", background: C.bluBg, borderRadius: 10, border: `1.5px solid ${C.blu}33` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.blu, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Pick a day next week
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {NW_DAYS.map((label, i) => {
                        const d = getNextWeekDay(i);
                        const dateStr = d.toISOString().split("T")[0];
                        return (
                          <button key={label} onClick={() => handleSnooze(dateStr)}
                            style={{
                              flex: 1, minWidth: 52, padding: "7px 4px", borderRadius: 8,
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

        {/* ── Footer ── */}
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.brd}`, display: "flex", gap: 10, flexShrink: 0, background: C.card }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1, fontSize: 13, padding: "11px 0" }}>
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
              style={{ ...btn1, flex: 2, fontSize: 13, padding: "11px 0", opacity: (sending || loading || !draft.trim()) ? 0.5 : 1 }}
            >
              {sending ? "Sending..." : "Send Reply"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
