import { useState, useEffect, useRef } from "react";
import { get, post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";

interface Props {
  open: boolean;
  onClose: () => void;
  prefillTo?: string;
  prefillSubject?: string;
  prefillBody?: string;
  prefillContactId?: string;
  prefillContactName?: string;
  replyToSnippet?: string;
  threadId?: string;
}

interface ContactSuggestion {
  name: string;
  email: string;
}

function ContactAutocomplete({
  value, onChange, placeholder, label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleInput = (v: string) => {
    onChange(v);
    clearTimeout(timeoutRef.current);
    const lastToken = v.split(",").pop()?.trim() || "";
    if (lastToken.length >= 2) {
      timeoutRef.current = setTimeout(async () => {
        try {
          const results = await get<ContactSuggestion[]>(`/contacts/autocomplete?q=${encodeURIComponent(lastToken)}`);
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        } catch {
          setSuggestions([]);
        }
      }, 200);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (s: ContactSuggestion) => {
    const parts = value.split(",").map(p => p.trim()).filter(Boolean);
    parts.pop();
    const display = s.name ? `${s.name} <${s.email}>` : s.email;
    parts.push(display);
    onChange(parts.join(", "));
    setShowSuggestions(false);
  };

  return (
    <div style={{ marginBottom: 12, position: "relative" }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>{label}</label>
      <input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        style={{ ...inp, fontSize: 14 }}
      />
      {showSuggestions && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8,
          maxHeight: 200, overflow: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => selectSuggestion(s)}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 13,
                borderBottom: i < suggestions.length - 1 ? `1px solid ${C.brd}` : "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontWeight: 600 }}>{s.name || s.email}</div>
              {s.name && <div style={{ fontSize: 11, color: C.mut }}>{s.email}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmailCompose({
  open, onClose,
  prefillTo, prefillSubject, prefillBody, prefillContactId, prefillContactName,
  replyToSnippet, threadId,
}: Props) {
  const [to, setTo] = useState(prefillTo || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(prefillSubject || "");
  const [body, setBody] = useState(prefillBody || "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(prefillTo || "");
      setSubject(prefillSubject || "");
      setBody(prefillBody || "");
      setCc("");
      setBcc("");
      setSent(false);
      setError("");
    }
  }, [open, prefillTo, prefillSubject, prefillBody]);

  const handleAiDraft = async () => {
    setAiDrafting(true);
    setError("");
    try {
      const result = await post<{ ok: boolean; draft: string; suggestedSubject?: string }>("/email/suggest-draft", {
        to,
        subject,
        contactName: prefillContactName,
        replyToSnippet,
        context: body || undefined,
      });
      if (result.draft) setBody(result.draft);
      if (result.suggestedSubject && !subject) setSubject(result.suggestedSubject);
    } catch {
      setError("Failed to generate AI draft");
    }
    setAiDrafting(false);
  };

  const handleSend = async () => {
    if (!to || !subject || !body) {
      setError("To, Subject, and Body are required");
      return;
    }
    setSending(true);
    setError("");
    try {
      await post("/email/send", {
        to, cc: cc || undefined, bcc: bcc || undefined, subject, body,
        threadId: threadId || undefined,
        contactId: prefillContactId || undefined,
      });
      setSent(true);
      setTimeout(onClose, 1500);
    } catch {
      setError("Failed to send email. Check your connection and try again.");
    }
    setSending(false);
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 28, width: 600, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto" }}>

        {sent ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#10003;</div>
            <div style={{ fontFamily: FS, fontSize: 20, color: C.grn }}>Email Sent</div>
            <div style={{ fontSize: 13, color: C.mut, marginTop: 6 }}>Sent from tony@flipiq.com</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontFamily: FS, fontSize: 20, margin: 0 }}>
                {replyToSnippet ? "Reply" : "Compose Email"}
              </h3>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.mut }}>&#10005;</button>
            </div>

            <ContactAutocomplete value={to} onChange={setTo} placeholder="name@example.com" label="To" />
            <ContactAutocomplete value={cc} onChange={setCc} placeholder="cc@example.com" label="CC (optional)" />
            <ContactAutocomplete value={bcc} onChange={setBcc} placeholder="bcc@example.com" label="BCC (optional)" />

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" style={{ ...inp, fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1 }}>Body</label>
                <button
                  onClick={handleAiDraft}
                  disabled={aiDrafting}
                  style={{ ...btn2, padding: "4px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}
                >
                  {aiDrafting ? "Drafting..." : "AI Draft"}
                </button>
              </div>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your email here..."
                style={{ ...inp, minHeight: 180, resize: "vertical", fontSize: 14, lineHeight: 1.6 } as React.CSSProperties}
              />
            </div>

            {error && (
              <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ ...btn2, padding: "10px 20px" }}>Cancel</button>
              <button
                onClick={handleSend}
                disabled={sending || !to || !subject || !body}
                style={{
                  ...btn1,
                  padding: "10px 28px",
                  opacity: (sending || !to || !subject || !body) ? 0.4 : 1,
                }}
              >
                {sending ? "Sending..." : "Send via Gmail"}
              </button>
            </div>

            <div style={{ fontSize: 10, color: C.mut, marginTop: 10, textAlign: "center" }}>
              Sends directly from tony@flipiq.com via Gmail API
            </div>
          </>
        )}
      </div>
    </div>
  );
}
