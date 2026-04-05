import { useState, useRef, useEffect, type CSSProperties } from "react";
import { C, F } from "./constants";

interface SpeechRecognitionEvent { results: SpeechRecognitionResultList; resultIndex: number; }
interface SpeechRecognitionErrorEvent { error: string; }
interface SR extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window { SpeechRecognition: new () => SR; webkitSpeechRecognition: new () => SR; }
}
function getSR(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

interface BaseProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}
interface InputProps extends BaseProps { as?: "input"; type?: string; }
interface TextareaProps extends BaseProps { as: "textarea"; rows?: number; }
type Props = InputProps | TextareaProps;

export function VoiceField(props: Props) {
  const { value, onChange, placeholder, style, disabled, autoFocus, onKeyDown } = props;
  const [recording, setRecording] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const recRef = useRef<SR | null>(null);
  const SR = getSR();

  useEffect(() => () => { recRef.current?.abort(); }, []);

  const toggle = () => {
    if (recording) { recRef.current?.stop(); setRecording(false); return; }
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) t += e.results[i][0].transcript;
      }
      if (t.trim()) onChange(value ? value + " " + t.trim() : t.trim());
    };
    rec.onerror = () => { setRecording(false); recRef.current = null; };
    rec.onend = () => { setRecording(false); recRef.current = null; };
    recRef.current = rec;
    rec.start();
    setRecording(true);
  };

  const micBtn = SR ? (
    <div style={{ position: "absolute", right: 7, top: props.as === "textarea" ? 8 : "50%", transform: props.as === "textarea" ? "none" : "translateY(-50%)", zIndex: 2 }}>
      {showHint && !recording && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", right: 0,
          background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8,
          padding: "7px 10px", width: 210, fontSize: 11, lineHeight: 1.5,
          color: C.sub, whiteSpace: "normal", boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          pointerEvents: "none",
        }}>
          Tap to speak — text is appended to this field. Tap again to stop. Works best in Chrome.
          <div style={{ position: "absolute", bottom: -5, right: 10, width: 9, height: 9, background: C.card, border: `1px solid ${C.brd}`, borderTop: "none", borderLeft: "none", transform: "rotate(45deg)" }} />
        </div>
      )}
      {recording && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", right: 0,
          background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8,
          padding: "5px 9px", fontSize: 11, color: "#b91c1c", whiteSpace: "nowrap",
          fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          pointerEvents: "none",
        }}>
          Recording… tap to stop
          <div style={{ position: "absolute", bottom: -5, right: 10, width: 9, height: 9, background: "#fee2e2", border: "1px solid #fca5a5", borderTop: "none", borderLeft: "none", transform: "rotate(45deg)" }} />
        </div>
      )}
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={toggle}
        onMouseEnter={() => setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
        style={{
          width: 24, height: 24, borderRadius: "50%",
          border: `1.5px solid ${recording ? "#ef4444" : C.brd}`,
          background: recording ? "#fee2e2" : "#fff",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 12, padding: 0,
          animation: recording ? "pulse 1.5s infinite" : "none",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          transition: "all 0.15s",
        }}
      >
        {recording ? "⏹" : "🎙"}
      </button>
    </div>
  ) : null;

  const fieldStyle: CSSProperties = {
    ...style,
    paddingRight: SR ? 36 : (style?.paddingRight ?? 12),
    width: "100%",
    boxSizing: "border-box",
    fontFamily: F,
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {props.as === "textarea" ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={fieldStyle as CSSProperties}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={(props as TextareaProps).rows}
          onKeyDown={onKeyDown}
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={fieldStyle}
          disabled={disabled}
          autoFocus={autoFocus}
          type={(props as InputProps).type || "text"}
          onKeyDown={onKeyDown}
        />
      )}
      {micBtn}
    </div>
  );
}
