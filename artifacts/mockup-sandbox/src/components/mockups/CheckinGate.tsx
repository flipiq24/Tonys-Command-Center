import { useState } from "react";

const F = "'Instrument Sans','DM Sans',-apple-system,sans-serif";
const FS = "'Instrument Serif','DM Serif Display',Georgia,serif";
const C = {
  bg: "#F7F6F3", card: "#FFF", brd: "#E8E6E1", tx: "#1A1A1A",
  sub: "#6B6B6B", mut: "#A3A3A3", red: "#C62828", grn: "#2E7D32",
  amb: "#E65100", blu: "#1565C0", redBg: "#FFEBEE", grnBg: "#E8F5E9",
  ambBg: "#FFF3E0", bluBg: "#E3F2FD",
};
const card: React.CSSProperties = { background: C.card, borderRadius: 14, padding: "20px 24px", border: `1px solid ${C.brd}` };
const inp: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 10, border: `2px solid ${C.brd}`, fontSize: 15, fontFamily: F, boxSizing: "border-box", outline: "none" };
const btn1: React.CSSProperties = { padding: "14px 28px", background: C.tx, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F };
const btn2: React.CSSProperties = { padding: "10px 18px", background: C.card, color: C.tx, border: `2px solid ${C.brd}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 };

const TODAY_STR = new Date().toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  timeZone: "America/Los_Angeles",
});

type CkState = {
  bed: string; wake: string; sleep: string;
  bible: boolean; workout: boolean; journal: boolean; unplug: boolean;
  nut: string;
};

export default function CheckinGate() {
  const [ck, setCk] = useState<CkState>({
    bed: "", wake: "", sleep: "",
    bible: false, workout: false, journal: false, unplug: false,
    nut: "",
  });
  const [clock] = useState(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }));
  const [submitted, setSubmitted] = useState(false);

  const upCk = (k: keyof CkState, v: unknown) => {
    const u = { ...ck, [k]: v } as CkState;
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

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ ...card, padding: "36px 40px", maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontFamily: FS, fontSize: 24, margin: "0 0 8px" }}>Check-in saved!</h1>
          <p style={{ color: C.sub, fontSize: 14, margin: "0 0 24px" }}>Loading your command center…</p>
          <button onClick={() => setSubmitted(false)} style={{ ...btn2 }}>← Back to form</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
      <div style={{ ...card, padding: "36px 40px", maxWidth: 480, width: "100%" }}>
        <h1 style={{ fontFamily: FS, fontSize: 28, margin: 0 }}>Morning Check-in</h1>
        <p style={{ color: C.mut, margin: "6px 0 0", fontSize: 13 }}>{TODAY_STR} · {clock}</p>
        <p style={{ fontFamily: FS, fontSize: 14, color: C.sub, fontStyle: "italic", margin: "12px 0 24px", borderLeft: `3px solid ${C.brd}`, paddingLeft: 12 }}>
          "Follow the plan I gave you!" — God
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          <div>
            <label style={lbl}>Bedtime</label>
            <input style={inp} placeholder="10:30 PM" value={ck.bed} onChange={e => upCk("bed", e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Wake time</label>
            <input style={inp} placeholder="6:00 AM" value={ck.wake} onChange={e => upCk("wake", e.target.value)} />
          </div>
        </div>

        {ck.sleep && (
          <div style={{ background: +ck.sleep >= 7 ? C.grnBg : C.ambBg, borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 14, fontWeight: 600, color: +ck.sleep >= 7 ? C.grn : C.amb }}>
            Sleep: {ck.sleep}h {+ck.sleep < 7 ? "⚠️" : "✓"}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          {(["bible", "workout", "journal", "unplug"] as (keyof CkState)[]).map((k) => {
            const labels: Record<string, string> = { bible: "Bible", workout: "Workout", journal: "Journal", unplug: "Unplug 6PM" };
            const active = !!ck[k];
            return (
              <button key={k} onClick={() => upCk(k, !ck[k])}
                style={{ padding: 13, borderRadius: 12, border: `2px solid ${active ? C.grn : C.brd}`, background: active ? C.grnBg : C.card, color: active ? C.grn : C.sub, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: F }}>
                {active ? "✓ " : ""}{labels[k]}
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={lbl}>Yesterday's Nutrition</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Good", "OK", "Bad"].map(n => {
              const col = n === "Good" ? C.grn : n === "OK" ? C.amb : C.red;
              const bg = n === "Good" ? C.grnBg : n === "OK" ? C.ambBg : C.redBg;
              const active = ck.nut === n;
              return (
                <button key={n} onClick={() => upCk("nut", n)}
                  style={{ flex: 1, padding: 12, borderRadius: 10, border: `2px solid ${active ? col : C.brd}`, background: active ? bg : C.card, color: active ? col : C.sub, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: F }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={() => setSubmitted(true)} style={{ ...btn1, width: "100%" }}>
          Let's Go →
        </button>
      </div>
    </div>
  );
}
