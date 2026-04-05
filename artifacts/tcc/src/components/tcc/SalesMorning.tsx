import { useState, useEffect, useCallback } from "react";
import { get, post, patch } from "@/lib/api";
import { C, F, FS, card, btn1, btn2 } from "./constants";
import type { Contact } from "./types";

interface MorningContact extends Contact {
  aiScore?: string | number | null;
  aiScoreReason?: string | null;
  stage?: string;
  nextAction?: string | null;
  nextActionDate?: string | null;
  lastComm?: { channel?: string; summary?: string; loggedAt?: string; date?: any; type?: string } | null;
  briefLine?: string | null;
}

interface MorningData {
  urgentResponses: MorningContact[];
  followUps: MorningContact[];
  top10New: MorningContact[];
  pipelineSummary: {
    byStage: Record<string, number>;
    byStatus: Record<string, number>;
    overdue: number;
  };
}

interface BriefModalData {
  contactId: string;
  contactName: string;
  briefText: string;
  aiScore?: string | number | null;
  stage?: string;
  status?: string;
  linkedinUrl?: string | null;
  personalityNotes?: string | null;
  openTasks?: string[];
  recentComms?: { channel: string; summary: string; date: any }[];
}

interface Props {
  calls: { contactName: string; type: string }[];
  onAttempt: (c: { id: string | number; name: string }) => void;
  onConnectedCall: (c: { contactId: string; contactName: string; contactEmail?: string }) => void;
  onCompose: (c: Contact) => void;
  onOpenChat: (contextType: string, contextId: string, contextLabel: string) => void;
  onSwitchToTasks: () => void;
  onBackToSchedule: () => void;
  onSwitchToFullSales?: () => void;
}

const VALID_STAGES = ["new", "outreach", "engaged", "meeting_scheduled", "negotiating", "closed", "dormant"] as const;
const STATUS_OPTIONS = ["Hot", "Warm", "New", "Cold"] as const;
const statusColors: Record<string, string> = { Hot: C.red, Warm: C.amb, New: C.blu, Cold: C.mut };
const stageColors: Record<string, string> = {
  new: C.mut, outreach: C.blu, engaged: "#7B1FA2", meeting_scheduled: C.amb,
  negotiating: "#E65100", closed: C.grn, dormant: "#9E9E9E",
};

function ScoreBadge({ score }: { score: string | number | null | undefined }) {
  if (!score) return null;
  const n = Number(score);
  const color = n >= 70 ? C.grn : n >= 40 ? C.amb : C.mut;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: color + "20", border: `1px solid ${color}44`, borderRadius: 4, padding: "1px 5px" }}>
      {Math.round(n)}
    </span>
  );
}

function CommTag({ channel }: { channel?: string }) {
  if (!channel) return null;
  const labels: Record<string, string> = {
    email_received: "📨 Email", email_sent: "📤 Email", call_inbound: "📞 Inbound", call_outbound: "📞 Outbound",
    text_received: "💬 Text", text_sent: "💬 Text", meeting: "🤝 Meeting",
  };
  return <span style={{ fontSize: 10, color: C.mut, background: C.brd + "88", borderRadius: 3, padding: "1px 4px" }}>{labels[channel] || channel}</span>;
}

export function SalesMorning({ calls, onAttempt, onConnectedCall, onCompose, onOpenChat, onSwitchToTasks, onBackToSchedule, onSwitchToFullSales }: Props) {
  const [data, setData] = useState<MorningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scoring, setScoring] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchConfirm, setResearchConfirm] = useState<{ contactIds: string[]; count: number; estimatedCost: string } | null>(null);
  const [briefModal, setBriefModal] = useState<BriefModalData | null>(null);
  const [briefLoading, setBriefLoading] = useState<string | null>(null);
  const [stageUpdates, setStageUpdates] = useState<Record<string, string>>({});
  const [statusUpdates, setStatusUpdates] = useState<Record<string, string>>({});
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    loadMorningData();
  }, []);

  async function loadMorningData() {
    setLoading(true);
    try {
      const d = await get<MorningData>("/sales/morning");
      setData(d);
    } catch (err) {
      console.warn("[SalesMorning] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  async function handleBatchScore() {
    if (selectedIds.size === 0) return;
    setScoring(true);
    try {
      await post("/contacts/score", { contactIds: Array.from(selectedIds) });
      await loadMorningData();
      setSelectedIds(new Set());
    } catch (err) {
      console.error("[score] Error:", err);
    } finally {
      setScoring(false);
    }
  }

  async function checkResearchCost() {
    if (selectedIds.size === 0) return;
    try {
      const check = await post<{ staleCount: number; estimatedCost: string; message: string }>("/contacts/research/check", { contactIds: Array.from(selectedIds) });
      setResearchConfirm({ contactIds: Array.from(selectedIds), count: selectedIds.size, estimatedCost: check.estimatedCost });
    } catch { setResearchConfirm({ contactIds: Array.from(selectedIds), count: selectedIds.size, estimatedCost: "~$0.15/contact" }); }
  }

  async function handleConfirmResearch() {
    if (!researchConfirm) return;
    setResearchConfirm(null);
    setResearching(true);
    try {
      await post("/contacts/research", { contactIds: researchConfirm.contactIds });
      await loadMorningData();
      setSelectedIds(new Set());
    } catch (err) {
      console.error("[research] Error:", err);
    } finally {
      setResearching(false);
    }
  }

  async function handleGetBrief(contact: MorningContact) {
    setBriefLoading(String(contact.id));
    try {
      const brief = await post<BriefModalData>("/contacts/brief", { contactId: contact.id });
      setBriefModal(brief);
    } catch { alert("Failed to generate brief"); }
    finally { setBriefLoading(null); }
  }

  async function handleStageChange(contactId: string, stage: string) {
    setStageUpdates(prev => ({ ...prev, [contactId]: stage }));
    try { await patch(`/contacts/${contactId}`, { pipelineStage: stage }); }
    catch { console.warn("[stage] Update failed"); }
  }

  async function handleStatusChange(contactId: string, status: string) {
    setStatusUpdates(prev => ({ ...prev, [contactId]: status }));
    try { await patch(`/contacts/${contactId}`, { status }); }
    catch { console.warn("[status] Update failed"); }
  }

  const filterContact = useCallback((c: MorningContact) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (c.name || "").toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q);
  }, [searchFilter]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: C.mut, fontFamily: F }}>Loading sales morning data...</div>;
  }

  const d = data;

  const allUrgent = (d?.urgentResponses || []).filter(filterContact);
  const allFollowUps = (d?.followUps || []).filter(filterContact);
  const allTop10 = (d?.top10New || []).filter(filterContact);

  function ContactCard({ contact, tier }: { contact: MorningContact; tier: string }) {
    const id = String(contact.id);
    const checked = selectedIds.has(id);
    const currentStage = stageUpdates[id] || contact.stage || "new";
    const currentStatus = statusUpdates[id] || contact.status || "New";

    return (
      <div style={{
        background: C.card, borderRadius: 10, padding: "12px 14px",
        border: `1px solid ${checked ? C.blu : C.brd}`,
        transition: "border-color 0.15s",
        marginBottom: 6,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input type="checkbox" checked={checked} onChange={() => toggleSelect(id)} style={{ marginTop: 4, cursor: "pointer" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{contact.name}</span>
              {contact.company && <span style={{ fontSize: 12, color: C.mut }}>{contact.company}</span>}
              <ScoreBadge score={contact.aiScore} />
              <span style={{ fontSize: 10, color: statusColors[currentStatus] || C.mut, fontWeight: 700, textTransform: "uppercase" }}>{currentStatus}</span>
              <span style={{ fontSize: 10, color: stageColors[currentStage] || C.mut, background: (stageColors[currentStage] || C.mut) + "15", borderRadius: 3, padding: "1px 5px" }}>{currentStage}</span>
              {contact.lastComm && <CommTag channel={contact.lastComm.channel} />}
            </div>

            {contact.briefLine && (
              <div style={{ fontSize: 11, color: C.sub, marginTop: 2, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {contact.briefLine}
              </div>
            )}

            {contact.lastComm?.summary && (
              <div style={{ fontSize: 12, color: C.sub, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {contact.lastComm.summary.substring(0, 80)}
              </div>
            )}

            {(tier === "followup" || tier === "top10") && contact.nextAction && (
              <div style={{ fontSize: 12, color: C.blu, marginTop: 3 }}>
                → {contact.nextAction}{contact.nextActionDate ? ` (${contact.nextActionDate})` : ""}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={currentStage}
                onChange={e => handleStageChange(id, e.target.value)}
                style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: `1px solid ${C.brd}`, background: C.card, cursor: "pointer" }}
              >
                {VALID_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={currentStatus}
                onChange={e => handleStatusChange(id, e.target.value)}
                style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: `1px solid ${C.brd}`, background: C.card, cursor: "pointer" }}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <button onClick={() => onAttempt({ id, name: contact.name })} style={{ ...btn2, fontSize: 11, padding: "3px 8px" }}>
                📵 Attempt
              </button>
              <button onClick={() => onConnectedCall({ contactId: id, contactName: contact.name, contactEmail: contact.email || undefined })} style={{ ...btn2, fontSize: 11, padding: "3px 8px" }}>
                ✓ Connected
              </button>
              {contact.email && (
                <button onClick={() => onCompose(contact as Contact)} style={{ ...btn2, fontSize: 11, padding: "3px 8px" }}>
                  ✉ Email
                </button>
              )}
              <button
                onClick={() => handleGetBrief(contact)}
                disabled={briefLoading === id}
                style={{ ...btn2, fontSize: 11, padding: "3px 8px", opacity: briefLoading === id ? 0.6 : 1 }}
              >
                {briefLoading === id ? "..." : "📋 Brief"}
              </button>
              <button onClick={() => onOpenChat("contact", id, contact.name)} style={{ ...btn2, fontSize: 11, padding: "3px 8px" }}>
                💬 Chat
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const summary = d?.pipelineSummary;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 20px" }}>

        {/* Pipeline Summary */}
        {summary && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.entries(summary.byStatus || {}).map(([status, count]) => (
              <div key={status} style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
                <span style={{ color: statusColors[status] || C.mut, fontWeight: 700 }}>{status}</span>
                <span style={{ color: C.mut, marginLeft: 6 }}>{count}</span>
              </div>
            ))}
            {summary.overdue > 0 && (
              <div style={{ background: "#FEF2F2", border: `1px solid ${C.red}44`, borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
                <span style={{ color: C.red, fontWeight: 700 }}>⚠ {summary.overdue} overdue</span>
              </div>
            )}
          </div>
        )}

        {/* Batch actions */}
        {selectedIds.size > 0 && (
          <div style={{ ...card, marginBottom: 12, padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: C.blu + "10", borderColor: C.blu + "44" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.blu }}>{selectedIds.size} selected</span>
            <button onClick={handleBatchScore} disabled={scoring} style={{ ...btn1, fontSize: 12, padding: "6px 12px", opacity: scoring ? 0.6 : 1 }}>
              {scoring ? "Scoring..." : "⚡ Score"}
            </button>
            <button onClick={checkResearchCost} disabled={researching} style={{ ...btn2, fontSize: 12, padding: "6px 12px", opacity: researching ? 0.6 : 1 }}>
              {researching ? "Researching..." : "🔍 Research"}
            </button>
            <button onClick={() => setSelectedIds(new Set())} style={{ ...btn2, fontSize: 12, padding: "6px 12px" }}>Clear</button>
          </div>
        )}

        {/* Research confirm modal */}
        {researchConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
            <div style={{ ...card, maxWidth: 400, width: "90%" }}>
              <div style={{ fontFamily: FS, fontSize: 16, marginBottom: 10 }}>Confirm Research</div>
              <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.5, marginBottom: 16 }}>
                Research {researchConfirm.count} contact(s) using AI web search? Estimated cost: {researchConfirm.estimatedCost}. Skips contacts researched in the last 7 days.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setResearchConfirm(null)} style={btn2}>Cancel</button>
                <button onClick={handleConfirmResearch} style={btn1}>Confirm Research</button>
              </div>
            </div>
          </div>
        )}

        {/* Brief modal */}
        {briefModal && (
          <div style={{ position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
            <div style={{ ...card, maxWidth: 560, width: "90%", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ fontFamily: FS, fontSize: 18 }}>{briefModal.contactName}</div>
                <ScoreBadge score={briefModal.aiScore} />
                {briefModal.linkedinUrl && (
                  <a href={briefModal.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.blu }}>LinkedIn</a>
                )}
              </div>
              <div style={{ background: C.bg, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: C.tx }}>{briefModal.briefText}</div>
              </div>
              {briefModal.openTasks && briefModal.openTasks.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Open Tasks</div>
                  {briefModal.openTasks.map((t, i) => <div key={i} style={{ fontSize: 12, color: C.sub }}>→ {t}</div>)}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button onClick={() => onOpenChat("contact", briefModal.contactId, briefModal.contactName)} style={{ ...btn2, fontSize: 12 }}>💬 Chat About</button>
                <button onClick={() => setBriefModal(null)} style={btn1}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: 12, display: "flex", gap: 10 }}>
          <input
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="Search contacts..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.brd}`, fontSize: 13, fontFamily: F }}
          />
          <button onClick={loadMorningData} style={{ ...btn2, fontSize: 13, padding: "8px 14px" }}>↻ Refresh</button>
        </div>

        {/* Tier 1 */}
        {allUrgent.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontFamily: FS, fontSize: 16, fontWeight: 700, color: C.red }}>⚡ Urgent Responses</div>
              <span style={{ fontSize: 12, color: C.mut }}>({allUrgent.length} — replied in last 48h)</span>
            </div>
            {allUrgent.map(c => <ContactCard key={String(c.id)} contact={c} tier="urgent" />)}
          </section>
        )}

        {/* Tier 2 */}
        {allFollowUps.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontFamily: FS, fontSize: 16, fontWeight: 700, color: C.amb }}>📅 Follow-Ups Due</div>
              <span style={{ fontSize: 12, color: C.mut }}>({allFollowUps.length} overdue or due today)</span>
            </div>
            {allFollowUps.map(c => <ContactCard key={String(c.id)} contact={c} tier="followup" />)}
          </section>
        )}

        {/* Tier 3 */}
        {allTop10.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontFamily: FS, fontSize: 16, fontWeight: 700, color: C.blu }}>🎯 Top 10 New</div>
              <span style={{ fontSize: 12, color: C.mut }}>(AI-scored · Broker-Investors first)</span>
            </div>
            {allTop10.map(c => <ContactCard key={String(c.id)} contact={c} tier="top10" />)}
          </section>
        )}

        {!allUrgent.length && !allFollowUps.length && !allTop10.length && (
          <div style={{ textAlign: "center", padding: 60, color: C.mut, fontSize: 14 }}>
            {searchFilter ? "No contacts match your search." : "No contacts to show. Score some contacts first to populate the tiers."}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20, paddingBottom: 40 }}>
          <button onClick={onBackToSchedule} style={btn2}>← Schedule</button>
          <button onClick={onSwitchToTasks} style={btn2}>Tasks →</button>
          {onSwitchToFullSales && (
            <button onClick={onSwitchToFullSales} style={btn2}>Full Pipeline →</button>
          )}
        </div>
      </div>
    </div>
  );
}
