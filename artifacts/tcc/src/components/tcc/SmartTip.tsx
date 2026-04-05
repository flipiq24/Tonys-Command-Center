import { useState, useRef, useEffect, useCallback } from "react";
import { post } from "@/lib/api";
import { F, C } from "./constants";
import { VoiceField } from "./VoiceField";

interface SmartTipProps {
  tipKey: string;
  tip: string;
  children: React.ReactNode;
  onSaved?: (key: string, newText: string) => void;
}

export function SmartTip({ tipKey, tip, children, onSaved }: SmartTipProps) {
  const [show, setShow] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tip);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pos, setPos] = useState<"above" | "below">("above");
  const [align, setAlign] = useState<"center" | "left" | "right">("center");
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(tip); }, [tip]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Control") setCtrlHeld(true); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Control") { setCtrlHeld(false); if (!editing) setShow(false); } };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [editing]);

  const computePosition = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    setPos(spaceAbove >= 120 || spaceAbove > spaceBelow ? "above" : "below");

    const center = rect.left + rect.width / 2;
    if (center < 180) setAlign("left");
    else if (center > window.innerWidth - 180) setAlign("right");
    else setAlign("center");
  }, []);

  const handleMouseEnter = () => {
    computePosition();
    setShow(true);
    if (ctrlHeld) setEditing(true);
  };

  const handleMouseLeave = () => {
    if (!editing) setShow(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await post("/system-instructions", { key: tipKey, text: draft });
      onSaved?.(tipKey, draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* noop */ }
    setSaving(false);
    setEditing(false);
    setShow(false);
  };

  const handleCancel = () => {
    setDraft(tip);
    setEditing(false);
    setShow(false);
  };

  const tipWidth = editing ? 320 : 240;

  const transformX =
    align === "center" ? "translateX(-50%)" :
    align === "left" ? "translateX(0)" :
    "translateX(calc(-100% + 100%))";

  const leftVal = align === "center" ? "50%" : align === "left" ? "0" : "auto";
  const rightVal = align === "right" ? "0" : "auto";
  const arrowLeft = align === "center" ? "50%" : align === "left" ? "20px" : "auto";
  const arrowRight = align === "right" ? "20px" : "auto";

  const tipStyle: React.CSSProperties = {
    position: "absolute",
    [pos === "above" ? "bottom" : "top"]: "calc(100% + 8px)",
    left: leftVal,
    right: rightVal,
    transform: align === "center" ? transformX : "none",
    width: tipWidth,
    background: C.card,
    color: editing ? C.tx : C.sub,
    border: `1px solid ${editing ? "#F97316" : C.brd}`,
    borderRadius: 8,
    padding: editing ? 14 : "8px 11px",
    zIndex: 9999,
    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    fontSize: 11,
    lineHeight: 1.55,
    fontFamily: F,
  };

  const arrowStyle: React.CSSProperties = {
    position: "absolute",
    [pos === "above" ? "bottom" : "top"]: -5,
    left: arrowLeft,
    right: arrowRight,
    transform: align === "center" ? "translateX(-50%) rotate(45deg)" : "rotate(45deg)",
    width: 9, height: 9,
    background: C.card,
    border: `1px solid ${editing ? "#F97316" : C.brd}`,
    borderTop: "none",
    borderLeft: "none",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div ref={tipRef} style={tipStyle} onMouseLeave={() => { if (!editing) setShow(false); }}>
          {editing ? (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#F97316", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Edit instruction — "{tipKey}"
              </div>
              <VoiceField
                as="textarea"
                value={draft}
                onChange={setDraft}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleSave(); if (e.key === "Escape") handleCancel(); }}
                style={{ width: "100%", minHeight: 80, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.brd}`, fontSize: 12, fontFamily: F, lineHeight: 1.5, resize: "vertical", boxSizing: "border-box", outline: "none" }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ flex: 1, padding: "6px 0", background: "#F97316", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                  {saving ? "Saving…" : saved ? "Saved ✓" : "Save (⌘↵)"}
                </button>
                <button
                  onClick={handleCancel}
                  style={{ padding: "6px 12px", background: C.card, color: C.sub, border: `1px solid ${C.brd}`, borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: F }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {tip}
              {ctrlHeld && (
                <div style={{ marginTop: 6, fontSize: 10, color: C.mut, borderTop: `1px solid ${C.brd}`, paddingTop: 6 }}>
                  Click to edit this instruction
                </div>
              )}
              {!editing && <div style={arrowStyle} />}
            </>
          )}
        </div>
      )}
      {ctrlHeld && !show && (
        <div style={{ position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", background: "#FFF7ED", color: "#F97316", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", zIndex: 9999, border: "1px solid #F97316", fontFamily: F }}>
          Hover to edit
        </div>
      )}
    </div>
  );
}
