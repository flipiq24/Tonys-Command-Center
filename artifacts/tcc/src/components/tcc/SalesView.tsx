import { useState, useEffect, useRef } from "react";
import { get } from "@/lib/api";
import { C, F, FS, card, btn2, TIPS, SC } from "./constants";
import { Tip } from "./Tip";
import { SmsModal } from "./SmsModal";
import type { Contact, CallEntry } from "./types";

interface Props {
  contacts: Contact[];
  calls: CallEntry[];
  demos: number;
  calSide: boolean;
  apiBase: string;
  onAttempt: (contact: { id: string | number; name: string }) => void;
  onConnected: (contactName: string) => void;
  onDemoChange: (delta: number) => void;
  onSwitchToTasks: () => void;
  onBackToSchedule: () => void;
}

export function SalesView({ contacts: initialContacts, calls, demos, calSide, apiBase, onAttempt, onConnected, onDemoChange, onSwitchToTasks, onBackToSchedule }: Props) {
  const [smsContact, setSmsContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Contact[]>(initialContacts);
  const [total, setTotal] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update results when initial contacts change (first load)
  useEffect(() => { if (!search) setResults(initialContacts); }, [initialContacts, search]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) {
      setResults(initialContacts);
      setTotal(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await get<{ contacts: Contact[]; total: number } | Contact[]>(`/contacts?search=${encodeURIComponent(search)}&limit=100`);
        const list = Array.isArray(data) ? data : data.contacts;
        const tot = Array.isArray(data) ? list.length : data.total;
        setResults(list);
        setTotal(tot);
      } catch { /* keep existing */ }
      finally { setSearching(false); }
    }, 300);
  }, [search, initialContacts]);

  const displayedContacts = results;

  return (
    <>
    {smsContact && <SmsModal contact={smsContact} apiBase={apiBase} onClose={() => setSmsContact(null)} />}
    <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 20px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Sales Mode</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
            <span>Calls: {calls.length}</span>
            {demos > 0 && <span style={{ color: C.blu }}>Demos: {demos}</span>}
            <div style={{ display: "flex", gap: 4 }}>
              {demos > 0 && <button onClick={() => onDemoChange(-1)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.brd}`, background: C.card, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>−</button>}
              <button onClick={() => onDemoChange(1)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.grn}`, background: C.grnBg, cursor: "pointer", fontSize: 14, fontWeight: 700, color: C.grn }}>+</button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts by name, company, phone, email…"
            style={{ width: "100%", border: `1px solid ${C.brd}`, borderRadius: 10, padding: "9px 36px 9px 12px", fontFamily: F, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FAFAF8" }}
          />
          {searching && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.mut }}>…</span>}
          {search && !searching && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut, padding: 2 }}>✕</button>}
        </div>

        {/* Result count */}
        <div style={{ fontSize: 11, color: C.mut, marginBottom: 8 }}>
          {search.trim()
            ? `${displayedContacts.length} result${displayedContacts.length !== 1 ? "s" : ""}${total && total > displayedContacts.length ? ` of ${total}` : ""}`
            : `Showing ${displayedContacts.length} contacts (Hot → Warm → New)`}
        </div>

        {displayedContacts.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 12, padding: 14, marginBottom: 6, background: "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${SC[c.status || "New"] || C.mut}`, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: SC[c.status || "New"] || C.mut, background: c.status === "Hot" ? C.redBg : c.status === "Warm" ? C.ambBg : C.bluBg, padding: "2px 8px", borderRadius: 4 }}>{c.status}</span>
              </div>
              {c.company && <div style={{ fontSize: 12, color: C.sub }}>{c.company}</div>}
              <div style={{ fontSize: 13, marginTop: 4 }}>→ {c.nextStep}</div>
              <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>Last: {c.lastContactDate} · {c.phone}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
              {/* Native call — opens dialer only (use Attempt button for logging) */}
              {c.phone && (
                <a
                  href={`tel:${c.phone}`}
                  style={{ ...btn2, padding: "7px 12px", fontSize: 11, textDecoration: "none", display: "block", textAlign: "center" }}
                >
                  📞 Call
                </a>
              )}
              {/* SMS compose modal → MacroDroid → phone sends SMS */}
              {c.phone && (
                <button onClick={() => setSmsContact(c)} style={{ ...btn2, padding: "7px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}>
                  💬 Text
                </button>
              )}
              <Tip tip={TIPS.attempt}>
                <button onClick={() => onAttempt({ id: c.id, name: c.name })} style={{ ...btn2, padding: "7px 12px", fontSize: 11 }}>📋 Attempt</button>
              </Tip>
              <Tip tip={TIPS.connected}>
                <button onClick={() => onConnected(c.name)} style={{ ...btn2, padding: "7px 12px", fontSize: 11, color: C.grn, borderColor: C.grn }}>✓ Connected</button>
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
