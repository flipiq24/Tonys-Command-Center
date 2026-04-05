import { useState, useRef, useEffect } from "react";
import { post, get } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2, lbl } from "./constants";
import { VoiceInput } from "./VoiceInput";
import type { Idea } from "./types";

const CATS = ["Tech", "Sales", "Marketing", "Strategic Partners", "Operations", "Product", "Personal"];
const URG = ["Now", "This Week", "This Month", "Someday"];
const PRIORITY_COLOR: Record<string, string> = { high: C.red, medium: C.amb, low: C.grn };

interface TeamMember { name: string; email: string; slackId?: string | null; source?: string; }

const ASSIGNABLE_URGENCIES = ["Now", "This Week", "This Month"];

function getDefaultDueDate(urgency: string): string {
  const today = new Date();
  if (urgency === "Now") {
    return today.toISOString().split("T")[0];
  } else if (urgency === "This Week") {
    const dayOfWeek = today.getDay();
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6;
    const friday = new Date(today);
    friday.setDate(today.getDate() + (daysUntilFriday === 0 && dayOfWeek === 5 ? 0 : daysUntilFriday));
    return friday.toISOString().split("T")[0];
  } else if (urgency === "This Month") {
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return lastDay.toISOString().split("T")[0];
  }
  return today.toISOString().split("T")[0];
}

interface Pushback {
  message: string;
  priorityRank: number | null;
  action: "park" | "override" | "escalate" | null;
}

interface Classification {
  category: string;
  urgency: string;
  techType: string | null;
  reason: string;
  businessFit: string;
  priority: string;
  warningIfDistraction?: string;
  pushback?: Pushback | null;
}

interface AssignState {
  mode: "none" | "team" | "custom";
  assigneeName: string;
  assigneeEmail: string;
  assigneeSlackId: string | null;
  dueDate: string;
  notifyEmail: boolean;
  notifySlack: boolean;
  note: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (idea: Idea) => void;
  count: number;
}

type Step = "input" | "classifying" | "review" | "saving";

export function IdeasModal({ open, onClose, onSave, count }: Props) {
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [classification, setClassification] = useState<Classification | null>(null);
  const [overrides, setOverrides] = useState<Partial<Classification>>({});
  const [error, setError] = useState("");
  const [linearId, setLinearId] = useState<string | null>(null);
  const [pushback, setPushback] = useState<Pushback | null>(null);
  const [override, setOverride] = useState<{ justification: string } | null>(null);
  const [assign, setAssign] = useState<AssignState | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (open && teamMembers.length === 0) {
      get<{ ok: boolean; members: TeamMember[] }>("/ideas/team-members")
        .then(res => { if (res.ok && mountedRef.current) setTeamMembers(res.members); })
        .catch(() => {});
    }
  }, [open]);

  const finalCat = overrides.category ?? classification?.category ?? "Tech";
  const finalUrg = overrides.urgency ?? classification?.urgency ?? "This Week";
  const finalTt = overrides.techType ?? classification?.techType ?? null;

  const showAssign = ASSIGNABLE_URGENCIES.includes(finalUrg);

  useEffect(() => {
    if (step === "review" && classification) {
      if (ASSIGNABLE_URGENCIES.includes(finalUrg)) {
        setAssign(prev => prev ? { ...prev, dueDate: getDefaultDueDate(finalUrg) } : {
          mode: "none",
          assigneeName: "",
          assigneeEmail: "",
          assigneeSlackId: null,
          dueDate: getDefaultDueDate(finalUrg),
          notifyEmail: true,
          notifySlack: false,
          note: "",
        });
      } else {
        setAssign(null);
      }
    }
  }, [finalUrg, step, classification]);

  const reset = () => {
    setText("");
    setStep("input");
    setClassification(null);
    setOverrides({});
    setError("");
    setLinearId(null);
    setPushback(null);
    setOverride(null);
    setAssign(null);
    // keep teamMembers cached — no need to reset
  };

  const handleClose = () => { reset(); onClose(); };

  const classify = async () => {
    if (!text.trim()) return;
    setStep("classifying");
    setError("");
    setPushback(null);
    setOverride(null);
    try {
      const res = await post<{ ok: boolean; classification: Classification }>("/ideas/classify", { text });
      setClassification(res.classification);
      setOverrides({});
      if (res.classification.pushback) {
        setPushback(res.classification.pushback);
      }
      setStep("review");
    } catch {
      setError("Couldn't classify — please set category manually.");
      setClassification({ category: "Operations", urgency: "This Week", techType: null, reason: "", businessFit: "", priority: "medium" });
      setStep("review");
    }
  };

  const save = async () => {
    setStep("saving");
    setError("");
    try {
      const hasAssignee = assign && assign.mode !== "none" && assign.assigneeName.trim() && assign.assigneeEmail.trim();
      const assigneeName = hasAssignee ? assign!.assigneeName.trim() : undefined;
      const assigneeEmail = hasAssignee ? assign!.assigneeEmail.trim() : undefined;
      const dueDate = hasAssignee ? assign!.dueDate || undefined : undefined;

      const idea = await post<Idea & { linearIssue?: { identifier: string } | null }>("/ideas", {
        text,
        category: finalCat,
        urgency: finalUrg,
        techType: finalTt || undefined,
        ...(assigneeName ? { assigneeName, assigneeEmail, dueDate } : {}),
      });

      if (hasAssignee && assigneeName && assigneeEmail && (assign?.notifyEmail || assign?.notifySlack)) {
        const notifyChannels: string[] = [];
        if (assign?.notifyEmail) notifyChannels.push("email");
        if (assign?.notifySlack && assign?.assigneeSlackId) notifyChannels.push("slack");
        if (notifyChannels.length > 0) {
          try {
            await post("/ideas/notify-assignee", {
              ideaText: text,
              category: finalCat,
              urgency: finalUrg,
              dueDate: dueDate || "",
              assigneeName,
              assigneeEmail,
              slackUserId: assign?.assigneeSlackId || undefined,
              notifyChannels,
              note: assign!.note || undefined,
            });
          } catch {
            console.warn("[Ideas] Failed to send assignee notification");
          }
        }
      }

      if (idea.linearIssue?.identifier) {
        setLinearId(idea.linearIssue.identifier);
        await new Promise<void>(resolve => {
          const t = setTimeout(() => resolve(), 2000);
          if (!mountedRef.current) { clearTimeout(t); resolve(); }
        });
      }
      onSave(idea);
      reset();
      onClose();
    } catch {
      setError("Failed to save idea. Please try again.");
      setStep("review");
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={handleClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, padding: 28, width: 520, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" }}>

        {/* ── STEP 1: Input ── */}
        {step === "input" && (
          <>
            <h3 style={{ fontFamily: FS, fontSize: 20, margin: "0 0 4px" }}>What's your brilliant idea?</h3>
            <p style={{ fontSize: 13, color: C.mut, margin: "0 0 16px" }}>That'll be #{count + 1} — {count} parked ahead of it. AI will classify it.</p>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14 }}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Speak or type your idea..."
                autoFocus
                onKeyDown={e => { if (e.key === "Enter" && e.metaKey) classify(); }}
                style={{ ...inp, minHeight: 80, resize: "vertical", flex: 1 }}
              />
              <VoiceInput onTranscript={t => setText(prev => prev ? prev + " " + t : t)} size={34} />
            </div>
            {error && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleClose} style={{ ...btn2, flex: 1 }}>Cancel</button>
              <button onClick={classify} disabled={!text.trim()} style={{ ...btn1, flex: 2, opacity: !text.trim() ? 0.5 : 1 }}>
                Classify It → (⌘↵)
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Classifying ── */}
        {step === "classifying" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
            <div style={{ fontFamily: FS, fontSize: 18, marginBottom: 8 }}>Classifying your idea...</div>
            <div style={{ fontSize: 13, color: C.mut }}>Checking against FlipIQ business priorities</div>
          </div>
        )}

        {/* ── STEP 3: Review AI classification ── */}
        {step === "review" && classification && (
          <>
            <h3 style={{ fontFamily: FS, fontSize: 20, margin: "0 0 4px" }}>AI Classified Your Idea</h3>
            <p style={{ fontSize: 12, color: C.mut, margin: "0 0 16px" }}>Review and override if needed, then park it.</p>

            {/* Idea text */}
            <div style={{ padding: "10px 14px", background: "#F8F8F6", borderRadius: 10, fontSize: 14, marginBottom: 16, fontStyle: "italic", color: C.sub }}>
              "{text}"
            </div>

            {/* AI reasoning */}
            <div style={{ padding: "12px 14px", background: C.bluBg, border: `1px solid ${C.blu}20`, borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.blu, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                AI Analysis
              </div>
              <div style={{ fontSize: 13, color: C.tx, marginBottom: 4 }}>
                <strong>Why {classification.category}:</strong> {classification.reason}
              </div>
              <div style={{ fontSize: 13, color: C.tx, marginBottom: classification.warningIfDistraction ? 4 : 0 }}>
                <strong>Business fit:</strong> {classification.businessFit}
              </div>
              {classification.warningIfDistraction && (
                <div style={{ fontSize: 12, color: C.amb, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.brd}` }}>
                  ⚠️ {classification.warningIfDistraction}
                </div>
              )}
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: C.mut }}>AI priority:</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[classification.priority] || C.mut, textTransform: "uppercase" }}>
                  {classification.priority}
                </span>
              </div>
            </div>

            {/* ── PUSHBACK: Escalate (unreasonable) ── */}
            {pushback && pushback.action === "escalate" && (
              <div style={{ padding: 16, background: C.redBg, borderRadius: 10, marginBottom: 14, border: `1px solid ${C.red}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.red, marginBottom: 8 }}>🚨 Scope Check</div>
                <div style={{ fontSize: 13, color: C.tx, marginBottom: 12 }}>{pushback.message}</div>
                <button
                  onClick={async () => {
                    setStep("saving");
                    try {
                      await post("/ideas", { text, category: finalCat, urgency: "Someday" });
                      await post("/ideas/escalate-to-ethan", { text, rank: pushback.priorityRank }).catch(() => {});
                      onSave({ id: Date.now().toString(), text, category: finalCat, urgency: "Someday" } as Idea);
                      handleClose();
                    } catch { setError("Failed to park idea"); setStep("review"); }
                  }}
                  style={{ ...btn2, width: "100%", color: C.red, borderColor: C.red }}
                >
                  OK, Park It + Book Ethan Meeting
                </button>
              </div>
            )}

            {/* ── PUSHBACK: Park (conflicts with plan) ── */}
            {pushback && pushback.action === "park" && !override && (
              <div style={{ padding: 16, background: C.ambBg, borderRadius: 10, marginBottom: 14, border: `1px solid ${C.amb}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.amb, marginBottom: 8 }}>⚠️ Pushback</div>
                <div style={{ fontSize: 13, color: C.tx, marginBottom: 12 }}>{pushback.message}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={async () => {
                      setStep("saving");
                      try {
                        const idea = await post<Idea>("/ideas", { text, category: finalCat, urgency: "Someday" });
                        onSave(idea);
                        handleClose();
                      } catch { setError("Failed to park idea"); setStep("review"); }
                    }}
                    style={{ ...btn2, flex: 1, color: C.amb, borderColor: C.amb }}
                  >
                    Park It
                  </button>
                  <button
                    onClick={() => { setOverride({ justification: "" }); setPushback(null); }}
                    style={{ ...btn1, flex: 1, background: C.red }}
                  >
                    Override — Do It Anyway
                  </button>
                </div>
              </div>
            )}

            {/* ── OVERRIDE: Justification required ── */}
            {override && (
              <div style={{ padding: 16, background: C.redBg, borderRadius: 10, marginBottom: 14, border: `1px solid ${C.red}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.red, marginBottom: 8 }}>
                  Why should this jump the queue?
                </div>
                <textarea
                  value={override.justification}
                  onChange={e => setOverride({ justification: e.target.value })}
                  placeholder="Explain why this is urgent enough to override the plan..."
                  style={{ ...inp, minHeight: 60, resize: "vertical", marginBottom: 8 }}
                />
                <button
                  onClick={async () => {
                    setStep("saving");
                    try {
                      const idea = await post<Idea>("/ideas", { text, category: finalCat, urgency: finalUrg });
                      await post("/ideas/notify-override", { text, justification: override.justification }).catch(() => {});
                      onSave(idea);
                      handleClose();
                    } catch { setError("Failed to save idea"); setStep("review"); }
                  }}
                  disabled={!override.justification.trim()}
                  style={{ ...btn1, width: "100%", opacity: override.justification.trim() ? 1 : 0.4 }}
                >
                  Confirm Override + Notify Leadership
                </button>
              </div>
            )}

            {/* Category override */}
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Category {overrides.category && overrides.category !== classification.category ? "(overridden)" : "(AI suggestion)"}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {CATS.map(c => (
                  <button key={c} onClick={() => setOverrides(o => ({ ...o, category: c }))}
                    style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F,
                      border: `2px solid ${finalCat === c ? C.tx : C.brd}`,
                      background: finalCat === c ? C.tx : C.card,
                      color: finalCat === c ? "#fff" : C.sub,
                      boxShadow: c === classification.category && finalCat !== c ? `inset 0 0 0 1px ${C.blu}40` : "none",
                    }}>
                    {c === classification.category && finalCat !== c ? `✓ ${c}` : c}
                  </button>
                ))}
              </div>
            </div>

            {/* Urgency override */}
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Urgency {overrides.urgency && overrides.urgency !== classification.urgency ? "(overridden)" : "(AI suggestion)"}</label>
              <div style={{ display: "flex", gap: 5 }}>
                {URG.map(u => (
                  <button key={u} onClick={() => setOverrides(o => ({ ...o, urgency: u }))}
                    style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F,
                      border: `2px solid ${finalUrg === u ? (u === "Now" ? C.red : C.tx) : C.brd}`,
                      background: finalUrg === u ? (u === "Now" ? C.red : C.tx) : C.card,
                      color: finalUrg === u ? "#fff" : C.sub,
                    }}>
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Tech type override if applicable */}
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Type (Manual Override)</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {["Bug", "Feature", "Note", "Task", "Strategic"].map(t => (
                  <button key={t} onClick={() => setOverrides(o => ({ ...o, techType: t }))}
                    style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F,
                      border: `2px solid ${finalTt === t ? C.blu : C.brd}`,
                      background: finalTt === t ? C.bluBg : C.card,
                      color: finalTt === t ? C.blu : C.sub,
                    }}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>
                {finalTt === "Task" ? "Task ideas check against the 90-day plan." : finalTt === "Strategic" ? "Strategic ideas are flagged for Ethan review." : finalTt === "Note" ? "Notes are parked for reference — not tied to a project." : finalCat === "Tech" ? "Tech ideas auto-create a Linear issue." : "Override the AI-detected type if needed."}
              </div>
            </div>

            {/* ── ASSIGN SECTION (only for Now / This Week / This Month) ── */}
            {showAssign && !pushback && !override && assign && (
              <div style={{ padding: "14px 16px", background: "#F0F4FF", border: `1px solid ${C.blu}30`, borderRadius: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.blu, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Assign (optional)
                </div>

                {/* Team member dropdown or "Custom" mode toggle */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ ...lbl, marginBottom: 4 }}>
                    Team member {teamMembers.length > 0 ? <span style={{ color: C.grn, fontWeight: 400 }}>({teamMembers.length} from Linear/Slack)</span> : <span style={{ color: C.mut, fontWeight: 400 }}>loading...</span>}
                  </label>
                  <select
                    value={assign.mode === "team" ? `${assign.assigneeName}|${assign.assigneeEmail}` : assign.mode === "custom" ? "__custom__" : ""}
                    onChange={e => {
                      const val = e.target.value;
                      if (!val) {
                        setAssign(a => a ? { ...a, mode: "none", assigneeName: "", assigneeEmail: "", assigneeSlackId: null } : a);
                      } else if (val === "__custom__") {
                        setAssign(a => a ? { ...a, mode: "custom", assigneeName: "", assigneeEmail: "", assigneeSlackId: null } : a);
                      } else {
                        const [name, email, slackId] = val.split("|");
                        setAssign(a => a ? { ...a, mode: "team", assigneeName: name, assigneeEmail: email, assigneeSlackId: slackId || null } : a);
                      }
                    }}
                    style={{ ...inp, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}
                  >
                    <option value="">— No assignee —</option>
                    {teamMembers.map(m => (
                      <option key={m.email} value={`${m.name}|${m.email}|${m.slackId || ""}`}>
                        {m.name}{m.slackId ? " ✓ Slack" : ""} · {m.email}
                      </option>
                    ))}
                    <option value="__custom__">+ Enter custom name & email...</option>
                  </select>
                </div>

                {/* Custom name + email inputs */}
                {assign.mode === "custom" && (
                  <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...lbl, marginBottom: 4 }}>Name</label>
                      <input
                        type="text"
                        value={assign.assigneeName}
                        onChange={e => setAssign(a => a ? { ...a, assigneeName: e.target.value } : a)}
                        placeholder="Full name"
                        style={{ ...inp, padding: "6px 10px", fontSize: 13 }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...lbl, marginBottom: 4 }}>Email</label>
                      <input
                        type="email"
                        value={assign.assigneeEmail}
                        onChange={e => setAssign(a => a ? { ...a, assigneeEmail: e.target.value } : a)}
                        placeholder="email@example.com"
                        style={{ ...inp, padding: "6px 10px", fontSize: 13 }}
                      />
                    </div>
                  </div>
                )}

                {/* Target date, note, notify — shown when a valid assignee is selected */}
                {assign.mode !== "none" && (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ ...lbl, marginBottom: 4 }}>Target date</label>
                      <input
                        type="date"
                        value={assign.dueDate}
                        onChange={e => setAssign(a => a ? { ...a, dueDate: e.target.value } : a)}
                        style={{ ...inp, padding: "6px 10px", fontSize: 13 }}
                      />
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={{ ...lbl, marginBottom: 4 }}>Note (optional)</label>
                      <input
                        type="text"
                        value={assign.note}
                        onChange={e => setAssign(a => a ? { ...a, note: e.target.value } : a)}
                        placeholder="Any context or instructions..."
                        style={{ ...inp, padding: "6px 10px", fontSize: 13 }}
                      />
                    </div>

                    <div>
                      <label style={{ ...lbl, marginBottom: 6 }}>Notify via</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => setAssign(a => a ? { ...a, notifyEmail: !a.notifyEmail } : a)}
                          style={{
                            padding: "5px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F,
                            border: `2px solid ${assign.notifyEmail ? C.blu : C.brd}`,
                            background: assign.notifyEmail ? C.bluBg : C.card,
                            color: assign.notifyEmail ? C.blu : C.sub,
                          }}
                        >
                          📧 Email
                        </button>
                        <button
                          onClick={() => setAssign(a => a ? { ...a, notifySlack: !a.notifySlack } : a)}
                          disabled={!assign.assigneeSlackId && assign.mode !== "custom"}
                          title={!assign.assigneeSlackId && assign.mode !== "custom" ? "This person has no Slack account linked" : ""}
                          style={{
                            padding: "5px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: assign.assigneeSlackId || assign.mode === "custom" ? "pointer" : "not-allowed", fontFamily: F,
                            border: `2px solid ${assign.notifySlack ? "#1D9353" : C.brd}`,
                            background: assign.notifySlack ? "#E8F5E9" : C.card,
                            color: assign.notifySlack ? "#1D9353" : (assign.assigneeSlackId || assign.mode === "custom") ? C.sub : C.mut,
                            opacity: !assign.assigneeSlackId && assign.mode !== "custom" ? 0.45 : 1,
                          }}
                        >
                          💬 Slack {assign.assigneeSlackId ? "✓" : ""}
                        </button>
                      </div>
                      {!assign.assigneeSlackId && assign.mode === "team" && (
                        <div style={{ fontSize: 10, color: C.mut, marginTop: 4 }}>No Slack account found for this person</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {error && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>{error}</div>}

            {/* Only show action button if there's no active pushback / override flow */}
            {!pushback && !override && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setStep("input")} style={{ ...btn2, flex: 1 }}>← Edit</button>
                <button onClick={save} style={{ ...btn1, flex: 2, background: finalUrg === "Now" ? "#B71C1C" : undefined }}>
                  {(() => {
                    const hasAssignee = assign && assign.mode !== "none" && assign.assigneeName.trim() && assign.assigneeEmail.trim();
                    const willNotify = hasAssignee && (assign!.notifyEmail || (assign!.notifySlack && assign!.assigneeSlackId));
                    if (finalUrg === "Now") return willNotify ? "Post and Deliver →" : "Post Now →";
                    if (willNotify) return "Park & Notify Assignee →";
                    return "Park It → Back to Calls";
                  })()}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── STEP 4: Saving / confirmation ── */}
        {step === "saving" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              {linearId ? "✅" : "⏳"}
            </div>
            <div style={{ fontFamily: FS, fontSize: 18, marginBottom: 8 }}>
              {linearId ? `${finalUrg === "Now" ? "Posted!" : "Parked!"} Linear: ${linearId}` : finalUrg === "Now" ? "Posting and delivering..." : "Parking your idea..."}
            </div>
            {linearId && (
              <div style={{ fontSize: 13, color: C.grn }}>
                {finalUrg === "Now" ? "Delivered now — action item live." : "Tech idea sent to Linear — back to calls!"}
              </div>
            )}
            {!linearId && (
              <div style={{ fontSize: 13, color: C.mut }}>Saving to database...</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
