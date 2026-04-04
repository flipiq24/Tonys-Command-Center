import { useState } from "react";
import { post } from "@/lib/api";
import { C, F, FS, card, btn1, btn2, TIPS } from "./constants";
import { SmartTip } from "./SmartTip";
import { EmailReplyModal } from "./EmailReplyModal";
import type { EmailItem } from "./types";

interface Props {
  emailsImportant: EmailItem[];
  emailsFyi: EmailItem[];
  snoozed: Record<number, string>;
  customTips: Record<string, string>;
  onSnooze: (emailId: number, until: string) => void;
  onDone: () => void;
  onTipSaved: (key: string, text: string) => void;
}

export function EmailsView({ emailsImportant, emailsFyi, snoozed, customTips, onSnooze, onDone, onTipSaved }: Props) {
  const [replyEmail, setReplyEmail] = useState<EmailItem | null>(null);
  const unresolved = emailsImportant.filter(e => !snoozed[e.id]).length;
  const tip = (key: string) => customTips[key] ?? TIPS[key] ?? "";

  return (
    <>
      <EmailReplyModal email={replyEmail} onClose={() => setReplyEmail(null)} />
      <div style={{ maxWidth: 680, margin: "24px auto", padding: "0 20px" }}>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Important Emails</h3>
            <span style={{ color: C.red, fontWeight: 700, fontSize: 13 }}>{unresolved} need attention</span>
          </div>
          {emailsImportant.filter(e => !snoozed[e.id]).map(e => (
            <div key={e.id} style={{ padding: 14, marginBottom: 8, background: e.p === "high" ? C.redBg : "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${e.p === "high" ? C.red : e.p === "med" ? C.amb : C.mut}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{e.from}</span>
                <span style={{ fontSize: 11, color: C.mut }}>{e.time}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{e.subj}</div>
              <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>→ {e.why}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <SmartTip tipKey="suggestReply" tip={tip("suggestReply")} onSaved={onTipSaved}>
                  <button onClick={() => setReplyEmail(e)} style={{ ...btn2, padding: "5px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}>Suggest Reply</button>
                </SmartTip>
                <SmartTip tipKey="snooze" tip={tip("snooze")} onSaved={onTipSaved}>
                  <select onChange={ev => {
                    if (ev.target.value) {
                      onSnooze(e.id, ev.target.value);
                      post("/emails/action", { action: "snooze", emailId: e.id, snoozeUntil: ev.target.value }).catch(() => {});
                      ev.target.value = "";
                    }
                  }} defaultValue="" style={{ ...btn2, padding: "5px 8px", fontSize: 11 }}>
                    <option value="">Snooze...</option>
                    <option value="1h">1 hour</option>
                    <option value="2h">2 hours</option>
                    <option value="tom">Tomorrow</option>
                    <option value="nw">Next week</option>
                  </select>
                </SmartTip>
                <button onClick={() => post("/emails/action", { action: "thumbs_up", sender: e.from, subject: e.subj }).catch(() => {})} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>👍</button>
                <button onClick={() => post("/emails/action", { action: "thumbs_down", sender: e.from, subject: e.subj }).catch(() => {})} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>👎</button>
              </div>
            </div>
          ))}
          {unresolved === 0 && <div style={{ padding: 16, textAlign: "center", color: C.grn, fontWeight: 700, background: C.grnBg, borderRadius: 10 }}>All handled ✓</div>}
        </div>
        <div style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ fontFamily: FS, fontSize: 19, margin: "0 0 14px" }}>FYI — No Reply Needed</h3>
          {emailsFyi.map(e => (
            <div key={e.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.brd}` }}>
              <div style={{ fontSize: 14 }}><strong>{e.from}</strong> — {e.subj}</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>{e.why}</div>
            </div>
          ))}
        </div>
        <button onClick={onDone} style={{ ...btn1, width: "100%", marginBottom: 40 }}>
          Done — Show My Day →
        </button>
      </div>
    </>
  );
}
