import { useState, useEffect, useCallback, useRef } from "react";
import { get, post } from "@/lib/api";

const TODAY_STR = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const F = "'Instrument Sans','DM Sans',-apple-system,sans-serif";
const FS = "'Instrument Serif','DM Serif Display',Georgia,serif";
const C = {
  bg: "#F7F6F3", card: "#FFF", brd: "#E8E6E1", tx: "#1A1A1A",
  sub: "#6B6B6B", mut: "#A3A3A3", red: "#C62828", grn: "#2E7D32",
  amb: "#E65100", blu: "#1565C0", redBg: "#FFEBEE", grnBg: "#E8F5E9",
  ambBg: "#FFF3E0", bluBg: "#E3F2FD",
};
const SC: Record<string, string> = { Hot: C.red, Warm: C.amb, New: C.blu, Cold: C.mut };

const TIPS: Record<string, string> = {
  checkin: "Morning gate. System locked until done. Bedtime, wake, Bible, workout, journal, nutrition, unplug. Saved to database.",
  journal: "Brain dump. Auto-formats: Mood, Key Events, Reflection. Saved to database.",
  ideas: "Capture ideas. Auto-prioritizes against business plan. Tech → Slack notification.",
  gmail: "Important Emails with reply/snooze/train. FYI (no reply). Badge shows unresolved.",
  snooze: "Removes email until chosen time.",
  suggestReply: "AI drafts reply in Tony's voice. You approve. Goes to Gmail drafts.",
  attempt: "Log call attempt. Give follow-up instructions. AI drafts email.",
  connected: "Log outcome, notes, next step, follow-up.",
  eod: "Generate EOD report and send to tony@flipiq.com and ethan@flipiq.com.",
  chat: "Open AI chat for any question or request.",
};

const card: React.CSSProperties = { background: C.card, borderRadius: 14, padding: "20px 24px", border: `1px solid ${C.brd}` };
const inp: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 10, border: `2px solid ${C.brd}`, fontSize: 15, fontFamily: F, boxSizing: "border-box", outline: "none" };
const btn1: React.CSSProperties = { padding: "14px 28px", background: C.tx, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F };
const btn2: React.CSSProperties = { padding: "10px 18px", background: C.card, color: C.tx, border: `2px solid ${C.brd}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 };

interface CalItem { t: string; n: string; loc?: string; note?: string; real?: boolean; }
interface EmailItem { id: number; from: string; subj: string; why: string; time?: string; p?: string; }
interface TaskItem { id: string; text: string; cat: string; sales?: boolean; }
interface Contact { id: string | number; name: string; company?: string; status?: string; phone?: string; email?: string; nextStep?: string; lastContactDate?: string; }
interface CallEntry { id?: string; contactName: string; type: string; notes?: string; createdAt?: string; }
interface Idea { id: string; text: string; category: string; urgency: string; techType?: string; priorityPosition?: number; }

function Tip({ tip, children }: { tip: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 260, background: "#1A1A1A", color: "#fff", borderRadius: 10, padding: "10px 12px", zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", fontSize: 11, lineHeight: 1.5, pointerEvents: "none" }}>
          {tip}
          <div style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)", width: 10, height: 10, background: "#1A1A1A", rotate: "45deg" }} />
        </div>
      )}
    </div>
  );
}

function ClaudeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");

  const send = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const r = await post<{ text: string; ok: boolean }>("/claude", { prompt });
      setResponse(r.text);
    } catch {
      setResponse("Claude API unavailable — check your connection.");
    }
    setLoading(false);
  };

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, padding: 28, width: 520, maxWidth: "90vw", maxHeight: "80vh", overflow: "auto" }}>
        <h3 style={{ fontFamily: FS, fontSize: 20, margin: "0 0 4px" }}>Ask Tony's AI</h3>
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 16px" }}>Draft emails, get accountability, ask anything.</p>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What do you need?" style={{ ...inp, minHeight: 80, resize: "vertical", marginBottom: 12 }} />
        {response && <div style={{ padding: 14, background: C.grnBg, borderRadius: 10, fontSize: 13, lineHeight: 1.7, color: C.tx, marginBottom: 12, whiteSpace: "pre-wrap" }}>{response}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1 }}>Close</button>
          <button onClick={send} disabled={loading || !prompt.trim()} style={{ ...btn1, flex: 2, opacity: loading || !prompt.trim() ? 0.5 : 1 }}>
            {loading ? "Thinking..." : "Send →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IdeasModal({ open, onClose, onSave, count }: { open: boolean; onClose: () => void; onSave: (idea: Idea) => void; count: number }) {
  const CATS = ["Tech", "Sales", "Marketing", "Strategic Partners", "Operations", "Product", "Personal"];
  const URG = ["Now", "This Week", "This Month", "Someday"];
  const [newIdea, setNewIdea] = useState({ text: "", cat: "Tech", urg: "This Week", tt: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!newIdea.text.trim()) return;
    setSaving(true);
    try {
      const idea = await post<Idea>("/ideas", {
        text: newIdea.text, category: newIdea.cat, urgency: newIdea.urg, techType: newIdea.tt || undefined
      });
      onSave(idea);
      setNewIdea({ text: "", cat: "Tech", urg: "This Week", tt: "" });
      onClose();
    } catch { /* silent */ }
    setSaving(false);
  };

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, padding: 28, width: 480, maxWidth: "90vw" }}>
        <h3 style={{ fontFamily: FS, fontSize: 20, margin: "0 0 4px" }}>What's your brilliant idea?</h3>
        <p style={{ fontSize: 13, color: C.mut, margin: "0 0 16px" }}>That'll be #{count + 1} — {count} ahead of it.</p>
        <textarea value={newIdea.text} onChange={e => setNewIdea({ ...newIdea, text: e.target.value })} placeholder="Speak or type..." style={{ ...inp, minHeight: 70, resize: "vertical", marginBottom: 14 }} />
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Category</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {CATS.map(c => <button key={c} onClick={() => setNewIdea({ ...newIdea, cat: c })} style={{ padding: "5px 12px", borderRadius: 8, border: `2px solid ${newIdea.cat === c ? C.tx : C.brd}`, background: newIdea.cat === c ? C.tx : C.card, color: newIdea.cat === c ? "#fff" : C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{c}</button>)}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Urgency</label>
          <div style={{ display: "flex", gap: 5 }}>
            {URG.map(u => <button key={u} onClick={() => setNewIdea({ ...newIdea, urg: u })} style={{ padding: "5px 12px", borderRadius: 8, border: `2px solid ${newIdea.urg === u ? (u === "Now" ? C.red : C.tx) : C.brd}`, background: newIdea.urg === u ? (u === "Now" ? C.red : C.tx) : C.card, color: newIdea.urg === u ? "#fff" : C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{u}</button>)}
          </div>
        </div>
        {newIdea.cat === "Tech" && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Type</label>
            <div style={{ display: "flex", gap: 5 }}>
              {["Bug", "Feature", "Idea"].map(t => <button key={t} onClick={() => setNewIdea({ ...newIdea, tt: t })} style={{ padding: "5px 12px", borderRadius: 8, border: `2px solid ${newIdea.tt === t ? C.blu : C.brd}`, background: newIdea.tt === t ? C.bluBg : C.card, color: newIdea.tt === t ? C.blu : C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{t}</button>)}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1 }}>Cancel</button>
          <button onClick={save} disabled={saving || !newIdea.text.trim()} style={{ ...btn1, flex: 2, opacity: saving || !newIdea.text.trim() ? 0.5 : 1 }}>
            {saving ? "Parking..." : "Park It — Make Calls"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttemptModal({ contact, onClose, onLog }: { contact: { id: string | number; name: string } | null; onClose: () => void; onLog: (call: CallEntry) => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!contact) return;
    setSaving(true);
    try {
      const call = await post<CallEntry>("/calls", {
        contactName: contact.name, type: "attempt", notes: note || undefined, instructions: note || undefined
      });
      onLog(call);
    } catch { /* silent */ }
    setSaving(false);
    onClose();
  };

  if (!contact) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 4px" }}>Attempt — {contact.name}</h3>
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 12px" }}>Instructions for follow-up:</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder='"No answer, send email about demo..."' style={{ ...inp, minHeight: 80, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={btn2}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btn1, opacity: saving ? 0.5 : 1 }}>{saving ? "Logging..." : "Log & Follow-up"}</button>
        </div>
      </div>
    </div>
  );
}

function EmailReplyModal({ email, onClose }: { email: EmailItem | null; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email) return;
    setDraft("");
    setLoading(true);
    post<{ ok: boolean; draft?: string }>("/emails/action", {
      action: "suggest_reply", sender: email.from, subject: email.subj
    }).then(r => { setDraft(r.draft || ""); setLoading(false); }).catch(() => setLoading(false));
  }, [email]);

  if (!email) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, width: 520, maxWidth: "90vw" }}>
        <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 4px" }}>Suggested Reply</h3>
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 12px" }}>To: {email.from} · Re: {email.subj}</p>
        {loading ? <div style={{ padding: 20, textAlign: "center", color: C.mut }}>AI is drafting...</div> :
          <textarea value={draft} onChange={e => setDraft(e.target.value)} style={{ ...inp, minHeight: 140, resize: "vertical", marginBottom: 12 }} />
        }
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1 }}>Cancel</button>
          <button onClick={() => { navigator.clipboard?.writeText(draft); onClose(); }} style={{ ...btn1, flex: 2 }}>Copy & Close</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<string>("checkin");
  const [clock, setClock] = useState(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));

  // Check-in
  const [ck, setCk] = useState({ bed: "", wake: "", sleep: "", bible: false, workout: false, journal: false, nut: "Good", unplug: false, done: false });
  const [ckSaving, setCkSaving] = useState(false);

  // Journal
  const [jTxt, setJTxt] = useState("");
  const [jDone, setJDone] = useState(false);
  const [jSaving, setJSaving] = useState(false);
  const [jFormatted, setJFormatted] = useState("");

  // Emails
  const [snoozed, setSnoozed] = useState<Record<number, string>>({});
  const [emailsDone, setEmailsDone] = useState(false);
  const [replyEmail, setReplyEmail] = useState<EmailItem | null>(null);

  // Brief
  const [brief, setBrief] = useState<{ calendarData: CalItem[]; emailsImportant: EmailItem[]; emailsFyi: EmailItem[]; tasks: TaskItem[] } | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Tasks
  const [tDone, setTDone] = useState<Record<string, boolean>>({});

  // Sales
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [demos, setDemos] = useState(0);
  const [attempt, setAttempt] = useState<{ id: string | number; name: string } | null>(null);
  const [calSide, setCalSide] = useState(false);

  // Ideas
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [showIdea, setShowIdea] = useState(false);

  // Chat
  const [showChat, setShowChat] = useState(false);
  const [eod, setEod] = useState(false);

  // UI
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const i = setInterval(() => setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })), 30000);
    return () => clearInterval(i);
  }, []);

  // Load today's state from DB on mount
  useEffect(() => {
    (async () => {
      try {
        const [checkin, journal, briefData, callData, ideaData, demoData] = await Promise.all([
          get<{ id?: string; done?: boolean; bed?: string; wake?: string; sleep?: string; bible?: boolean; workout?: boolean; journal?: boolean; nut?: string; unplug?: boolean; bedtime?: string; waketime?: string; sleepHours?: string; nutrition?: string }>("/checkin/today").catch(() => null),
          get<{ formattedText?: string; rawText?: string }>("/journal/today").catch(() => null),
          get<{ calendarData: CalItem[]; emailsImportant: EmailItem[]; emailsFyi: EmailItem[]; tasks: TaskItem[] }>("/brief/today").catch(() => null),
          get<CallEntry[]>("/calls").catch(() => []),
          get<Idea[]>("/ideas").catch(() => []),
          get<{ count: number }>("/demos/count").catch(() => ({ count: 0 })),
        ]);

        if (checkin) {
          const done = !!(checkin.id && checkin.done !== false);
          setCk({
            bed: checkin.bedtime || checkin.bed || "",
            wake: checkin.waketime || checkin.wake || "",
            sleep: checkin.sleepHours || checkin.sleep || "",
            bible: checkin.bible || false,
            workout: checkin.workout || false,
            journal: checkin.journal || false,
            nut: checkin.nutrition || checkin.nut || "Good",
            unplug: checkin.unplug || false,
            done,
          });
          if (done) setView("journal");
        }

        if (journal?.formattedText || journal?.rawText) {
          setJDone(true);
          setJFormatted(journal.formattedText || journal.rawText || "");
          if (checkin?.id) setView("emails");
        }

        if (briefData) setBrief(briefData);
        if (callData) setCalls(callData);
        if (ideaData) setIdeas(ideaData);
        if (demoData) setDemos(demoData.count);
      } catch {
        /* start fresh */
      }
      setLoading(false);
    })();
  }, []);

  // Load contacts when entering sales view
  useEffect(() => {
    if (view === "sales" && contacts.length === 0) {
      get<Contact[]>("/contacts").then(c => {
        if (c.length > 0) setContacts(c);
        else {
          // Default contacts
          setContacts([
            { id: "1", name: "Mike Oyoque", company: "MR EXCELLENCE", status: "Warm", phone: "(555) 123-4567", nextStep: "Follow up demo", lastContactDate: "Mar 25" },
            { id: "2", name: "Xander Clemens", company: "Family Office Club", status: "Hot", phone: "(555) 234-5678", nextStep: "Intro call — 10K investors", lastContactDate: "Mar 30" },
            { id: "3", name: "Fernando Perez", company: "Park Ave Capital", status: "New", phone: "(555) 345-6789", nextStep: "Call re: Chino", lastContactDate: "Today" },
            { id: "4", name: "Tony Fletcher", company: "LPT/FairClose", status: "Warm", phone: "(555) 456-7890", nextStep: "Broker Playbook", lastContactDate: "Apr 1" },
            { id: "5", name: "Kyle Draper", company: "", status: "New", phone: "(555) 567-8901", nextStep: "Demo?", lastContactDate: "Mar 28" },
            { id: "6", name: "Chris Craddock", company: "EXP Realty", status: "New", phone: "(555) 678-9012", nextStep: "#1 EXP recruiter", lastContactDate: "Never" },
          ]);
        }
      }).catch(() => {});
    }
  }, [view]);

  const upCk = (k: string, v: unknown) => {
    const u = { ...ck, [k]: v };
    if (u.bed && u.wake) {
      try {
        const parse = (t: string) => {
          const m = t.match(/(\d+):?(\d*)\s*(am|pm)?/i);
          if (!m) return 0;
          let h = +m[1]; const mn = m[2] ? +m[2] : 0;
          if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
          if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
          return h + mn / 60;
        };
        let d = parse(u.wake) - parse(u.bed);
        if (d < 0) d += 24;
        u.sleep = d.toFixed(1);
      } catch { /* ignore */ }
    }
    setCk(u);
  };

  const submitCheckin = async () => {
    setCkSaving(true);
    try {
      await post("/checkin", {
        bedtime: ck.bed, waketime: ck.wake, sleepHours: ck.sleep || undefined,
        bible: ck.bible, workout: ck.workout, journal: ck.journal,
        nutrition: ck.nut, unplug: ck.unplug,
      });
      setCk({ ...ck, done: true });
      setView("journal");
    } catch { /* silent fallback */ setCk({ ...ck, done: true }); setView("journal"); }
    setCkSaving(false);
  };

  const submitJournal = async (skip = false) => {
    setJSaving(true);
    if (!skip && jTxt.trim()) {
      try {
        const j = await post<{ formattedText?: string }>("/journal", { rawText: jTxt });
        setJFormatted(j.formattedText || jTxt);
      } catch { setJFormatted(jTxt); }
    }
    setJDone(true);
    setView("emails");
    setJSaving(false);
  };

  const unresolved = (brief?.emailsImportant || []).filter(e => !snoozed[e.id]).length;

  const logCall = async (contactName: string, type: string) => {
    try {
      const call = await post<CallEntry>("/calls", { contactName, type });
      setCalls(prev => [...prev, call]);
    } catch {
      setCalls(prev => [...prev, { contactName, type, createdAt: new Date().toISOString() }]);
    }
  };

  const markTaskDone = async (task: TaskItem) => {
    if (task.sales) { setView("sales"); return; }
    const newVal = !tDone[task.id];
    setTDone(prev => ({ ...prev, [task.id]: newVal }));
    if (newVal) {
      try { await post("/tasks/completed", { taskId: task.id, taskText: task.text }); } catch { /* ignore */ }
    }
  };

  const handleDemoChange = async (delta: number) => {
    try {
      if (delta > 0) {
        const r = await post<{ count: number }>("/demos/increment");
        setDemos(r.count);
      } else {
        const r = await post<{ count: number }>("/demos/decrement");
        setDemos(r.count);
      }
    } catch {
      setDemos(prev => Math.max(0, prev + delta));
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FS, fontSize: 24, marginBottom: 8 }}>Tony's Command Center</div>
          <div style={{ color: C.mut, fontSize: 14 }}>Loading...</div>
        </div>
      </div>
    );
  }

  // ═══ CHECK-IN ═══
  if (view === "checkin" && !ck.done) return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <div style={{ ...card, padding: "36px 40px", maxWidth: 480, width: "100%" }}>
        <h1 style={{ fontFamily: FS, fontSize: 28, margin: 0 }}>Morning Check-in</h1>
        <p style={{ color: C.mut, margin: "6px 0 0", fontSize: 13 }}>{TODAY_STR} · {clock}</p>
        <p style={{ fontFamily: FS, fontSize: 14, color: C.sub, fontStyle: "italic", margin: "12px 0 24px", borderLeft: `3px solid ${C.brd}`, paddingLeft: 12 }}>
          "Follow the plan I gave you!" — God
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          <div><label style={lbl}>Bedtime</label><input style={inp} placeholder="10:30 PM" value={ck.bed} onChange={e => upCk("bed", e.target.value)} /></div>
          <div><label style={lbl}>Wake time</label><input style={inp} placeholder="6:00 AM" value={ck.wake} onChange={e => upCk("wake", e.target.value)} /></div>
        </div>
        {ck.sleep && (
          <div style={{ background: +ck.sleep >= 7 ? C.grnBg : C.ambBg, borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 14, fontWeight: 600, color: +ck.sleep >= 7 ? C.grn : C.amb }}>
            Sleep: {ck.sleep}h {+ck.sleep < 7 ? "⚠️" : "✓"}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          {([["bible", "Bible"], ["workout", "Workout"], ["journal", "Journal"], ["unplug", "Unplug 6PM"]] as [string, string][]).map(([k, l]) => (
            <button key={k} onClick={() => upCk(k, !ck[k as keyof typeof ck])}
              style={{ padding: 13, borderRadius: 12, border: `2px solid ${ck[k as keyof typeof ck] ? C.grn : C.brd}`, background: ck[k as keyof typeof ck] ? C.grnBg : C.card, color: ck[k as keyof typeof ck] ? C.grn : C.sub, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: F }}>
              {ck[k as keyof typeof ck] ? "✓ " : ""}{l}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={lbl}>Yesterday's Nutrition</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Good", "OK", "Bad"].map(n => (
              <button key={n} onClick={() => upCk("nut", n)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: `2px solid ${ck.nut === n ? (n === "Good" ? C.grn : n === "OK" ? C.amb : C.red) : C.brd}`, background: ck.nut === n ? (n === "Good" ? C.grnBg : n === "OK" ? C.ambBg : C.redBg) : C.card, color: ck.nut === n ? (n === "Good" ? C.grn : n === "OK" ? C.amb : C.red) : C.sub, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: F }}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <button onClick={submitCheckin} disabled={ckSaving} style={{ ...btn1, width: "100%", opacity: ckSaving ? 0.6 : 1 }}>
          {ckSaving ? "Saving..." : "Let's Go →"}
        </button>
      </div>
    </div>
  );

  // ═══ JOURNAL ═══
  if (view === "journal" && !jDone) return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <div style={{ ...card, padding: "36px 40px", maxWidth: 540, width: "100%" }}>
        <h1 style={{ fontFamily: FS, fontSize: 28, margin: 0 }}>Journal</h1>
        <p style={{ color: C.mut, margin: "6px 0 20px", fontSize: 13 }}>Brain dump — speak or type. AI will format it.</p>
        <textarea value={jTxt} onChange={e => setJTxt(e.target.value)} placeholder="What's on your mind? What happened yesterday? What are you grateful for?" style={{ ...inp, minHeight: 180, resize: "vertical", fontSize: 15, lineHeight: 1.7 }} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={() => submitJournal(true)} disabled={jSaving} style={{ ...btn2, flex: 1 }}>Skip</button>
          <button onClick={() => submitJournal(false)} disabled={jSaving || !jTxt.trim()} style={{ ...btn1, flex: 2, opacity: jSaving || !jTxt.trim() ? 0.4 : 1 }}>
            {jSaving ? "AI Formatting..." : "Save & Continue →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ═══ HEADER (all main views) ═══
  const Hdr = () => (
    <div style={{ background: C.card, borderBottom: `1px solid ${C.brd}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 onClick={() => setView("schedule")} style={{ fontFamily: FS, fontSize: 18, margin: 0, cursor: "pointer" }}>Tony's Command Center</h1>
        <span style={{ fontSize: 11, color: C.mut }}>{TODAY_STR} · {clock}</span>
      </div>
      <p style={{ fontFamily: FS, fontSize: 12, color: C.sub, fontStyle: "italic", margin: 0, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
        "Follow the plan I gave you!" — God
      </p>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <Tip tip={TIPS.ideas}>
          <button onClick={() => setShowIdea(true)} style={{ ...btn2, padding: "5px 10px", fontSize: 11 }}>
            💡{ideas.length > 0 ? ` (${ideas.length})` : ""}
          </button>
        </Tip>
        <Tip tip={TIPS.gmail}>
          <button onClick={() => setView("emails")} style={{ ...btn2, padding: "5px 10px", fontSize: 11, position: "relative" }}>
            ✉️{unresolved > 0 && <span style={{ position: "absolute", top: -5, right: -5, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{unresolved}</span>}
          </button>
        </Tip>
        <button onClick={() => setCalSide(!calSide)} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: calSide ? C.bluBg : C.card, color: calSide ? C.blu : C.tx }}>📅</button>
        <Tip tip={TIPS.eod}>
          <button onClick={async () => {
            setEod(true);
            try { await post("/claude", { prompt: `Generate an EOD report for Tony Diaz for ${TODAY_STR}. Include: calls made (${calls.length}), demos booked (${demos}), tasks completed.`, context: "EOD report generation" }); } catch { /* ignore */ }
          }} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: eod ? C.grnBg : C.card }}>{eod ? "✓" : "📊"}</button>
        </Tip>
        <Tip tip={TIPS.chat}>
          <button onClick={() => setShowChat(true)} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: C.tx, color: "#fff", border: "none" }}>💬</button>
        </Tip>
      </div>
    </div>
  );

  // ═══ CALENDAR SIDEBAR ═══
  const CalSide = () => !calSide ? null : (
    <div style={{ position: "fixed", top: 52, right: 0, bottom: 0, width: 300, background: C.card, borderLeft: `1px solid ${C.brd}`, zIndex: 40, overflow: "auto", padding: "14px 16px", boxShadow: "-4px 0 20px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ fontFamily: FS, fontSize: 15, margin: 0 }}>📅 Schedule</h3>
        <button onClick={() => setCalSide(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut }}>✕</button>
      </div>
      {(brief?.calendarData || []).map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.brd}` }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.real ? C.blu : C.mut, minWidth: 55 }}>{c.t}</span>
          <div style={{ fontSize: 11, fontWeight: c.real ? 700 : 400, color: c.real ? C.blu : C.tx }}>
            {c.n}{c.note && <span style={{ color: C.amb, marginLeft: 4 }}>⚡</span>}
          </div>
        </div>
      ))}
    </div>
  );

  // ═══ EMAILS VIEW ═══
  if (view === "emails") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <Hdr />
      <IdeasModal open={showIdea} onClose={() => setShowIdea(false)} onSave={idea => setIdeas(prev => [...prev, idea])} count={ideas.length} />
      <ClaudeModal open={showChat} onClose={() => setShowChat(false)} />
      <EmailReplyModal email={replyEmail} onClose={() => setReplyEmail(null)} />
      <div style={{ maxWidth: 680, margin: "24px auto", padding: "0 20px" }}>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Important Emails</h3>
            <span style={{ color: C.red, fontWeight: 700, fontSize: 13 }}>{unresolved} need attention</span>
          </div>
          {(brief?.emailsImportant || []).filter(e => !snoozed[e.id]).map(e => (
            <div key={e.id} style={{ padding: 14, marginBottom: 8, background: e.p === "high" ? C.redBg : "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${e.p === "high" ? C.red : e.p === "med" ? C.amb : C.mut}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{e.from}</span>
                <span style={{ fontSize: 11, color: C.mut }}>{e.time}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{e.subj}</div>
              <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>→ {e.why}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <Tip tip={TIPS.suggestReply}>
                  <button onClick={() => setReplyEmail(e)} style={{ ...btn2, padding: "5px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}>Suggest Reply</button>
                </Tip>
                <Tip tip={TIPS.snooze}>
                  <select onChange={ev => { if (ev.target.value) { setSnoozed(prev => ({ ...prev, [e.id]: ev.target.value })); post("/emails/action", { action: "snooze", emailId: e.id }).catch(() => {}); ev.target.value = ""; } }} defaultValue="" style={{ ...btn2, padding: "5px 8px", fontSize: 11 }}>
                    <option value="">Snooze...</option>
                    <option value="1h">1 hour</option>
                    <option value="2h">2 hours</option>
                    <option value="tom">Tomorrow</option>
                    <option value="nw">Next week</option>
                  </select>
                </Tip>
                <button onClick={() => post("/emails/action", { action: "thumbs_up", sender: e.from, subject: e.subj }).catch(() => {})} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>👍</button>
                <button onClick={() => post("/emails/action", { action: "thumbs_down", sender: e.from, subject: e.subj }).catch(() => {})} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>👎</button>
              </div>
            </div>
          ))}
          {unresolved === 0 && <div style={{ padding: 16, textAlign: "center", color: C.grn, fontWeight: 700, background: C.grnBg, borderRadius: 10 }}>All handled ✓</div>}
        </div>
        <div style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ fontFamily: FS, fontSize: 19, margin: "0 0 14px" }}>FYI — No Reply Needed</h3>
          {(brief?.emailsFyi || []).map(e => (
            <div key={e.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.brd}` }}>
              <div style={{ fontSize: 14 }}><strong>{e.from}</strong> — {e.subj}</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>{e.why}</div>
            </div>
          ))}
        </div>
        <button onClick={() => { setEmailsDone(true); setView("schedule"); }} style={{ ...btn1, width: "100%", marginBottom: 40 }}>
          Done — Show My Day →
        </button>
      </div>
    </div>
  );

  // ═══ SALES VIEW ═══
  if (view === "sales") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <Hdr /> <CalSide />
      <IdeasModal open={showIdea} onClose={() => setShowIdea(false)} onSave={idea => setIdeas(prev => [...prev, idea])} count={ideas.length} />
      <AttemptModal contact={attempt} onClose={() => setAttempt(null)} onLog={call => setCalls(prev => [...prev, call])} />
      <ClaudeModal open={showChat} onClose={() => setShowChat(false)} />
      <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 20px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Sales Mode</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
              <span>Calls: {calls.length}</span>
              <span style={{ color: C.blu }}>Demos: {demos}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => handleDemoChange(-1)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.brd}`, background: C.card, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>−</button>
                <button onClick={() => handleDemoChange(1)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.grn}`, background: C.grnBg, cursor: "pointer", fontSize: 14, fontWeight: 700, color: C.grn }}>+</button>
              </div>
            </div>
          </div>
          {contacts.map(c => (
            <div key={c.id} style={{ display: "flex", gap: 12, padding: 14, marginBottom: 6, background: "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${SC[c.status || "New"] || C.mut}`, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: SC[c.status || "New"] || C.mut, background: c.status === "Hot" ? C.redBg : c.status === "Warm" ? C.ambBg : C.bluBg, padding: "2px 8px", borderRadius: 4 }}>{c.status}</span>
                </div>
                {c.company && <div style={{ fontSize: 12, color: C.sub }}>{c.company}</div>}
                <div style={{ fontSize: 13, marginTop: 4 }}>→ {c.nextStep}</div>
                <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>Last: {c.lastContactDate} · {c.phone}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                <Tip tip={TIPS.attempt}>
                  <button onClick={() => setAttempt({ id: c.id, name: c.name })} style={{ ...btn2, padding: "7px 12px", fontSize: 11 }}>📞 Attempt</button>
                </Tip>
                <Tip tip={TIPS.connected}>
                  <button onClick={() => logCall(c.name, "connected")} style={{ ...btn2, padding: "7px 12px", fontSize: 11, color: C.grn, borderColor: C.grn }}>✓ Connected</button>
                </Tip>
              </div>
            </div>
          ))}
        </div>
        {calls.length > 0 && (
          <div style={{ ...card, marginBottom: 16, background: C.grnBg }}>
            <h3 style={{ fontFamily: FS, fontSize: 17, margin: "0 0 10px" }}>Call Log ({calls.length})</h3>
            {calls.map((cl, i) => (
              <div key={i} style={{ fontSize: 13, padding: "3px 0", color: C.grn }}>
                ✓ {cl.contactName} — {cl.type} {cl.createdAt ? new Date(cl.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setView("tasks")} style={{ ...btn2, width: "100%", marginBottom: 10 }}>✅ Switch to Tasks</button>
        <button onClick={() => setView("schedule")} style={{ ...btn2, width: "100%", marginBottom: 40, color: C.mut }}>← Schedule</button>
      </div>
    </div>
  );

  // ═══ TASKS VIEW ═══
  if (view === "tasks") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <Hdr /> <CalSide />
      <IdeasModal open={showIdea} onClose={() => setShowIdea(false)} onSave={idea => setIdeas(prev => [...prev, idea])} count={ideas.length} />
      <ClaudeModal open={showChat} onClose={() => setShowChat(false)} />
      <div style={{ maxWidth: 580, margin: "24px auto", padding: "0 20px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Tasks</h3>
            <span style={{ fontSize: 13, color: C.mut }}>{Object.values(tDone).filter(Boolean).length}/{(brief?.tasks || []).length}</span>
          </div>
          {(brief?.tasks || []).map(t => (
            <div key={t.id} onClick={() => markTaskDone(t)}
              style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, marginBottom: 6, background: tDone[t.id] ? C.grnBg : "#FAFAF8", borderRadius: 12, cursor: "pointer", borderLeft: `4px solid ${t.cat === "SALES" ? C.grn : t.cat === "OPS" ? C.amb : C.blu}`, opacity: tDone[t.id] ? 0.6 : 1 }}>
              <div style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${tDone[t.id] ? C.grn : C.mut}`, background: tDone[t.id] ? C.grn : C.card, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {tDone[t.id] && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.cat === "SALES" ? C.grn : t.cat === "OPS" ? C.amb : C.blu, textTransform: "uppercase", letterSpacing: 1 }}>{t.cat}</div>
                <div style={{ fontSize: 15, fontWeight: 600, textDecoration: tDone[t.id] ? "line-through" : "none" }}>{t.text}</div>
              </div>
              {t.sales && !tDone[t.id] && <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>→ Sales</span>}
            </div>
          ))}
        </div>
        <button onClick={() => setView("sales")} style={{ ...btn2, width: "100%", marginBottom: 10 }}>📞 Switch to Sales</button>
        <button onClick={() => setView("schedule")} style={{ ...btn2, width: "100%", marginBottom: 40, color: C.mut }}>← Schedule</button>
      </div>
    </div>
  );

  // ═══ SCHEDULE (default main view) ═══
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <Hdr />
      <IdeasModal open={showIdea} onClose={() => setShowIdea(false)} onSave={idea => setIdeas(prev => [...prev, idea])} count={ideas.length} />
      <ClaudeModal open={showChat} onClose={() => setShowChat(false)} />
      <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 20px" }}>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Today's Schedule</h3>
            <span style={{ fontSize: 12, color: C.mut }}>{(brief?.calendarData || []).length} items</span>
          </div>
          {(brief?.calendarData || []).map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", marginBottom: 4, background: c.real ? C.bluBg : "#FAFAF8", borderRadius: 10, borderLeft: `4px solid ${c.real ? C.blu : C.brd}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.real ? C.blu : C.mut, minWidth: 75, flexShrink: 0 }}>{c.t}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: c.real ? 700 : 500 }}>{c.n}</div>
                {c.loc && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>📍 {c.loc}</div>}
                {c.note && <div style={{ fontSize: 12, color: C.amb, marginTop: 2 }}>⚡ {c.note}</div>}
              </div>
              {c.real
                ? <span style={{ fontSize: 10, fontWeight: 700, color: C.blu, background: "#fff", padding: "2px 8px", borderRadius: 4, alignSelf: "center" }}>MEETING</span>
                : <span style={{ fontSize: 10, color: C.mut, alignSelf: "center" }}>note</span>
              }
            </div>
          ))}
        </div>
        <button onClick={() => { setView("sales"); setCalSide(true); }} style={{ ...btn1, width: "100%", padding: 18, fontSize: 17, marginBottom: 10 }}>
          📞 Enter Sales Mode →
        </button>
        <button onClick={() => { setView("tasks"); setCalSide(true); }} style={{ ...btn2, width: "100%", padding: 14, marginBottom: 40 }}>
          ✅ Enter Task Mode
        </button>
      </div>
    </div>
  );
}
