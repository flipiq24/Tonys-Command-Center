import { useState, useRef, useEffect } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2, lbl } from "./constants";
import type { Idea } from "./types";

const CATS = ["Tech", "Sales", "Marketing", "Strategic Partners", "Operations", "Product", "Personal"];
const URG = ["Now", "This Week", "This Month", "Someday"];
const PRIORITY_COLOR: Record<string, string> = { high: C.red, medium: C.amb, low: C.grn };

interface Classification {
  category: string;
  urgency: string;
  techType: string | null;
  reason: string;
  businessFit: string;
  priority: string;
  warningIfDistraction?: string;
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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const finalCat = overrides.category ?? classification?.category ?? "Tech";
  const finalUrg = overrides.urgency ?? classification?.urgency ?? "This Week";
  const finalTt = overrides.techType ?? classification?.techType ?? null;

  const reset = () => {
    setText("");
    setStep("input");
    setClassification(null);
    setOverrides({});
    setError("");
    setLinearId(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const classify = async () => {
    if (!text.trim()) return;
    setStep("classifying");
    setError("");
    try {
      const res = await post<{ ok: boolean; classification: Classification }>("/ideas/classify", { text });
      setClassification(res.classification);
      setOverrides({});
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
      const idea = await post<Idea & { linearIssue?: { identifier: string } | null }>("/ideas", {
        text,
        category: finalCat,
        urgency: finalUrg,
        techType: finalTt || undefined,
      });
      if (idea.linearIssue?.identifier) {
        setLinearId(idea.linearIssue.identifier);
        // Show confirmation briefly then close — uses mounted ref to avoid setState after unmount
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
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Speak or type your idea..."
              autoFocus
              onKeyDown={e => { if (e.key === "Enter" && e.metaKey) classify(); }}
              style={{ ...inp, minHeight: 80, resize: "vertical", marginBottom: 14 }}
            />
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
            {finalCat === "Tech" && (
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Type</label>
                <div style={{ display: "flex", gap: 5 }}>
                  {["Bug", "Feature", "Idea"].map(t => (
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
                  Tech ideas auto-create a Linear issue
                </div>
              </div>
            )}

            {error && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep("input")} style={{ ...btn2, flex: 1 }}>← Edit</button>
              <button onClick={save} style={{ ...btn1, flex: 2 }}>
                Park It → Back to Calls
              </button>
            </div>
          </>
        )}

        {/* ── STEP 4: Saving / confirmation ── */}
        {step === "saving" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              {linearId ? "✅" : "⏳"}
            </div>
            <div style={{ fontFamily: FS, fontSize: 18, marginBottom: 8 }}>
              {linearId ? `Parked! Linear: ${linearId}` : "Parking your idea..."}
            </div>
            {linearId && (
              <div style={{ fontSize: 13, color: C.grn }}>
                Tech idea sent to Linear — back to calls!
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
