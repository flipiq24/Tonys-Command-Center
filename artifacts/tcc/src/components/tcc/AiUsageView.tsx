import { useState, useEffect } from "react";
import { get } from "@/lib/api";
import { C, F } from "@/components/tcc/constants";

interface AggBucket { cost: number; tokens: number; calls: number }
interface FeatureBucket extends AggBucket { feature: string }
interface ModelBucket extends AggBucket { model: string; provider: string }
interface ProviderBucket extends AggBucket { provider: string }
interface LogEntry {
  id: string; timestamp: string; featureName: string; provider: string; model: string;
  inputTokens: number; outputTokens: number; totalTokens: number;
  inputCostUsd: string; outputCostUsd: string; totalCostUsd: string;
  requestSummary: string | null; responseSummary: string | null;
  durationMs: number; status: string; errorMessage: string | null;
}
interface Summary {
  today: AggBucket; week: AggBucket; month: AggBucket;
  byFeature: FeatureBucket[]; byModel: ModelBucket[]; byProvider: ProviderBucket[];
}
interface ApiResponse { logs: LogEntry[]; summary: Summary; pagination: { total: number; limit: number; offset: number } }

export function AiUsageView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    get<ApiResponse>("/ai-usage?limit=200")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: F, color: C.sub }}>Loading AI usage data...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", fontFamily: F, color: C.red }}>Failed to load AI usage data</div>;

  const { summary, logs } = data;
  const maxFeatureCost = Math.max(...summary.byFeature.map(f => f.cost), 0.001);
  const maxModelCost = Math.max(...summary.byModel.map(m => m.cost), 0.001);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 24px", fontFamily: F }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: 14 }}>← Back</button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.tx, margin: 0 }}>AI Token Usage</h1>
        <span style={{ fontSize: 12, color: C.mut, marginLeft: "auto" }}>{data.pagination.total} total API calls</span>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {([["Today", summary.today], ["This Week", summary.week], ["This Month", summary.month]] as [string, AggBucket][]).map(([label, agg]) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.mut, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.tx, marginTop: 4 }}>${agg.cost.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
              {agg.tokens.toLocaleString()} tokens · {agg.calls} calls
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* By Feature */}
        <div style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Cost by Feature (30d)</div>
          {summary.byFeature.length === 0 && <div style={{ color: C.mut, fontSize: 12 }}>No data yet</div>}
          {summary.byFeature.slice(0, 12).map((f) => (
            <div key={f.feature} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.sub, marginBottom: 2 }}>
                <span>{f.feature.replace(/_/g, " ")}</span>
                <span>${f.cost.toFixed(3)} · {f.calls} calls</span>
              </div>
              <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(f.cost / maxFeatureCost) * 100}%`, background: "#E65100", borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>

        {/* By Model */}
        <div style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Cost by Model (30d)</div>
          {summary.byModel.length === 0 && <div style={{ color: C.mut, fontSize: 12 }}>No data yet</div>}
          {summary.byModel.map((m) => (
            <div key={m.model} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.sub, marginBottom: 2 }}>
                <span>{m.model} <span style={{ color: C.mut }}>({m.provider})</span></span>
                <span>${m.cost.toFixed(3)} · {m.calls} calls</span>
              </div>
              <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(m.cost / maxModelCost) * 100}%`, background: "#1565C0", borderRadius: 3 }} />
              </div>
            </div>
          ))}

          {/* Provider Summary */}
          {summary.byProvider.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.brd}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.mut, marginBottom: 6 }}>By Provider</div>
              {summary.byProvider.map((p) => (
                <div key={p.provider} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.sub, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{p.provider}</span>
                  <span>${p.cost.toFixed(3)} · {p.tokens.toLocaleString()} tokens</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.brd}`, fontSize: 13, fontWeight: 700, color: C.tx }}>
          Recent API Calls
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {["Time", "Feature", "Model", "Input", "Output", "Cost", "Duration", "Status"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.sub, fontSize: 11, borderBottom: `1px solid ${C.brd}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => get(`/ai-usage/${log.id}`).then(setSelectedLog).catch(console.error)}
                  style={{ cursor: "pointer", borderBottom: `1px solid ${C.brd}` }}
                  onMouseOver={(e) => (e.currentTarget.style.background = C.bg)}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "8px 12px", color: C.mut, whiteSpace: "nowrap" }}>
                    {new Date(log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td style={{ padding: "8px 12px", color: C.tx, fontWeight: 500 }}>{log.featureName.replace(/_/g, " ")}</td>
                  <td style={{ padding: "8px 12px", color: C.sub }}>{log.model.replace("claude-", "").replace("-20251001", "")}</td>
                  <td style={{ padding: "8px 12px", color: C.sub }}>{(log.inputTokens || 0).toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: C.sub }}>{(log.outputTokens || 0).toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: C.tx, fontWeight: 600 }}>${parseFloat(log.totalCostUsd || "0").toFixed(4)}</td>
                  <td style={{ padding: "8px 12px", color: C.mut }}>{log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                      background: log.status === "success" ? C.grnBg : C.redBg,
                      color: log.status === "success" ? C.grn : C.red,
                    }}>{log.status}</span>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: C.mut }}>No API calls logged yet. Use any AI feature and it will appear here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }} onClick={() => setSelectedLog(null)}>
          <div style={{ background: C.card, borderRadius: 12, maxWidth: 700, width: "90%", maxHeight: "80vh", overflow: "auto", padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: C.tx }}>{selectedLog.featureName?.replace(/_/g, " ")}</h3>
              <button onClick={() => setSelectedLog(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.mut }}>x</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, fontSize: 12 }}>
              <div><span style={{ color: C.mut }}>Provider:</span> <strong>{selectedLog.provider}</strong></div>
              <div><span style={{ color: C.mut }}>Model:</span> <strong>{selectedLog.model}</strong></div>
              <div><span style={{ color: C.mut }}>Input tokens:</span> <strong>{selectedLog.inputTokens?.toLocaleString()}</strong></div>
              <div><span style={{ color: C.mut }}>Output tokens:</span> <strong>{selectedLog.outputTokens?.toLocaleString()}</strong></div>
              <div><span style={{ color: C.mut }}>Total cost:</span> <strong>${parseFloat(selectedLog.totalCostUsd || "0").toFixed(4)}</strong></div>
              <div><span style={{ color: C.mut }}>Duration:</span> <strong>{selectedLog.durationMs ? `${(selectedLog.durationMs / 1000).toFixed(1)}s` : "—"}</strong></div>
            </div>
            {selectedLog.requestSummary && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.mut, marginBottom: 4 }}>REQUEST SUMMARY</div>
                <div style={{ fontSize: 12, color: C.sub, background: C.bg, padding: 10, borderRadius: 6, whiteSpace: "pre-wrap" }}>{selectedLog.requestSummary}</div>
              </div>
            )}
            {selectedLog.responseSummary && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.mut, marginBottom: 4 }}>RESPONSE SUMMARY</div>
                <div style={{ fontSize: 12, color: C.sub, background: C.bg, padding: 10, borderRadius: 6, whiteSpace: "pre-wrap" }}>{selectedLog.responseSummary}</div>
              </div>
            )}
            {selectedLog.fullRequest && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.mut, marginBottom: 4 }}>FULL REQUEST</div>
                <pre style={{ fontSize: 11, color: C.sub, background: C.bg, padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 200 }}>
                  {JSON.stringify(selectedLog.fullRequest, null, 2)}
                </pre>
              </div>
            )}
            {selectedLog.fullResponse && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.mut, marginBottom: 4 }}>FULL RESPONSE</div>
                <pre style={{ fontSize: 11, color: C.sub, background: C.bg, padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 200 }}>
                  {JSON.stringify(selectedLog.fullResponse, null, 2)}
                </pre>
              </div>
            )}
            {selectedLog.errorMessage && (
              <div style={{ marginTop: 12, padding: 10, background: C.redBg, borderRadius: 6, color: C.red, fontSize: 12 }}>
                <strong>Error:</strong> {selectedLog.errorMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
