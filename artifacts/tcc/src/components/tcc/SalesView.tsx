import { useState, useEffect, useRef, useCallback } from "react";
import { get } from "@/lib/api";
import { C, F, FS, card, btn2, TIPS, SC, PC, PCBg, PIPELINE_STAGES, CONTACT_TYPES, CONTACT_CATEGORIES } from "./constants";
import { Tip } from "./Tip";
import { SmsModal } from "./SmsModal";
import { ContactDrawer } from "./ContactDrawer";
import { AddContactModal } from "./AddContactModal";
import { TimeRoutingBanner } from "./TimeRoutingBanner";
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
  onCompose?: (contact: Contact) => void;
  onConnectedCall?: (contact: Contact) => void;
}

type ViewMode = "list" | "pipeline";
const STATUS_TABS = ["All", "Hot", "Warm", "New", "Cold"] as const;

function statusBadge(status?: string) {
  const s = status || "New";
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: s === "Hot" ? C.redBg : s === "Warm" ? C.ambBg : s === "Cold" ? "#F5F5F5" : C.bluBg, color: SC[s] || C.mut }}>
      {s}
    </span>
  );
}

function stageBadge(stage?: string) {
  if (!stage) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: PCBg[stage] || "#F5F5F5", color: PC[stage] || C.mut }}>
      {stage}
    </span>
  );
}

function isOverdue(date?: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

interface ContactCardProps {
  c: Contact;
  onClick: () => void;
  onAttempt: (c: { id: string | number; name: string }) => void;
  onSms: (c: Contact) => void;
  onConnected: (name: string) => void;
  onCompose?: (c: Contact) => void;
  onConnectedCall?: (c: Contact) => void;
}

function ContactCard({ c, onClick, onAttempt, onSms, onConnected, onCompose, onConnectedCall }: ContactCardProps) {
  const overdue = isOverdue(c.followUpDate);

  return (
    <div
      onClick={onClick}
      style={{ display: "flex", gap: 12, padding: "14px 16px", marginBottom: 6, background: "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${SC[c.status || "New"] || C.mut}`, alignItems: "flex-start", cursor: "pointer", transition: "box-shadow 0.15s", position: "relative" }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{c.name}</span>
          {statusBadge(c.status)}
          {stageBadge(c.pipelineStage)}
        </div>
        {(c.company || c.title) && (
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
            {c.company}{c.company && c.title ? " · " : ""}{c.title}
          </div>
        )}
        {c.nextStep && <div style={{ fontSize: 12, color: C.tx, marginTop: 4 }}>→ {c.nextStep}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
          {c.dealValue && <span style={{ fontSize: 11, fontWeight: 700, color: C.grn }}>💰 ${Number(c.dealValue).toLocaleString()}{c.dealProbability ? ` · ${c.dealProbability}%` : ""}</span>}
          {c.followUpDate && <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? C.red : C.mut }}>📅 {overdue ? "OVERDUE " : ""}{c.followUpDate}</span>}
          {c.lastContactDate && !c.followUpDate && <span style={{ fontSize: 11, color: C.mut }}>Last: {c.lastContactDate}</span>}
          {c.phone && <span style={{ fontSize: 11, color: C.mut }}>{c.phone}</span>}
        </div>
        {c.tags && c.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
            {c.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: C.bluBg, color: C.blu, fontWeight: 600 }}>{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {c.phone && (
          <a
            href={`tel:${c.phone}`}
            onClick={e => { e.stopPropagation(); onAttempt({ id: c.id, name: c.name }); }}
            style={{ ...btn2, padding: "6px 10px", fontSize: 11, textDecoration: "none", display: "block", textAlign: "center" }}
          >
            📞 Call
          </a>
        )}
        {c.phone && (
          <button onClick={e => { e.stopPropagation(); onSms(c); }} style={{ ...btn2, padding: "6px 10px", fontSize: 11, color: C.blu, borderColor: C.blu }}>
            💬 Text
          </button>
        )}
        {onCompose && (
          <button onClick={e => { e.stopPropagation(); onCompose(c); }} style={{ ...btn2, padding: "6px 10px", fontSize: 11, color: C.blu, borderColor: C.blu }}>
            ✉ Email
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); onAttempt({ id: c.id, name: c.name }); }} style={{ ...btn2, padding: "6px 10px", fontSize: 11 }}>
          📋 Log
        </button>
        <button
          onClick={e => {
            e.stopPropagation();
            if (onConnectedCall && c.id) {
              onConnectedCall(c);
            } else {
              onConnected(c.name);
            }
          }}
          style={{ ...btn2, padding: "6px 10px", fontSize: 11, color: C.grn, borderColor: C.grn }}
        >
          ✓ Done
        </button>
      </div>
    </div>
  );
}

interface KanbanCardProps {
  c: Contact;
  onClick: () => void;
}

function KanbanCard({ c, onClick }: KanbanCardProps) {
  return (
    <div
      onClick={onClick}
      style={{ padding: "10px 12px", marginBottom: 6, background: "#FFF", borderRadius: 10, border: `1px solid ${C.brd}`, cursor: "pointer", borderLeft: `3px solid ${SC[c.status || "New"] || C.mut}` }}
      onMouseEnter={e => (e.currentTarget.style.background = "#F7F6F3")}
      onMouseLeave={e => (e.currentTarget.style.background = "#FFF")}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, lineHeight: 1.3 }}>{c.name}</div>
      {c.company && <div style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>{c.company}</div>}
      {c.dealValue && <div style={{ fontSize: 11, fontWeight: 700, color: C.grn, marginTop: 4 }}>${Number(c.dealValue).toLocaleString()}{c.dealProbability ? ` · ${c.dealProbability}%` : ""}</div>}
      {c.followUpDate && <div style={{ fontSize: 10, color: isOverdue(c.followUpDate) ? C.red : C.mut, marginTop: 2 }}>📅 {c.followUpDate}</div>}
      <div style={{ marginTop: 4 }}>{statusBadge(c.status)}</div>
    </div>
  );
}

export function SalesView({ contacts: initialContacts, calls, demos, calSide, apiBase, onAttempt, onConnected, onDemoChange, onSwitchToTasks, onBackToSchedule, onCompose, onConnectedCall }: Props) {
  const [smsContact, setSmsContact] = useState<Contact | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterStage, setFilterStage] = useState<string>("All");
  const [filterType, setFilterType] = useState<string>("All");
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Contact[]>(initialContacts);
  const [total, setTotal] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [localContacts, setLocalContacts] = useState<Contact[]>(initialContacts);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!search && filterStatus === "All" && filterStage === "All" && filterType === "All" && filterCategory === "All") {
      setResults(initialContacts);
      setLocalContacts(initialContacts);
    }
  }, [initialContacts, search, filterStatus, filterStage, filterType, filterCategory]);

  const fetchContacts = useCallback(async () => {
    setSearching(true);
    try {
      const limit = viewMode === "pipeline" ? 200 : 100;
      const params = new URLSearchParams({ limit: String(limit) });
      if (search.trim()) params.set("search", search.trim());
      if (filterStatus !== "All") params.set("status", filterStatus);
      if (filterStage !== "All") params.set("stage", filterStage);
      if (filterType !== "All") params.set("type", filterType);
      if (filterCategory !== "All") params.set("category", filterCategory);
      const data = await get<{ contacts: Contact[]; total: number } | Contact[]>(`/contacts?${params}`);
      const list = Array.isArray(data) ? data : data.contacts;
      const tot = Array.isArray(data) ? list.length : data.total;
      setResults(list);
      setLocalContacts(prev => {
        const map = new Map(prev.map(c => [String(c.id), c]));
        for (const c of list) map.set(String(c.id), c);
        return [...map.values()];
      });
      setTotal(tot);
    } catch { /* keep existing */ }
    finally { setSearching(false); }
  }, [search, filterStatus, filterStage, filterType, filterCategory, viewMode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const noFilters = !search.trim() && filterStatus === "All" && filterStage === "All" && filterType === "All" && filterCategory === "All";
    if (noFilters && viewMode === "list") {
      setResults(initialContacts);
      setTotal(null);
      return () => {};
    }
    const timeout = search.trim() ? 300 : 0;
    debounceRef.current = setTimeout(fetchContacts, timeout);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, filterStatus, filterStage, filterType, filterCategory, viewMode, fetchContacts, initialContacts]);

  const handleContactUpdated = useCallback((updated: Contact) => {
    setLocalContacts(prev => prev.map(c => String(c.id) === String(updated.id) ? updated : c));
    setResults(prev => prev.map(c => String(c.id) === String(updated.id) ? updated : c));
  }, []);

  const handleContactDeleted = useCallback((id: string) => {
    setLocalContacts(prev => prev.filter(c => String(c.id) !== id));
    setResults(prev => prev.filter(c => String(c.id) !== id));
    setSelectedContactId(null);
  }, []);

  const handleContactCreated = useCallback((contact: Contact) => {
    setLocalContacts(prev => [contact, ...prev]);
    setResults(prev => [contact, ...prev]);
  }, []);

  const displayedContacts = results;

  const kanbanByStage = PIPELINE_STAGES.reduce<Record<string, Contact[]>>((acc, stage) => {
    acc[stage] = results.filter(c => c.pipelineStage === stage || (!c.pipelineStage && stage === "Lead"));
    return acc;
  }, {} as Record<string, Contact[]>);

  const stageDealTotal = (stage: string) => {
    return (kanbanByStage[stage] || []).reduce((sum, c) => sum + (c.dealValue ? Number(c.dealValue) : 0), 0);
  };

  return (
    <>
      {smsContact && <SmsModal contact={smsContact} onClose={() => setSmsContact(null)} />}
      <ContactDrawer
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onUpdated={handleContactUpdated}
        onDeleted={handleContactDeleted}
        onAttempt={c => { onAttempt(c); setSelectedContactId(null); }}
        onConnected={name => { onConnected(name); setSelectedContactId(null); }}
        onSmsOpen={c => { setSmsContact(c); setSelectedContactId(null); }}
      />
      <AddContactModal open={showAddContact} onClose={() => setShowAddContact(false)} onCreated={handleContactCreated} />

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 20px 40px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>
        <TimeRoutingBanner />

        <div style={{ ...card, marginBottom: 12, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontFamily: FS, fontSize: 18, margin: 0, color: C.tx }}>CRM</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.sub }}>
                Calls: {calls.length}
                {demos > 0 && <span style={{ color: C.blu, marginLeft: 10 }}>Demos: {demos}</span>}
              </div>
              {demos > 0 && <button onClick={() => onDemoChange(-1)} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${C.brd}`, background: C.card, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>−</button>}
              <button onClick={() => onDemoChange(1)} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${C.grn}`, background: C.grnBg, cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.grn }}>+</button>
              <div style={{ display: "flex", background: "#F0EEE9", borderRadius: 8, padding: 2, gap: 2 }}>
                {(["list", "pipeline"] as const).map(m => (
                  <button key={m} onClick={() => setViewMode(m)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: viewMode === m ? "#FFF" : "none", color: viewMode === m ? C.tx : C.mut, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F, boxShadow: viewMode === m ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                    {m === "list" ? "≡ List" : "⬜ Pipeline"}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddContact(true)} style={{ padding: "6px 14px", background: C.tx, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                + Add
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {STATUS_TABS.map(tab => (
                <button key={tab} onClick={() => setFilterStatus(tab)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${filterStatus === tab ? SC[tab] || C.tx : C.brd}`, background: filterStatus === tab ? (tab === "All" ? C.tx : tab === "Hot" ? C.redBg : tab === "Warm" ? C.ambBg : tab === "Cold" ? "#F5F5F5" : C.bluBg) : "#FAFAF8", color: filterStatus === tab ? (tab === "All" ? "#FFF" : SC[tab] || C.tx) : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                  {tab}
                </button>
              ))}
            </div>
            <select
              value={filterStage}
              onChange={e => setFilterStage(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${filterStage !== "All" ? C.blu : C.brd}`, fontSize: 12, fontFamily: F, background: "#FAFAF8", color: filterStage !== "All" ? C.blu : C.sub, cursor: "pointer", outline: "none", fontWeight: filterStage !== "All" ? 700 : 400 }}
            >
              <option value="All">All Stages</option>
              {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${filterType !== "All" ? C.amb : C.brd}`, fontSize: 12, fontFamily: F, background: "#FAFAF8", color: filterType !== "All" ? C.amb : C.sub, cursor: "pointer", outline: "none", fontWeight: filterType !== "All" ? 700 : 400 }}
            >
              <option value="All">All Types</option>
              {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${filterCategory !== "All" ? "#7B1FA2" : C.brd}`, fontSize: 12, fontFamily: F, background: "#FAFAF8", color: filterCategory !== "All" ? "#7B1FA2" : C.sub, cursor: "pointer", outline: "none", fontWeight: filterCategory !== "All" ? 700 : 400 }}
            >
              <option value="All">All Categories</option>
              {CONTACT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, company, phone, email…"
              style={{ width: "100%", border: `1px solid ${C.brd}`, borderRadius: 10, padding: "9px 36px 9px 12px", fontFamily: F, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FAFAF8" }}
            />
            {searching && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.mut }}>…</span>}
            {search && !searching && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut, padding: 2 }}>✕</button>}
          </div>

          <div style={{ fontSize: 11, color: C.mut, marginTop: 8 }}>
            {search.trim() || filterStatus !== "All" || filterStage !== "All" || filterType !== "All" || filterCategory !== "All"
              ? `${displayedContacts.length} result${displayedContacts.length !== 1 ? "s" : ""}${total && total > displayedContacts.length ? ` of ${total}` : ""}`
              : `${displayedContacts.length} contacts · Hot → Warm → New`}
          </div>
        </div>

        {viewMode === "list" && (
          <div>
            {displayedContacts.length === 0 && !searching && (
              <div style={{ ...card, textAlign: "center", padding: 32, color: C.mut, fontSize: 14 }}>
                No contacts match your filters.
              </div>
            )}
            {displayedContacts.map(c => (
              <ContactCard
                key={c.id}
                c={c}
                onClick={() => setSelectedContactId(String(c.id))}
                onAttempt={onAttempt}
                onSms={setSmsContact}
                onConnected={onConnected}
                onCompose={onCompose}
                onConnectedCall={onConnectedCall}
              />
            ))}
          </div>
        )}

        {viewMode === "pipeline" && (
          <div style={{ overflowX: "auto", paddingBottom: 8 }}>
            <div style={{ display: "flex", gap: 10, minWidth: PIPELINE_STAGES.length * 220 }}>
              {PIPELINE_STAGES.map(stage => {
                const stageContacts = kanbanByStage[stage] || [];
                const dealTotal = stageDealTotal(stage);
                return (
                  <div key={stage} style={{ width: 210, flexShrink: 0 }}>
                    <div style={{ padding: "8px 10px", borderRadius: 10, background: PCBg[stage] || "#F5F5F5", marginBottom: 8, borderTop: `3px solid ${PC[stage] || C.mut}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: PC[stage] || C.tx }}>{stage}</div>
                      <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                        {stageContacts.length} contact{stageContacts.length !== 1 ? "s" : ""}
                        {dealTotal > 0 && <span style={{ color: C.grn, marginLeft: 6 }}>${dealTotal.toLocaleString()}</span>}
                      </div>
                    </div>
                    <div style={{ maxHeight: 600, overflowY: "auto" }}>
                      {stageContacts.map(c => (
                        <KanbanCard key={c.id} c={c} onClick={() => setSelectedContactId(String(c.id))} />
                      ))}
                      {stageContacts.length === 0 && (
                        <div style={{ fontSize: 12, color: C.mut, textAlign: "center", padding: "16px 0" }}>Empty</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {calls.length > 0 && (
          <div style={{ ...card, marginTop: 12, background: C.grnBg, padding: "14px 20px" }}>
            <h3 style={{ fontFamily: FS, fontSize: 15, margin: "0 0 8px", color: C.grn }}>Today's Calls ({calls.length})</h3>
            {calls.map((cl, i) => (
              <div key={i} style={{ fontSize: 13, padding: "3px 0", color: C.grn, display: "flex", gap: 8 }}>
                <span>{cl.type === "connected" ? "✓" : "📞"}</span>
                <span style={{ fontWeight: 600 }}>{cl.contactName}</span>
                <span style={{ color: C.sub }}>— {cl.type}</span>
                {cl.createdAt && <span style={{ color: C.mut, marginLeft: "auto" }}>{new Date(cl.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Tip tip={TIPS.connected}>
            <button onClick={onSwitchToTasks} style={{ ...btn2, flex: 1 }}>✅ Switch to Tasks</button>
          </Tip>
          <button onClick={onBackToSchedule} style={{ ...btn2, flex: 1, color: C.mut }}>← Schedule</button>
        </div>
      </div>
    </>
  );
}
