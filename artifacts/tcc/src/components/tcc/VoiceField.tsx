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
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={toggle}
      title={recording ? "Stop recording" : "Voice input"}
      style={{
        position: "absolute", right: 7,
        top: props.as === "textarea" ? 8 : "50%",
        transform: props.as === "textarea" ? "none" : "translateY(-50%)",
        width: 24, height: 24, borderRadius: "50%",
        border: `1.5px solid ${recording ? "#ef4444" : C.brd}`,
        background: recording ? "#fee2e2" : "#fff",
        cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 12, padding: 0,
        animation: recording ? "pulse 1.5s infinite" : "none",
        zIndex: 2, flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        transition: "all 0.15s",
      }}
    >
      {recording ? "⏹" : "🎙"}
    </button>
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
