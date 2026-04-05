import { useState, useEffect, useRef, useCallback } from "react";
import { get } from "@/lib/api";
import { C, F, FS, card, btn2, TIPS, SC, PIPELINE_STAGES, CONTACT_TYPES, CONTACT_CATEGORIES } from "./constants";
import { Tip } from "./Tip";
import { SmsModal } from "./SmsModal";
import { ContactDrawer } from "./ContactDrawer";
import { AddContactModal } from "./AddContactModal";
import { HoverCard } from "./HoverCard";
import type { Contact, CallEntry } from "./types";

interface Props {
  contacts: Contact[];
  calls: CallEntry[];
  calSide: boolean;
  onAttempt: (contact: { id: string | number; name: string }) => void;
  onConnected: (contactName: string) => void;
  onSwitchToTasks: () => void;
  onBackToSchedule: () => void;
  onCompose?: (contact: Contact) => void;
  onConnectedCall?: (contact: { contactId: string; contactName: string; contactEmail?: string }) => void;
}

const STATUS_OPTIONS = ["All", "Hot", "Warm", "New", "Cold"] as const;

function isOverdue(date?: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

export function SalesView({ contacts: initialContacts, calls, calSide, onAttempt, onConnected, onSwitchToTasks, onBackToSchedule, onCompose, onConnectedCall }: Props) {
  const [smsContact, setSmsContact] = useState<Contact | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterStage, setFilterStage] = useState<string>("All");
  const [filterType, setFilterType] = useState<string>("All");
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Contact[]>(initialContacts);
  const [total, setTotal] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMoreResults, setNoMoreResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFilters = !!(search.trim() || filterStatus !== "All" || filterStage !== "All" || filterType !== "All" || filterCategory !== "All");

  useEffect(() => {
    if (!hasFilters) {
      setResults(initialContacts);
      setTotal(null);
    }
  }, [initialContacts, hasFilters]);

  const fetchContacts = useCallback(async (newOffset = 0) => {
    if (newOffset === 0) setSearching(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: String(newOffset) });
      if (search.trim()) params.set("search", search.trim());
      if (filterStatus !== "All") params.set("status", filterStatus);
      if (filterStage !== "All") params.set("stage", filterStage);
      if (filterType !== "All") params.set("type", filterType);
      if (filterCategory !== "All") params.set("category", filterCategory);
      const data = await get<{ contacts: Contact[]; total: number } | Contact[]>(`/contacts?${params}`);
      const list = Array.isArray(data) ? data : data.contacts;
      const tot = Array.isArray(data) ? list.length : data.total;
      if (newOffset === 0) {
        setResults(list);
        setOffset(list.length);
        setNoMoreResults(list.length < 50);
      } else {
        setResults(prev => [...prev, ...list]);
        setOffset(prev => prev + list.length);
        setNoMoreResults(list.length < 50);
      }
      setTotal(tot);
    } catch { /* keep existing */ }
    finally { setSearching(false); setLoadingMore(false); }
  }, [search, filterStatus, filterStage, filterType, filterCategory]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!hasFilters) { setOffset(0); setNoMoreResults(false); return; }
    debounceRef.current = setTimeout(() => fetchContacts(0), search.trim() ? 300 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, filterStatus, filterStage, filterType, filterCategory, fetchContacts, hasFilters]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    if (hasFilters) {
      await fetchContacts(offset);
    } else {
      try {
        const params = new URLSearchParams({ limit: "50", offset: String(offset) });
        const data = await get<{ contacts: Contact[]; total: number } | Contact[]>(`/contacts?${params}`);
        const list = Array.isArray(data) ? data : data.contacts;
        setResults(prev => [...prev, ...list]);
        setOffset(prev => prev + list.length);
        setNoMoreResults(list.length < 50);
        setTotal(Array.isArray(data) ? null : data.total);
      } catch { /* keep existing */ }
      finally { setLoadingMore(false); }
    }
  }, [offset, hasFilters, fetchContacts]);

  const handleContactUpdated = useCallback((updated: Contact) => {
    setResults(prev => prev.map(c => String(c.id) === String(updated.id) ? updated : c));
  }, []);

  const handleContactDeleted = useCallback((id: string) => {
    setResults(prev => prev.filter(c => String(c.id) !== id));
    setSelectedContactId(null);
  }, []);

  const handleContactCreated = useCallback((contact: Contact) => {
    setResults(prev => [contact, ...prev]);
  }, []);

  const overdue = results.filter(c => c.followUpDate && isOverdue(c.followUpDate)).length;

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
        onCompose={onCompose ? c => { onCompose(c); setSelectedContactId(null); } : undefined}
        contacts={results}
        onNavigate={id => setSelectedContactId(id)}
        filters={{ status: filterStatus, stage: filterStage, type: filterType, category: filterCategory, search }}
        onFiltersChange={partial => {
          if (partial.status !== undefined) setFilterStatus(partial.status);
          if (partial.stage !== undefined) setFilterStage(partial.stage);
          if (partial.type !== undefined) setFilterType(partial.type);
          if (partial.category !== undefined) setFilterCategory(partial.category);
          if (partial.search !== undefined) setSearch(partial.search);
        }}
      />
      <AddContactModal open={showAddContact} onClose={() => setShowAddContact(false)} onCreated={handleContactCreated} />

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 20px 40px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>

        {/* ── Header ── */}
        <div style={{ ...card, marginBottom: 12, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontFamily: FS, fontSize: 18, margin: 0, color: C.tx }}>Sales Mode</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.sub }}>Calls: {calls.length}</span>
              {overdue > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: C.red, background: C.redBg, padding: "2px 8px", borderRadius: 6 }}>{overdue} overdue</span>}
              <button
                onClick={() => setShowAddContact(true)}
                style={{ padding: "6px 14px", background: C.tx, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F }}
              >
                + Add
              </button>
            </div>
          </div>

          {/* ── Filters ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${filterStatus !== "All" ? C.red : C.brd}`, fontSize: 12, fontFamily: F, background: "#FAFAF8", color: filterStatus !== "All" ? C.red : C.sub, cursor: "pointer", outline: "none", fontWeight: filterStatus !== "All" ? 700 : 400 }}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === "All" ? "All Statuses" : s}</option>)}
            </select>
            <select
              value={filterStage}
              onChange={e => setFilterStage(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${filterStage !== "All" ? C.blu : C.brd}`, fontSize: 12, fontFamily: F, background: "#FAFAF8", color: filterStage !== "All" ? C.blu : C.sub, cursor: "pointer", outline: "none", fontWeight: filterStage !== "All" ? 700 : 400 }}
            >
              <option value="All">All Stages</option>
              {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${filterType !== "All" ? C.amb : C.brd}`, fontSize: 12, fontFamily: F, background: "#FAFAF8", color: filterType !== "All" ? C.amb : C.sub, cursor: "pointer", outline: "none", fontWeight: filterType !== "All" ? 700 : 400 }}
            >
              <option value="All">All Types</option>
              {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${filterCategory !== "All" ? "#7B1FA2" : C.brd}`, fontSize: 12, fontFamily: F, background: "#FAFAF8", color: filterCategory !== "All" ? "#7B1FA2" : C.sub, cursor: "pointer", outline: "none", fontWeight: filterCategory !== "All" ? 700 : 400 }}
            >
              <option value="All">All Categories</option>
              {CONTACT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {hasFilters && (
              <button
                onClick={() => { setFilterStatus("All"); setFilterStage("All"); setFilterType("All"); setFilterCategory("All"); setSearch(""); }}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.brd}`, background: "#FAFAF8", color: C.mut, fontSize: 12, cursor: "pointer", fontFamily: F }}
              >
                Clear
              </button>
            )}
          </div>

          {/* ── Search ── */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, company, phone…"
              style={{ width: "100%", border: `1px solid ${C.brd}`, borderRadius: 10, padding: "9px 36px 9px 12px", fontFamily: F, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FAFAF8" }}
            />
            {searching && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.mut }}>…</span>}
            {search && !searching && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut, padding: 2 }}>✕</button>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.mut, marginTop: 6 }}>
            {hasFilters
              ? `${results.length} result${results.length !== 1 ? "s" : ""}${total && total > results.length ? ` of ${total}` : ""}`
              : `${results.length} contacts · click any row to view details`}
          </div>
        </div>

        {/* ── Contact List ── */}
        {results.length === 0 && !searching && (
          <div style={{ ...card, textAlign: "center", padding: 32, color: C.mut, fontSize: 14 }}>
            No contacts match your filters.
          </div>
        )}
        {results.map(c => {
          const od = isOverdue(c.followUpDate);
          return (
            <div
              key={c.id}
              onClick={() => setSelectedContactId(String(c.id))}
              style={{ display: "flex", gap: 12, padding: 14, marginBottom: 6, background: "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${SC[c.status || "New"] || C.mut}`, alignItems: "center", cursor: "pointer", transition: "box-shadow 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: SC[c.status || "New"] || C.mut, background: c.status === "Hot" ? C.redBg : c.status === "Warm" ? C.ambBg : C.bluBg, padding: "2px 8px", borderRadius: 4 }}>{c.status || "New"}</span>
                  {c.pipelineStage && <span style={{ fontSize: 10, color: C.sub, background: "#F0EEE9", padding: "2px 6px", borderRadius: 4 }}>{c.pipelineStage}</span>}
                </div>
                {c.company && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{c.company}</div>}
                {c.nextStep && <div style={{ fontSize: 13, marginTop: 4, color: C.tx }}>→ {c.nextStep}</div>}
                <div style={{ fontSize: 11, color: C.mut, marginTop: 2, display: "flex", gap: 10 }}>
                  {c.followUpDate && <span style={{ color: od ? C.red : C.mut, fontWeight: od ? 700 : 400 }}>{od ? "⚠ OVERDUE " : "📅 "}{c.followUpDate}</span>}
                  {!c.followUpDate && c.lastContactDate && <span>Last: {c.lastContactDate}</span>}
                  {c.phone && <span>{c.phone}</span>}
                </div>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}
                onClick={e => e.stopPropagation()}
              >
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    onClick={() => onAttempt({ id: c.id, name: c.name })}
                    style={{ ...btn2, padding: "6px 10px", fontSize: 11, textDecoration: "none", display: "block", textAlign: "center" }}
                  >
                    📞 Call
                  </a>
                )}
                {c.phone && (
                  <button onClick={() => setSmsContact(c)} style={{ ...btn2, padding: "6px 10px", fontSize: 11, color: C.blu, borderColor: C.blu }}>
                    💬 Text
                  </button>
                )}
                {onCompose && (
                  <button onClick={() => onCompose(c)} style={{ ...btn2, padding: "6px 10px", fontSize: 11, color: C.blu, borderColor: C.blu }}>
                    ✉ Email
                  </button>
                )}
                <Tip tip={TIPS.attempt}>
                  <button onClick={() => onAttempt({ id: c.id, name: c.name })} style={{ ...btn2, padding: "6px 10px", fontSize: 11 }}>📋 Log Attempt</button>
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
                    style={{ ...btn2, padding: "6px 10px", fontSize: 11, color: C.grn, borderColor: C.grn }}
                  >
                    ✓ Connected
                  </button>
                </Tip>
              </div>
            </div>
          );
        })}

        {/* ── Load More ── */}
        {!noMoreResults && results.length >= 50 && (
          <div style={{ textAlign: "center", marginTop: 8, marginBottom: 4 }}>
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{ ...btn2, fontSize: 12, padding: "8px 24px", color: C.blu, borderColor: C.blu, opacity: loadingMore ? 0.6 : 1 }}
            >
              {loadingMore ? "Loading…" : `Load More (${total && total > results.length ? `${results.length} of ${total}` : results.length} shown)`}
            </button>
          </div>
        )}

        {/* ── Call Log ── */}
        {calls.length > 0 && (
          <div style={{ ...card, marginTop: 12, background: C.grnBg, padding: "14px 20px" }}>
            <h3 style={{ fontFamily: FS, fontSize: 15, margin: "0 0 8px", color: C.grn }}>Today's Calls ({calls.length})</h3>
            {calls.map((cl, i) => (
              <HoverCard key={i} rows={[
                { label: "Contact", value: cl.contactName },
                { label: "Type", value: cl.type === "connected" ? "Connected" : "Attempt", color: cl.type === "connected" ? C.grn : C.amb },
                ...(cl.notes ? [{ label: "Notes", value: cl.notes }] : []),
                ...(cl.createdAt ? [{ label: "Time", value: new Date(cl.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) }] : []),
              ]}>
              <div style={{ fontSize: 13, padding: "3px 0", color: C.grn, display: "flex", gap: 8, cursor: "default" }}>
                <span>{cl.type === "connected" ? "✓" : "📞"}</span>
                <span style={{ fontWeight: 600 }}>{cl.contactName}</span>
                <span style={{ color: C.sub }}>— {cl.type}</span>
                {cl.createdAt && <span style={{ color: C.mut, marginLeft: "auto" }}>{new Date(cl.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
              </div>
              </HoverCard>
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onSwitchToTasks} style={{ ...btn2, flex: 1 }}>✅ Switch to Tasks</button>
          <button onClick={onBackToSchedule} style={{ ...btn2, flex: 1, color: C.mut }}>← Schedule</button>
        </div>
      </div>
    </>
  );
}
