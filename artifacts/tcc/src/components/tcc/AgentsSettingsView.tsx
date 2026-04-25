// /settings/agents — minimal Train UI (Phase 1).
// Sidebar lists agents. Selected agent shows: training-state badge,
// unconsumed feedback list (multi-select), Train button, pending proposals
// (with diff viewer), approve/reject.
//
// Dashboard polish (memory editor, run history, etc.) lands in Phase 6.

import { useState, useEffect, useCallback } from "react";
import { get, post } from "@/lib/api";
import { C, F, FS } from "@/components/tcc/constants";

interface AgentEntry { name: string; runtime_enabled: boolean; }
interface AgentsList { agents: AgentEntry[]; feedback_pipeline_enabled: boolean; }

interface TrainingState {
  is_running: boolean;
  run_id: string | null;
  started_at: string | null;
  unconsumed_count: number;
  pending_proposals_count: number;
}

interface FeedbackRow {
  id: string;
  agent: string;
  skill: string;
  sourceType: string;
  sourceId: string;
  rating: number | null;
  reviewText: string | null;
  contextSnapshot: Record<string, unknown>;
  consumedAt: string | null;
  createdAt: string;
}

interface MemoryDiff {
  section_name: string;
  kind: string;
  before: string;
  after: string;
}
interface ProposalRow {
  id: string;
  agent: string;
  trainingRunId: string;
  reason: string;
  diffs: MemoryDiff[];
  feedbackIds: string[];
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

export function AgentsSettingsView({ onBack }: { onBack: () => void }) {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [pipelineEnabled, setPipelineEnabled] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    get<AgentsList>("/api/agents")
      .then(d => {
        setAgents(d.agents);
        setPipelineEnabled(d.feedback_pipeline_enabled);
        if (d.agents.length > 0 && !selectedAgent) setSelectedAgent(d.agents[0].name);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 24px", fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: 14 }}>← Back</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.tx, margin: 0, fontFamily: FS }}>Agent Training</h1>
        <span style={{
          marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 999,
          background: pipelineEnabled ? C.grnBg : C.redBg,
          color: pipelineEnabled ? C.grn : C.red,
          fontWeight: 700,
        }}>
          {pipelineEnabled ? "Feedback pipeline ON" : "Feedback pipeline OFF (no rows being captured)"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
        {/* Sidebar */}
        <div style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 10, overflow: "hidden" }}>
          {agents.map(a => (
            <button
              key={a.name}
              onClick={() => setSelectedAgent(a.name)}
              style={{
                display: "block", width: "100%", padding: "10px 14px",
                textAlign: "left", border: "none", cursor: "pointer", fontFamily: F, fontSize: 13,
                background: selectedAgent === a.name ? C.bluBg : "transparent",
                color: selectedAgent === a.name ? C.blu : C.tx,
                fontWeight: selectedAgent === a.name ? 700 : 500,
                borderBottom: `1px solid ${C.brd}`,
              }}
            >
              <span style={{ textTransform: "capitalize" }}>{a.name}</span>
              {a.runtime_enabled && (
                <span style={{
                  fontSize: 9, marginLeft: 6, padding: "2px 6px",
                  background: C.grnBg, color: C.grn, borderRadius: 4, fontWeight: 700,
                }}>LIVE</span>
              )}
            </button>
          ))}
          {agents.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: C.mut }}>No agents found in registry.</div>
          )}
        </div>

        {/* Detail */}
        <div>
          {selectedAgent
            ? <AgentDetail agent={selectedAgent} pipelineEnabled={pipelineEnabled} />
            : <div style={{ padding: 24, color: C.mut }}>Pick an agent from the sidebar.</div>}
        </div>
      </div>
    </div>
  );
}

function AgentDetail({ agent, pipelineEnabled }: { agent: string; pipelineEnabled: boolean }) {
  const [state, setState] = useState<TrainingState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const [s, f, p] = await Promise.all([
        get<TrainingState>(`/api/agents/${agent}/training-state`),
        get<{ feedback: FeedbackRow[] }>(`/api/agents/${agent}/feedback`),
        get<{ proposals: ProposalRow[] }>(`/api/agents/${agent}/proposals?status=pending`),
      ]);
      setState(s);
      setFeedback(f.feedback);
      setProposals(p.proposals);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agent]);

  useEffect(() => {
    refresh();
    setSelected(new Set());
  }, [agent, refresh]);

  // Poll while a run is active
  useEffect(() => {
    if (!state?.is_running) return;
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [state?.is_running, refresh]);

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const selectAll = () => setSelected(new Set(feedback.map(f => f.id)));
  const clearAll = () => setSelected(new Set());

  const startTraining = async () => {
    if (selected.size === 0) return;
    setTraining(true);
    setError("");
    try {
      await post("/api/agents/" + agent + "/training/start", {
        feedback_ids: Array.from(selected),
      });
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTraining(false);
    }
  };

  const decide = async (proposalId: string, action: "approve" | "reject", reason?: string) => {
    try {
      await post(`/api/proposals/${proposalId}/${action}`, action === "reject" ? { rejection_reason: reason } : {});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!state) return <div style={{ color: C.mut }}>Loading…</div>;

  return (
    <div>
      {/* Status row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <Card label="Unconsumed feedback" value={String(state.unconsumed_count)} color={state.unconsumed_count > 0 ? C.amb : C.mut} />
        <Card label="Pending proposals" value={String(state.pending_proposals_count)} color={state.pending_proposals_count > 0 ? C.blu : C.mut} />
        <Card label="Training run" value={state.is_running ? "RUNNING" : "idle"} color={state.is_running ? C.grn : C.mut} />
      </div>

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!pipelineEnabled && (
        <div style={{ background: C.ambBg, color: C.amb, padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ⚠️ Feedback pipeline is OFF. Set <code>FEEDBACK_PIPELINE_ENABLED=true</code> in env to start capturing rows.
        </div>
      )}

      {/* Pending proposals — top of page */}
      {proposals.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 10, fontFamily: FS }}>Pending proposals</h2>
          {proposals.map(p => <ProposalCard key={p.id} proposal={p} onDecide={decide} />)}
        </div>
      )}

      {/* Feedback queue */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.tx, margin: 0, fontFamily: FS }}>Unconsumed feedback ({feedback.length})</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={selectAll} style={btnGhost}>Select all</button>
          <button onClick={clearAll} style={btnGhost}>Clear</button>
          <button
            onClick={startTraining}
            disabled={selected.size === 0 || state.is_running || training}
            style={{
              ...btn1,
              background: (selected.size === 0 || state.is_running) ? C.mut : C.blu,
              opacity: training ? 0.6 : 1,
            }}
          >
            {state.is_running ? "Run in progress…" : training ? "Starting…" : `Train (${selected.size})`}
          </button>
        </div>
      </div>

      {feedback.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: C.mut, background: C.card, borderRadius: 8, border: `1px solid ${C.brd}` }}>
          No unconsumed feedback for this agent.
        </div>
      )}

      {feedback.map(f => (
        <FeedbackRowCard key={f.id} row={f} selected={selected.has(f.id)} onToggle={() => toggle(f.id)} />
      ))}
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1, padding: "10px 14px", background: C.card,
      border: `1px solid ${C.brd}`, borderRadius: 10,
    }}>
      <div style={{ fontSize: 11, color: C.mut, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function FeedbackRowCard({ row, selected, onToggle }: { row: FeedbackRow; selected: boolean; onToggle: () => void }) {
  const ratingIcon = row.rating === 1 ? "👍" : row.rating === -1 ? "👎" : "•";
  return (
    <label style={{
      display: "flex", gap: 12, padding: "10px 14px", marginBottom: 6,
      background: selected ? C.bluBg : C.card,
      border: `1px solid ${selected ? C.blu : C.brd}`,
      borderRadius: 8, cursor: "pointer",
    }}>
      <input type="checkbox" checked={selected} onChange={onToggle} style={{ marginTop: 4 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.sub }}>
          <span>{ratingIcon}</span>
          <span style={{ fontWeight: 700, color: C.tx }}>{row.skill}</span>
          <span style={{ background: "#F3F4F6", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>{row.sourceType}</span>
          <span style={{ color: C.mut, marginLeft: "auto", fontSize: 11 }}>{new Date(row.createdAt).toLocaleString()}</span>
        </div>
        {row.reviewText && (
          <div style={{ marginTop: 6, fontSize: 13, color: C.tx, lineHeight: 1.4 }}>{row.reviewText}</div>
        )}
        <div style={{ marginTop: 4, fontSize: 11, color: C.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          source_id: {row.sourceId}
        </div>
      </div>
    </label>
  );
}

function ProposalCard({ proposal, onDecide }: { proposal: ProposalRow; onDecide: (id: string, action: "approve" | "reject", reason?: string) => void }) {
  const [showDiffs, setShowDiffs] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.blu}`, borderRadius: 10,
      padding: 14, marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: C.bluBg, color: C.blu, fontWeight: 700 }}>PENDING</span>
        <span style={{ marginLeft: 10, fontSize: 11, color: C.mut }}>{new Date(proposal.createdAt).toLocaleString()}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.mut }}>{proposal.feedbackIds.length} feedback rows · {proposal.diffs.length} sections</span>
      </div>
      <div style={{ fontSize: 14, color: C.tx, marginBottom: 10, lineHeight: 1.5 }}>{proposal.reason}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShowDiffs(s => !s)} style={btnGhost}>{showDiffs ? "Hide" : "View"} diffs</button>
        <button onClick={() => onDecide(proposal.id, "approve")} style={{ ...btn1, background: C.grn }}>Approve all</button>
        <button onClick={() => onDecide(proposal.id, "reject", rejectReason)} style={{ ...btn1, background: C.red }}>Reject</button>
        <input
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="optional rejection reason"
          style={{ flex: 1, padding: "4px 8px", fontSize: 12, border: `1px solid ${C.brd}`, borderRadius: 6 }}
        />
      </div>
      {showDiffs && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.brd}` }}>
          {proposal.diffs.map((d, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
                {d.section_name} <span style={{ color: C.mut, fontWeight: 400 }}>({d.kind})</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                <pre style={{ background: C.redBg, padding: 8, borderRadius: 6, overflow: "auto", margin: 0, maxHeight: 240 }}>
                  {d.before || "(empty)"}
                </pre>
                <pre style={{ background: C.grnBg, padding: 8, borderRadius: 6, overflow: "auto", margin: 0, maxHeight: 240 }}>
                  {d.after}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btn1: React.CSSProperties = {
  padding: "6px 14px", fontSize: 12, fontWeight: 700,
  border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: F,
};
const btnGhost: React.CSSProperties = {
  padding: "6px 12px", fontSize: 12, fontWeight: 600,
  border: `1px solid ${C.brd}`, borderRadius: 8, background: "#fff",
  color: C.sub, cursor: "pointer", fontFamily: F,
};
