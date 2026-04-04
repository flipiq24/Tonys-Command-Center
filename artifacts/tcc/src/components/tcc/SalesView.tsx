import { useState } from "react";
import { C, F, FS, card, btn2, TIPS, SC } from "./constants";
import { Tip } from "./Tip";
import { SmsModal } from "./SmsModal";
import type { Contact, CallEntry } from "./types";

interface Props {
  contacts: Contact[];
  calls: CallEntry[];
  demos: number;
  calSide: boolean;
  onAttempt: (contact: { id: string | number; name: string }) => void;
  onConnected: (contactName: string) => void;
  onDemoChange: (delta: number) => void;
  onSwitchToTasks: () => void;
  onBackToSchedule: () => void;
  onCompose?: (contact: Contact) => void;
  onConnectedCall?: (contact: { contactId: string; contactName: string; contactEmail?: string }) => void;
}

export function SalesView({ contacts, calls, demos, calSide, onAttempt, onConnected, onDemoChange, onSwitchToTasks, onBackToSchedule, onCompose, onConnectedCall }: Props) {
  const [smsContact, setSmsContact] = useState<Contact | null>(null);
  return (
    <>
      {smsContact && <SmsModal contact={smsContact} onClose={() => setSmsContact(null)} />}
      <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 20px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Sales Mode</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
              <span>Calls: {calls.length}</span>
              <span style={{ color: C.blu }}>Demos: {demos}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => onDemoChange(-1)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.brd}`, background: C.card, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>−</button>
                <button onClick={() => onDemoChange(1)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.grn}`, background: C.grnBg, cursor: "pointer", fontSize: 14, fontWeight: 700, color: C.grn }}>+</button>
              </div>
            </div>
          </div>
          {contacts.map(c => (
            <div key={c.id} style={{ display: "flex", gap: 12, padding: 14, marginBottom: 6, background: "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${SC[c.status || "New"] || C.mut}`, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: SC[c.status || "New"] || C.mut, background: c.status === "Hot" ? C.redBg : c.status === "Warm" ? C.ambBg : C.bluBg, padding: "2px 8px", borderRadius: 4 }}>{c.status || "New"}</span>
                </div>
                {c.company && <div style={{ fontSize: 12, color: C.sub }}>{c.company}</div>}
                <div style={{ fontSize: 13, marginTop: 4 }}>→ {c.nextStep}</div>
                <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>Last: {c.lastContactDate} · {c.phone}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    onClick={() => onAttempt({ id: c.id, name: c.name })}
                    style={{ ...btn2, padding: "7px 12px", fontSize: 11, textDecoration: "none", display: "block", textAlign: "center" }}
                  >
                    📞 Call
                  </a>
                )}
                {c.phone && (
                  <button onClick={() => setSmsContact(c)} style={{ ...btn2, padding: "7px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}>
                    💬 Text
                  </button>
                )}
                {onCompose && (
                  <button onClick={() => onCompose(c)} style={{ ...btn2, padding: "7px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}>
                    ✉ Email
                  </button>
                )}
                <Tip tip={TIPS.attempt}>
                  <button onClick={() => onAttempt({ id: c.id, name: c.name })} style={{ ...btn2, padding: "7px 12px", fontSize: 11 }}>📋 Log Attempt</button>
                </Tip>
                <Tip tip={TIPS.connected}>
                  <button
                    onClick={() => {
                      if (onConnectedCall) {
                        onConnectedCall({ contactId: String(c.id), contactName: c.name, contactEmail: c.email });
                      } else {
                        onConnected(c.name);
                      }
                    }}
                    style={{ ...btn2, padding: "7px 12px", fontSize: 11, color: C.grn, borderColor: C.grn }}
                  >
                    ✓ Connected
                  </button>
                </Tip>
              </div>
            </div>
          ))}
        </div>
        {calls.length > 0 && (
          <div style={{ ...card, marginBottom: 16, background: C.grnBg }}>
            <h3 style={{ fontFamily: FS, fontSize: 17, margin: "0 0 10px" }}>Call Log ({calls.length})</h3>
            {calls.map((cl, i) => (
              <div key={i} style={{ fontSize: 13, padding: "3px 0", color: C.grn }}>
                ✓ {cl.contactName} — {cl.type} {cl.createdAt ? new Date(cl.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}
              </div>
            ))}
          </div>
        )}
        <button onClick={onSwitchToTasks} style={{ ...btn2, width: "100%", marginBottom: 10 }}>✅ Switch to Tasks</button>
        <button onClick={onBackToSchedule} style={{ ...btn2, width: "100%", marginBottom: 40, color: C.mut }}>← Schedule</button>
      </div>
    </>
  );
}
