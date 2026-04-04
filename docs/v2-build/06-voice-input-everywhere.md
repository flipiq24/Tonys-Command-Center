# Prompt 06: Voice Input Everywhere

## CONTEXT

Tony talks fast and types slow. Every text field in the Command Center should have a microphone button that uses the Web Speech API to transcribe speech and append it to the field. This is a single reusable component (`VoiceInput`) wired into every existing text input/textarea across the app. On browsers that don't support the Web Speech API (Firefox), the mic button simply doesn't render — no alerts, no errors.

## PREREQUISITES

- Prompts 00-02 completed (all components referenced below exist and work)
- Browser supports `webkitSpeechRecognition` or `SpeechRecognition` (Chrome, Edge, Safari). Firefox does not support it — the mic button simply won't render there.

## WHAT TO BUILD

### Step 1: Create the VoiceInput component

**Create NEW file: `artifacts/tcc/src/components/tcc/VoiceInput.tsx`**

```typescript
import { useState, useRef, useEffect } from "react";
import { C, F } from "./constants";

// Type declarations for the Web Speech API
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
  /** Called with the new transcript text to append to the field */
  onTranscript: (text: string) => void;
  /** Optional: size of the mic button in px (default 32) */
  size?: number;
}

export function VoiceInput({ onTranscript, size = 32 }: Props) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const SR = getSpeechRecognition();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  // Hide mic button on unsupported browsers (don't show alert)
  if (!SR) return null;

  const toggle = () => {
    if (recording) {
      // Stop recording
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    // Start recording
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
      console.warn("[VoiceInput] Speech recognition error:", event.error);
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

  return (
    <button
      type="button"
      onClick={toggle}
      title={recording ? "Stop recording" : "Voice input"}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: recording ? `2px solid ${C.red}` : `2px solid ${C.brd}`,
        background: recording ? C.redBg : C.card,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        padding: 0,
        flexShrink: 0,
        transition: "all 0.15s ease",
        animation: recording ? "pulse 1.5s infinite" : "none",
        fontFamily: F,
      }}
    >
      {recording ? "⏹" : "🎙"}
    </button>
  );
}

/**
 * Helper: wraps an input/textarea value + setter to work with VoiceInput.
 * Usage: <VoiceInput onTranscript={appendTo(value, setValue)} />
 */
export function appendTo(currentValue: string, setValue: (v: string) => void) {
  return (transcript: string) => {
    const separator = currentValue && !currentValue.endsWith(" ") ? " " : "";
    setValue(currentValue + separator + transcript);
  };
}
```

### Step 2: Add the pulse animation to index.html

**File: `artifacts/tcc/index.html`** — Add inside the existing `<style>` tag in `<head>` (or create one if none exists):

```html
<style>
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(198,40,40,0.3); }
    50% { box-shadow: 0 0 0 8px rgba(198,40,40,0); }
  }
</style>
```

### Step 3: Add VoiceInput to CheckinGate (bedtime + wake fields)

**File: `artifacts/tcc/src/components/tcc/CheckinGate.tsx`**

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the bedtime input field (the one with `placeholder` containing "10:30pm" or similar, updating via `upCk("bed", ...)`). Wrap it in a container div with the mic button:

```typescript
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
  <input
    value={ck.bed}
    onChange={e => upCk("bed", e.target.value)}
    placeholder="10:30pm"
    style={{ ...inp, flex: 1 }}
  />
  <VoiceInput onTranscript={appendTo(ck.bed, v => upCk("bed", v))} size={30} />
</div>
```

Do the same for the wake time input:
```typescript
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
  <input
    value={ck.wake}
    onChange={e => upCk("wake", e.target.value)}
    placeholder="5:30am"
    style={{ ...inp, flex: 1 }}
  />
  <VoiceInput onTranscript={appendTo(ck.wake, v => upCk("wake", v))} size={30} />
</div>
```

### Step 4: Add VoiceInput to JournalGate (textarea)

**File: `artifacts/tcc/src/components/tcc/JournalGate.tsx`**

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the textarea (the one bound to `jTxt`). Wrap it so the mic sits at the top-right corner of the textarea:

```typescript
<div style={{ position: "relative" }}>
  <textarea
    value={jTxt}
    onChange={e => setJTxt(e.target.value)}
    placeholder="What's on your mind? What happened yesterday? What are you grateful for?"
    style={{ ...inp, minHeight: 180, resize: "vertical", fontSize: 15, lineHeight: 1.7, paddingRight: 44 }}
  />
  <div style={{ position: "absolute", top: 10, right: 10 }}>
    <VoiceInput onTranscript={appendTo(jTxt, setJTxt)} />
  </div>
</div>
```

### Step 5: Add VoiceInput to IdeasModal (textarea)

**File: `artifacts/tcc/src/components/tcc/IdeasModal.tsx`**

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the textarea bound to `text` (in the "input" step). Wrap it the same way:

```typescript
<div style={{ position: "relative" }}>
  <textarea
    value={text}
    onChange={e => setText(e.target.value)}
    placeholder="Type or speak your idea..."
    style={{ ...inp, minHeight: 100, resize: "vertical", paddingRight: 44 }}
  />
  <div style={{ position: "absolute", top: 10, right: 10 }}>
    <VoiceInput onTranscript={appendTo(text, setText)} />
  </div>
</div>
```

### Step 6: Add VoiceInput to EmailCompose (body textarea)

**File: `artifacts/tcc/src/components/tcc/EmailCompose.tsx`** (created in Prompt 01)

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the body textarea (bound to `body`). Add the mic button next to the "AI Draft" button in the label row:

```typescript
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
  <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1 }}>Body</label>
  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
    <VoiceInput onTranscript={appendTo(body, setBody)} size={28} />
    <button
      onClick={handleAiDraft}
      disabled={aiDrafting}
      style={{ ...btn2, padding: "4px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}
    >
      {aiDrafting ? "Drafting..." : "AI Draft"}
    </button>
  </div>
</div>
```

### Step 7: Add VoiceInput to ClaudeModal (prompt input)

**File: `artifacts/tcc/src/components/tcc/ClaudeModal.tsx`**

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the textarea (bound to `prompt`). Wrap it:

```typescript
<div style={{ position: "relative" }}>
  <textarea
    value={prompt}
    onChange={e => setPrompt(e.target.value)}
    placeholder="What do you need?"
    style={{ ...inp, minHeight: 80, resize: "vertical", marginBottom: 12, paddingRight: 44 }}
  />
  <div style={{ position: "absolute", top: 10, right: 10 }}>
    <VoiceInput onTranscript={appendTo(prompt, setPrompt)} />
  </div>
</div>
```

### Step 8: Add VoiceInput to AttemptModal (notes textarea)

**File: `artifacts/tcc/src/components/tcc/AttemptModal.tsx`**

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the textarea bound to `note`. Wrap it:

```typescript
<div style={{ position: "relative" }}>
  <textarea
    value={note}
    onChange={e => setNote(e.target.value)}
    placeholder='"No answer, send email about demo..."'
    style={{ ...inp, minHeight: 80, resize: "vertical", paddingRight: 44 }}
  />
  <div style={{ position: "absolute", top: 10, right: 10 }}>
    <VoiceInput onTranscript={appendTo(note, setNote)} />
  </div>
</div>
```

### Step 9: Add VoiceInput to SmsModal (message body)

**File: `artifacts/tcc/src/components/tcc/SmsModal.tsx`**

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the textarea bound to `message`. Wrap it:

```typescript
<div style={{ position: "relative" }}>
  <textarea
    value={message}
    onChange={e => setMessage(e.target.value)}
    placeholder="Type your message..."
    style={{ width: "100%", border: `1px solid ${C.brd}`, borderRadius: 10, padding: "10px 44px 10px 14px", fontFamily: F, fontSize: 14, minHeight: 80, resize: "vertical", boxSizing: "border-box", outline: "none" }}
  />
  <div style={{ position: "absolute", top: 10, right: 10 }}>
    <VoiceInput onTranscript={appendTo(message, setMessage)} />
  </div>
</div>
```

### Step 10: Add VoiceInput to SalesView search bar

**File: `artifacts/tcc/src/components/tcc/SalesView.tsx`**

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the search bar (the `<input>` bound to `search`). The search bar already has a wrapper. Add the VoiceInput next to the existing clear button:

```typescript
{/* Search bar */}
<div style={{ position: "relative", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
  <input
    type="text"
    value={search}
    onChange={e => setSearch(e.target.value)}
    placeholder="Search contacts by name, company, phone, email..."
    style={{ flex: 1, border: `1px solid ${C.brd}`, borderRadius: 10, padding: "9px 36px 9px 12px", fontFamily: F, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FAFAF8" }}
  />
  {searching && <span style={{ position: "absolute", right: 44, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.mut }}>...</span>}
  {search && !searching && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 44, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut, padding: 2 }}>X</button>}
  <VoiceInput onTranscript={t => setSearch(t)} size={30} />
</div>
```

Note: For the search bar, we REPLACE (not append) the search text with the voice transcript since search is a query, not a document.

### Step 11: Add VoiceInput to Connected Call Modal (outcome notes + next step)

**File: `artifacts/tcc/src/components/tcc/ConnectedCallModal.tsx`** (or wherever the connected call outcome form lives)

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the outcome notes textarea (bound to `outcomeNotes` or similar). Wrap it:

```typescript
<div style={{ position: "relative" }}>
  <textarea
    value={outcomeNotes}
    onChange={e => setOutcomeNotes(e.target.value)}
    placeholder="What happened on the call?"
    style={{ ...inp, minHeight: 80, resize: "vertical", paddingRight: 44 }}
  />
  <div style={{ position: "absolute", top: 10, right: 10 }}>
    <VoiceInput onTranscript={appendTo(outcomeNotes, setOutcomeNotes)} />
  </div>
</div>
```

Find the next step input (bound to `nextStep` or similar). Add a mic button:

```typescript
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
  <input
    value={nextStep}
    onChange={e => setNextStep(e.target.value)}
    placeholder="e.g. Send follow-up email, Schedule demo..."
    style={{ ...inp, flex: 1 }}
  />
  <VoiceInput onTranscript={appendTo(nextStep, setNextStep)} size={30} />
</div>
```

### Step 12: Add VoiceInput to Task "Worked On It" Note Modal

**File: `artifacts/tcc/src/components/tcc/TaskWorkedOnModal.tsx`** (or wherever the "worked on it" note input lives — may be inline in TasksView.tsx)

Add import at the top:
```typescript
import { VoiceInput, appendTo } from "./VoiceInput";
```

Find the note textarea for the "worked on it" action. Wrap it:

```typescript
<div style={{ position: "relative" }}>
  <textarea
    value={workedNote}
    onChange={e => setWorkedNote(e.target.value)}
    placeholder="What did you do on this task?"
    style={{ ...inp, minHeight: 60, resize: "vertical", paddingRight: 44 }}
  />
  <div style={{ position: "absolute", top: 10, right: 10 }}>
    <VoiceInput onTranscript={appendTo(workedNote, setWorkedNote)} />
  </div>
</div>
```

## VERIFY BEFORE MOVING ON

1. Open the app in Chrome — mic buttons appear on ALL text fields listed above (12 locations total)
2. Open the app in Firefox — NO mic buttons appear anywhere (graceful degradation, no errors, no alerts)
3. Click a mic button — it turns red with a pulsing border, browser asks for microphone permission
4. Speak into the mic — text appears in the field (appended to existing text, not replacing)
5. Click the red mic button again — recording stops
6. Test specifically: CheckinGate bed/wake, JournalGate textarea, IdeasModal textarea, ClaudeModal textarea, AttemptModal textarea, SmsModal textarea, SalesView search bar, EmailCompose body
7. Test the NEW fields: Connected call modal outcome notes + next step, Task "worked on it" note modal
8. Verify the EmailCompose mic button sits next to the "AI Draft" button without layout breakage
9. No console errors about SpeechRecognition on any browser
