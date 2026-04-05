import { useState, useRef, useEffect } from "react";
import { C, F } from "./constants";
import { Tip } from "./Tip";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

interface Props {
  onTranscript: (text: string) => void;
  size?: number;
}

export function VoiceInput({ onTranscript, size = 32 }: Props) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const SR = getSpeechRecognition();

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  if (!SR) return null;

  const toggle = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("[VoiceInput] Error:", event.error);
      setRecording(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  const tipText = recording
    ? "Recording… speak now. Tap again to stop and send your message."
    : "Voice input — tap to start speaking. Works best in Chrome. Tap again when done. Your words will appear in the chat box.";

  return (
    <Tip tip={tipText}>
      <button
        type="button"
        onClick={toggle}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: recording ? `1.5px solid #ef4444` : `1.5px solid ${C.brd}`,
          background: recording ? "#fee2e2" : C.card,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.42,
          padding: 0,
          flexShrink: 0,
          transition: "all 0.15s ease",
          animation: recording ? "pulse 1.5s infinite" : "none",
          fontFamily: F,
        }}
      >
        {recording ? "⏹" : "🎙"}
      </button>
    </Tip>
  );
}
