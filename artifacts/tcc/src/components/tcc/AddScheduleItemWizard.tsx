import { useState, useEffect, useRef, useCallback } from "react";
import { C, F, FS, btn1, btn2, inp, lbl } from "./constants";
import { get, post } from "../../lib/api";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const TYPES = ["Appointment", "Demo", "Face to Face", "Call"] as const;
type EventType = typeof TYPES[number];

const CATEGORIES = [
  "TECH", "OPERATIONS", "FINANCE", "IMPORTANT",
  "PROJECTS", "PERSONAL", "MEETING", "NEEDS PLANNING", "SALES",
] as const;
type Category = typeof CATEGORIES[number] | string;

const CAT_COLORS: Record<string, string> = {
  TECH: C.blu, OPERATIONS: C.amb, FINANCE: "#2E7D32",
  IMPORTANT: C.red, PROJECTS: "#7B1FA2", PERSONAL: "#00838F",
  MEETING: "#5D4037", "NEEDS PLANNING": "#E65100", SALES: "#1565C0",
};

const DURATIONS = [
  { label: "30m", mins: 30 },
  { label: "1h", mins: 60 },
  { label: "1h 30m", mins: 90 },
  { label: "2h", mins: 120 },
  { label: "Custom", mins: -1 },
];

function addMinutes(timeStr: string, mins: number): string {
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return "";
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (m[3].toUpperCase() === "PM" && h < 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  const totalMin = h * 60 + min + mins;
  const endH = Math.floor(totalMin / 60) % 24;
  const endMin = totalMin % 60;
  const endAmpm = endH < 12 ? "AM" : "PM";
  const displayH = endH === 0 ? 12 : endH > 12 ? endH - 12 : endH;
  return `${displayH}:${String(endMin).padStart(2, "0")} ${endAmpm}`;
}

interface Contact { name: string; email: string; }

interface GuiltTrip {
  msg: string;
  callsMade: number;
  quotaTarget: number;
}

export function AddScheduleItemWizard({ onClose, onSaved }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [eventType, setEventType] = useState<EventType | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const [customCategory, setCustomCategory] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [importance, setImportance] = useState<"high" | "mid" | "low">("mid");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("9:00 AM");
  const [durationMins, setDurationMins] = useState(60);
  const [customDuration, setCustomDuration] = useState("");
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [person, setPerson] = useState("");
  const [contactSuggestions, setContactSuggestions] = useState<Contact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [description, setDescription] = useState("");
  const [briefing, setBriefing] = useState("");
  const [saving, setSaving] = useState(false);
  const [guiltTrip, setGuiltTrip] = useState<GuiltTrip | null>(null);
  const [error, setError] = useState("");
  const autocompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const personRef = useRef<HTMLDivElement>(null);

  const finalCategory = category === "CUSTOM" ? customCategory : String(category);

  useEffect(() => {
    if (eventType && category) {
      setTitle(`${finalCategory} ${eventType}`);
    }
  }, [eventType, category, finalCategory]);

  const handlePersonChange = useCallback((val: string) => {
    setPerson(val);
    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
    if (val.length < 2) { setContactSuggestions([]); setShowSuggestions(false); return; }
    autocompleteTimer.current = setTimeout(async () => {
      try {
        const results = await get<Contact[]>(`/contacts/autocomplete?q=${encodeURIComponent(val)}`);
        setContactSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { setContactSuggestions([]); setShowSuggestions(false); }
    }, 300);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (personRef.current && !personRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const timeEnd = (() => {
    const mins = showCustomDuration ? parseInt(customDuration) || 0 : durationMins;
    return mins > 0 ? addMinutes(time, mins) : undefined;
  })();

  const handleSave = async (forceOverride = false) => {
    setError("");
    setSaving(true);
    try {
      const result = await post<{ ok: boolean; guiltTrip?: boolean; guiltTripMsg?: string; callsMade?: number; quotaTarget?: number }>("/schedule/add", {
        time,
        timeEnd,
        title,
        type: eventType,
        category: finalCategory,
        importance,
        person: person || undefined,
        description: description || undefined,
        briefing: briefing || undefined,
        forceOverride,
      });

      if (!result.ok && result.guiltTrip) {
        setGuiltTrip({
          msg: result.guiltTripMsg || "This meeting conflicts with call hours.",
          callsMade: result.callsMade ?? 0,
          quotaTarget: result.quotaTarget ?? 10,
        });
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const stepLabels = ["Type", "Category", "Priority", "Details"];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.55)", display: "flex",
      alignItems: "flex-end", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: C.bg, borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 600,
        maxHeight: "92vh", overflowY: "auto",
        padding: "0 0 40px 0",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px",
          position: "sticky", top: 0, background: C.bg, zIndex: 1,
          borderBottom: `1px solid ${C.brd}`,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: FS, color: C.tx }}>
              Add to Schedule
            </div>
            <div style={{ fontSize: 12, color: C.mut, marginTop: 2, fontFamily: F }}>
              Step {step} of 4 — {stepLabels[step - 1]}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 22, color: C.sub,
            cursor: "pointer", lineHeight: 1, padding: "4px 8px",
          }}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: C.brd }}>
          <div style={{
            height: 3, background: C.tx,
            width: `${(step / 4) * 100}%`,
            transition: "width 0.3s ease",
          }} />
        </div>

        <div style={{ padding: "24px 24px 0" }}>
          {/* ── Step 1: Type ── */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 20 }}>
                What kind of event is this?
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {TYPES.map(t => (
                  <button key={t} onClick={() => { setEventType(t); setStep(2); }}
                    style={{
                      padding: "24px 12px", borderRadius: 14,
                      border: `2px solid ${eventType === t ? C.tx : C.brd}`,
                      background: eventType === t ? C.tx : C.card,
                      color: eventType === t ? "#fff" : C.tx,
                      fontSize: 16, fontWeight: 700, cursor: "pointer",
                      fontFamily: F, textAlign: "center",
                      transition: "all 0.15s",
                    }}>
                    {t === "Appointment" && "📅"}
                    {t === "Demo" && "🎯"}
                    {t === "Face to Face" && "🤝"}
                    {t === "Call" && "📞"}
                    <div style={{ marginTop: 8 }}>{t}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Category ── */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 20 }}>
                What area is this in?
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {CATEGORIES.map(cat => {
                  const color = CAT_COLORS[cat] || C.tx;
                  const selected = category === cat;
                  return (
                    <button key={cat} onClick={() => { setCategory(cat); setShowCustomInput(false); setStep(3); }}
                      style={{
                        padding: "16px 8px", borderRadius: 12,
                        border: `2px solid ${selected ? color : C.brd}`,
                        background: selected ? color + "22" : C.card,
                        color: selected ? color : C.tx,
                        fontSize: 11, fontWeight: 700, cursor: "pointer",
                        fontFamily: F, textAlign: "center",
                        letterSpacing: 0.5,
                      }}>
                      {cat}
                    </button>
                  );
                })}
                <button onClick={() => { setCategory("CUSTOM"); setShowCustomInput(true); }}
                  style={{
                    padding: "16px 8px", borderRadius: 12,
                    border: `2px dashed ${C.brd}`,
                    background: C.card, color: C.sub,
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    fontFamily: F, textAlign: "center",
                  }}>
                  + Custom
                </button>
              </div>
              {showCustomInput && (
                <div style={{ marginTop: 16 }}>
                  <label style={lbl}>Custom Category</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      autoFocus
                      value={customCategory}
                      onChange={e => setCustomCategory(e.target.value.toUpperCase())}
                      placeholder="e.g. LEGAL"
                      style={{ ...inp, flex: 1 }}
                      onKeyDown={e => { if (e.key === "Enter" && customCategory.trim()) setStep(3); }}
                    />
                    <button onClick={() => { if (customCategory.trim()) setStep(3); }}
                      style={{ ...btn1, padding: "10px 18px" }}>
                      Next →
                    </button>
                  </div>
                </div>
              )}
              <button onClick={() => setStep(1)} style={{ ...btn2, marginTop: 20, width: "100%" }}>
                ← Back
              </button>
            </div>
          )}

          {/* ── Step 3: Importance ── */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 20 }}>
                How important is this?
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
                {([
                  { val: "high", label: "HIGH", color: C.red, bg: C.redBg, emoji: "🔴" },
                  { val: "mid",  label: "MID",  color: C.amb, bg: C.ambBg, emoji: "🟡" },
                  { val: "low",  label: "LOW",  color: C.grn, bg: C.grnBg, emoji: "🟢" },
                ] as const).map(opt => (
                  <button key={opt.val} onClick={() => setImportance(opt.val)}
                    style={{
                      padding: "24px 12px", borderRadius: 14,
                      border: `2px solid ${importance === opt.val ? opt.color : C.brd}`,
                      background: importance === opt.val ? opt.bg : C.card,
                      color: importance === opt.val ? opt.color : C.tx,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      fontFamily: F, textAlign: "center",
                    }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{opt.emoji}</div>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(2)} style={{ ...btn2, flex: 1 }}>← Back</button>
                <button onClick={() => setStep(4)} style={{ ...btn1, flex: 2 }}>Next →</button>
              </div>
            </div>
          )}

          {/* ── Step 4: Details ── */}
          {step === 4 && (
            <div>
              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Event Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  style={inp} placeholder="e.g. SALES Demo" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={lbl}>Start Time</label>
                  <input value={time} onChange={e => setTime(e.target.value)}
                    style={inp} placeholder="9:00 AM" />
                </div>
                <div>
                  <label style={lbl}>Duration</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {DURATIONS.map(d => (
                      <button key={d.label}
                        onClick={() => {
                          if (d.mins === -1) { setShowCustomDuration(true); }
                          else { setDurationMins(d.mins); setShowCustomDuration(false); }
                        }}
                        style={{
                          padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: `2px solid ${(!showCustomDuration && durationMins === d.mins) || (showCustomDuration && d.mins === -1) ? C.tx : C.brd}`,
                          background: (!showCustomDuration && durationMins === d.mins) || (showCustomDuration && d.mins === -1) ? C.tx : C.card,
                          color: (!showCustomDuration && durationMins === d.mins) || (showCustomDuration && d.mins === -1) ? "#fff" : C.tx,
                          cursor: "pointer", fontFamily: F,
                        }}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                  {showCustomDuration && (
                    <input value={customDuration}
                      onChange={e => setCustomDuration(e.target.value)}
                      style={{ ...inp, marginTop: 8 }} placeholder="Minutes (e.g. 45)" type="number" />
                  )}
                  {timeEnd && (
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>
                      Ends at {timeEnd}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 18, position: "relative" }} ref={personRef}>
                <label style={lbl}>Person / Contact</label>
                <input value={person}
                  onChange={e => handlePersonChange(e.target.value)}
                  onFocus={() => contactSuggestions.length > 0 && setShowSuggestions(true)}
                  style={inp} placeholder="Name or email..." />
                {showSuggestions && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                    background: C.card, border: `1px solid ${C.brd}`, borderRadius: 10,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.1)", maxHeight: 200, overflowY: "auto",
                  }}>
                    {contactSuggestions.map((c, i) => (
                      <div key={i}
                        onClick={() => { setPerson(c.name || c.email); setShowSuggestions(false); }}
                        style={{
                          padding: "10px 14px", cursor: "pointer", fontSize: 13,
                          borderBottom: i < contactSuggestions.length - 1 ? `1px solid ${C.brd}` : "none",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ fontWeight: 600, color: C.tx }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: C.mut }}>{c.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>What it's about</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  rows={2} style={{ ...inp, resize: "vertical" }}
                  placeholder="Brief context for the event..." />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={lbl}>Briefing (optional)</label>
                <textarea value={briefing} onChange={e => setBriefing(e.target.value)}
                  rows={3} style={{ ...inp, resize: "vertical" }}
                  placeholder="Key talking points, prep notes, links..." />
              </div>

              {/* Summary strip */}
              <div style={{
                background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12,
                padding: "14px 16px", marginBottom: 20,
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              }}>
                <div style={{ fontSize: 12, color: C.sub }}>
                  <span style={{ fontWeight: 700, color: C.tx }}>{eventType}</span> · {finalCategory}
                </div>
                <div style={{ fontSize: 12, color: C.sub }}>
                  {time}{timeEnd ? ` → ${timeEnd}` : ""} · <span style={{
                    color: importance === "high" ? C.red : importance === "low" ? C.grn : C.amb,
                    fontWeight: 700, textTransform: "uppercase",
                  }}>{importance}</span>
                </div>
              </div>

              {error && (
                <div style={{ color: C.red, fontSize: 13, marginBottom: 12, padding: "10px 14px", background: C.redBg, borderRadius: 8 }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(3)} style={{ ...btn2, flex: 1 }}>← Back</button>
                <button onClick={() => handleSave(false)} disabled={saving || !title.trim() || !time.trim()}
                  style={{ ...btn1, flex: 2, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Add to Schedule"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Guilt Trip Overlay ── */}
      {guiltTrip && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(0,0,0,0.7)", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            background: C.card, borderRadius: 20, padding: 32,
            maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: 40, textAlign: "center", marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FS, color: C.red, textAlign: "center", marginBottom: 12 }}>
              Hold on, Tony.
            </div>
            <div style={{
              background: C.redBg, border: `1px solid ${C.red}44`,
              borderRadius: 12, padding: "14px 16px", marginBottom: 20,
              fontSize: 14, color: C.tx, lineHeight: 1.6,
            }}>
              {guiltTrip.msg}
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: C.ambBg, borderRadius: 10, padding: "10px 16px", marginBottom: 24,
            }}>
              <span style={{ fontSize: 13, color: C.amb, fontWeight: 700 }}>
                📞 Calls today
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: C.tx }}>
                {guiltTrip.callsMade} / {guiltTrip.quotaTarget}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setGuiltTrip(null)}
                style={{
                  ...btn2, flex: 1, borderColor: C.grn, color: C.grn,
                  fontWeight: 700, padding: "14px 12px",
                }}>
                I'll reschedule it
              </button>
              <button
                onClick={() => { setGuiltTrip(null); handleSave(true); }}
                disabled={saving}
                style={{
                  ...btn1, flex: 1, background: C.red,
                  opacity: saving ? 0.6 : 1,
                  padding: "14px 12px",
                }}>
                {saving ? "Saving…" : "Doing it anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
