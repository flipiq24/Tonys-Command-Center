import { useState, useEffect, useCallback } from "react";
import { get, post, del } from "@/lib/api";
import { FontLink } from "@/components/tcc/FontLink";
import { CheckinGate } from "@/components/tcc/CheckinGate";
import { JournalGate } from "@/components/tcc/JournalGate";
import { Header } from "@/components/tcc/Header";
import { CalendarSidebar } from "@/components/tcc/CalendarSidebar";
import { IdeasModal } from "@/components/tcc/IdeasModal";
import { AttemptModal } from "@/components/tcc/AttemptModal";
import { ClaudeModal } from "@/components/tcc/ClaudeModal";
import { EmailCompose } from "@/components/tcc/EmailCompose";
import { ConnectedCallModal } from "@/components/tcc/ConnectedCallModal";
import { EmailsView } from "@/components/tcc/EmailsView";
import { ScheduleView } from "@/components/tcc/ScheduleView";
import { SalesView } from "@/components/tcc/SalesView";
import { SalesMorning } from "@/components/tcc/SalesMorning";
import { ClaudeChatView } from "@/components/tcc/ClaudeChatView";
import { PrintView } from "@/components/tcc/PrintView";
import { DashboardView } from "@/components/tcc/DashboardView";
import { BusinessView } from "@/components/tcc/BusinessView";
import { AiUsageView } from "@/components/tcc/AiUsageView";
import { C, F, FS } from "@/components/tcc/constants";
import type { CheckinState, CalItem, EmailItem, TaskItem, Contact, CallEntry, Idea, DailyBrief, SlackItem, LinearItem } from "@/components/tcc/types";

type View = "checkin" | "journal" | "dashboard" | "emails" | "schedule" | "sales" | "sales-morning" | "chat" | "business" | "ai-usage";
type BusinessTab = "goals" | "team" | "tasks" | "plan";

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [prevView, setPrevView] = useState<View>("emails");
  const [businessTab, setBusinessTab] = useState<BusinessTab>("goals");
  const [clock, setClock] = useState(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }));
  const [loading, setLoading] = useState(true);

  // Check-in state
  const [ck, setCk] = useState<CheckinState>({ bed: "", wake: "", sleep: "", bible: false, workout: false, journal: false, nut: "Good", unplug: false, done: false });

  // Brief / schedule data
  const [brief, setBrief] = useState<DailyBrief | null>(null);

  // Emails state
  const [snoozed, setSnoozed] = useState<Record<number, string>>({});

  // Tasks state
  const [tDone, setTDone] = useState<Record<string, boolean>>({});

  // Sales state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [attempt, setAttempt] = useState<{ id: string | number; name: string; email?: string } | null>(null);
  const [calSide, setCalSide] = useState(false);

  // Ideas state
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [showIdea, setShowIdea] = useState(false);

  // Email compose state
  const [emailCompose, setEmailCompose] = useState<{
    to?: string; subject?: string; body?: string;
    contactId?: string; contactName?: string;
    replyToSnippet?: string; threadId?: string;
  } | null>(null);

  // Connected call modal state
  const [connectedCall, setConnectedCall] = useState<{
    contactId: string; contactName: string; contactEmail?: string;
  } | null>(null);

  // Chat context state (Prompt 03)
  const [chatContext, setChatContext] = useState<{
    contextType: string; contextId: string; contextLabel: string;
  } | null>(null);

  // Print mode
  const [printMode, setPrintMode] = useState(false);

  // UI state
  const [showChat, setShowChat] = useState(false);
  const [eod, setEod] = useState(false);
  const [meetingWarning, setMeetingWarning] = useState<{ title: string; time: string; location?: string; attendeeBrief?: string } | null>(null);
  const [scopeWarn, setScopeWarn] = useState<{
    message: string;
    type: "morning" | "scope";
    onOverride: () => void;
    onAccept: () => void;
  } | null>(null);

  // Custom instructions (Ctrl+hover editable tooltips)
  const [customTips, setCustomTips] = useState<Record<string, string>>({});

  const handleTipSaved = useCallback((key: string, text: string) => {
    setCustomTips(prev => ({ ...prev, [key]: text }));
  }, []);

  // Auto-refresh: fetch fresh brief data every 15 minutes
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  const refreshBrief = useCallback(async (sources?: string[]) => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const qs = sources?.length ? `?refresh=${sources.join(",")}` : "";
      const data = await get<DailyBrief>(`/brief/today${qs}`);
      if (!data || (data as { error?: string }).error) return;
      setBrief(data);
      setLastRefresh(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }));
      console.log("[TCC] Brief refreshed at", new Date().toLocaleTimeString(), "sources:", sources ?? "all");
    } catch (err) {
      console.warn("[TCC] Auto-refresh failed (skipping):", err);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    const interval = setInterval(refreshBrief, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshBrief]);

  // Email polling — check for new received emails every 5 minutes
  const [newEmailCount, setNewEmailCount] = useState(0);
  const [pendingNewEmails, setPendingNewEmails] = useState<{ from: string; subject: string; snippet: string; messageId: string }[]>([]);
  const [reclassifying, setReclassifying] = useState(false);
  useEffect(() => {
    const pollEmails = async () => {
      try {
        const res = await get<{ ok: boolean; newCount: number; newEmails: { from: string; subject: string; snippet: string; messageId: string }[] }>("/emails/poll");
        if (res?.newCount > 0) {
          setNewEmailCount(prev => prev + res.newCount);
          setPendingNewEmails(prev => [...prev, ...res.newEmails]);
        }
      } catch { /* silent fail */ }
    };
    pollEmails();
    const interval = setInterval(pollEmails, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  const handleReclassify = async () => {
    setReclassifying(true);
    try {
      if (pendingNewEmails.length > 0) {
        // Classify only new unclassified emails
        const res = await post<{ ok: boolean; emailsImportant?: any[]; emailsFyi?: any[]; emailsPromotions?: any[] }>("/emails/reclassify-new", { newEmails: pendingNewEmails });
        if (res?.ok && brief) {
          setBrief({ ...brief, emailsImportant: res.emailsImportant ?? brief.emailsImportant, emailsFyi: res.emailsFyi ?? brief.emailsFyi, emailsPromotions: res.emailsPromotions ?? brief.emailsPromotions ?? [] });
        }
      } else {
        // No pending new emails — do full reclassification
        await refreshBrief(["emails"]);
      }
    } catch { await refreshBrief(["emails"]); }
    setNewEmailCount(0);
    setPendingNewEmails([]);
    setReclassifying(false);
  };
  const dismissNewEmails = () => { setNewEmailCount(0); setPendingNewEmails([]); };

  // Live Linear data — fetch fresh on mount and every 5 minutes
  const [liveLinear, setLiveLinear] = useState<LinearItem[]>([]);
  useEffect(() => {
    const fetchLinear = async () => {
      try {
        const data = await get<LinearItem[]>("/linear/live");
        if (Array.isArray(data) && data.length > 0) setLiveLinear(data);
      } catch { /* silent fail — brief fallback used */ }
    };
    fetchLinear();
    const interval = setInterval(fetchLinear, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-EOD at 4:30 PM Pacific — polls every minute, handles retroactive send
  useEffect(() => {
    let eodSentToday = false;

    const checkAutoEod = async () => {
      if (eodSentToday) return;
      const now = new Date();
      const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
      const hour = pacific.getHours();
      const minute = pacific.getMinutes();

      if ((hour === 16 && minute >= 30) || hour >= 17) {
        try {
          await post<{ ok: boolean; alreadySent: boolean }>("/eod-report/auto", {});
          eodSentToday = true;
          setEod(true);
        } catch {
          /* silent — Tony can say "send EOD" in Claude Chat */
        }
      }
    };

    checkAutoEod();
    const interval = setInterval(checkAutoEod, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Persist active view so Tony resumes exactly where he left off on reload
  const persistView = useCallback((v: View) => {
    if (view !== "chat") setPrevView(view);
    setView(v);
    if (v !== "checkin" && v !== "journal" && v !== "chat") {
      post("/system-instructions", { key: "active_view", text: v }).catch(() => {});
    }
  }, [view]);

  useEffect(() => {
    const i = setInterval(() => setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })), 30000);
    return () => clearInterval(i);
  }, []);

  // 5-min meeting warnings (Pacific-timezone aware — times from API are Pacific)
  useEffect(() => {
    if (!brief?.calendarData) return;
    const nowParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const nowH = parseInt(nowParts.find(p => p.type === "hour")?.value || "0");
    const nowM = parseInt(nowParts.find(p => p.type === "minute")?.value || "0");
    const nowS = parseInt(nowParts.find(p => p.type === "second")?.value || "0");
    const nowPacificMin = (nowH === 24 ? 0 : nowH) * 60 + nowM + nowS / 60;
    const parseTimeToMin = (t: string): number | null => {
      const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!m) return null;
      let h = parseInt(m[1]); const min = parseInt(m[2]); const ampm = m[3].toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + min;
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const item of brief.calendarData) {
      if (!item.real) continue;
      const startMin = parseTimeToMin(item.t);
      if (startMin === null) continue;
      const msUntilWarning = (startMin - nowPacificMin - 5) * 60 * 1000;
      if (msUntilWarning > 0 && msUntilWarning < 8 * 60 * 60 * 1000) {
        timers.push(setTimeout(() => setMeetingWarning({ title: item.n, time: item.t, location: item.loc, attendeeBrief: (item as any).attendeeBrief || item.note || undefined }), msUntilWarning));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [brief?.calendarData]);

  // Auto-dismiss meeting warning after 15 seconds
  useEffect(() => {
    if (!meetingWarning) return;
    const t = setTimeout(() => setMeetingWarning(null), 15_000);
    return () => clearTimeout(t);
  }, [meetingWarning]);

  // Load all state from DB on mount
  useEffect(() => {
    (async () => {
      try {
        const [checkin, journal, briefData, callData, ideaData, snoozedData, taskData, instructionsData] = await Promise.all([
          get<{ id?: string; done?: boolean; bedtime?: string; waketime?: string; sleepHours?: string; bible?: boolean; workout?: boolean; journal?: boolean; nutrition?: string; unplug?: boolean }>("/checkin/today").catch(() => null),
          get<{ formattedText?: string; rawText?: string }>("/journal/today").catch(() => null),
          get<DailyBrief>("/brief/today").catch(() => null),
          get<CallEntry[]>("/calls").catch(() => []),
          get<Idea[]>("/ideas").catch(() => []),
          get<Record<number, string>>("/emails/snoozed").catch(() => ({})),
          get<{ taskId: string }[]>("/tasks/completed").catch(() => []),
          get<Record<string, string>>("/system-instructions").catch(() => ({})),
        ]);

        if (checkin?.id) {
          const loaded: CheckinState = {
            bed: checkin.bedtime || "",
            wake: checkin.waketime || "",
            sleep: checkin.sleepHours || "",
            bible: checkin.bible || false,
            workout: checkin.workout || false,
            journal: checkin.journal || false,
            nut: checkin.nutrition || "Good",
            unplug: checkin.unplug || false,
            done: true,
          };
          setCk(loaded);

          if (journal?.formattedText || journal?.rawText) {
            const VALID_VIEWS: View[] = ["dashboard", "emails", "schedule", "sales", "sales-morning", "business"];
            const savedView = (instructionsData as Record<string, string>)?.["active_view"] as View | undefined;
            const restoredView = savedView && VALID_VIEWS.includes(savedView) ? savedView : "dashboard";
            setView(restoredView);
          } else {
            setView("journal");
          }
        }

        if (briefData) setBrief(briefData);
        if (callData?.length) setCalls(callData);
        if (ideaData?.length) setIdeas(ideaData);
        if (snoozedData) setSnoozed(snoozedData);
        if (taskData?.length) {
          const done: Record<string, boolean> = {};
          for (const t of taskData) done[t.taskId] = true;
          setTDone(done);
        }
        if (instructionsData && Object.keys(instructionsData).length > 0) {
          const tipKeys = Object.fromEntries(
            Object.entries(instructionsData).filter(([k]) => k !== "active_view" && k !== "email_brain")
          );
          setCustomTips(tipKeys);
        }
        setLastRefresh(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }));
      } catch {
        /* start fresh */
      }
      setLoading(false);
    })();
  }, []);

  // Load contacts on mount so Dashboard call list is populated immediately
  useEffect(() => {
    if (contactsLoaded) return;
    get<{ contacts: Contact[]; total: number } | Contact[]>("/contacts?limit=50").then(r => {
      const list = Array.isArray(r) ? r : r.contacts;
      setContacts(list);
      setContactsLoaded(true);
    }).catch(() => {
      setContactsLoaded(true);
    });
  }, [contactsLoaded]);

  const handleSnooze = useCallback((emailId: number, until: string) => {
    setSnoozed(prev => ({ ...prev, [emailId]: until }));
  }, []);

  const handleTaskComplete = useCallback(async (task: TaskItem) => {
    if (task.sales) { persistView("sales"); return; }
    const newVal = !tDone[task.id];
    setTDone(prev => ({ ...prev, [task.id]: newVal }));
    if (newVal) {
      post("/tasks/completed", { taskId: task.id, taskText: task.text }).catch(err => console.error("[TCC] Task complete failed:", err));
    } else {
      del(`/tasks/completed/${encodeURIComponent(task.id)}`).catch(err => console.error("[TCC] Task uncomplete failed:", err));
    }
  }, [tDone]);

  const handleLogCall = useCallback(async (contactName: string, type: string, contactId?: string) => {
    try {
      const call = await post<CallEntry>("/calls", { contactId, contactName, type });
      setCalls(prev => [...prev, call]);
    } catch {
      setCalls(prev => [...prev, { contactId, contactName, type, createdAt: new Date().toISOString() }]);
    }
  }, []);

  const handleEod = useCallback(async () => {
    setEod(true);
    post("/eod-report", {}).catch(() => {});
  }, []);

  // Morning protection: block non-sales scheduling before noon Pacific
  const checkMorningProtection = useCallback((onAccept: () => void, onOverride: () => void) => {
    try {
      const now = new Date();
      const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
      const h = pacific.getHours();
      const isBeforeNoon = h < 12;
      if (isBeforeNoon) {
        setScopeWarn({
          message: "Mornings are protected for sales calls (before noon Pacific). Move this to afternoon?",
          type: "morning",
          onAccept,
          onOverride,
        });
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, []);

  // Scope gatekeeper: Sales > Ramy support > everything else
  const checkScopeGuard = useCallback((taskDescription: string, onAccept: () => void, onOverride: () => void) => {
    const lower = taskDescription.toLowerCase();
    const isSales = lower.includes("sales") || lower.includes("call") || lower.includes("demo") || lower.includes("prospect") || lower.includes("pipeline");
    const isRamy = lower.includes("ramy") || lower.includes("support");
    if (!isSales && !isRamy) {
      setScopeWarn({
        message: `"${taskDescription.substring(0, 60)}" isn't in your scope (Sales or Ramy support). Delegate to Ethan or park it?`,
        type: "scope",
        onAccept,
        onOverride,
      });
      return true;
    }
    return false;
  }, []);

  // Prompt 03: open chat with context from another view
  const openChatWithContext = useCallback((contextType: string, contextId: string, contextLabel: string) => {
    setChatContext({ contextType, contextId, contextLabel });
    persistView("chat");
  }, [persistView]);

  const unresolved = (brief?.emailsImportant || []).filter(e => !snoozed[e.id]).length;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FontLink />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FS, fontSize: 24, marginBottom: 8 }}>COO Dashboard</div>
          <div style={{ color: C.mut, fontSize: 14 }}>Loading your day...</div>
        </div>
      </div>
    );
  }

  // ═══ CHAT VIEW (full screen) ═══
  if (view === "chat") {
    return (
      <>
        <FontLink />
        <ClaudeChatView
          onBack={() => { setChatContext(null); setView(prevView || "emails"); }}
          initialContextType={chatContext?.contextType}
          initialContextId={chatContext?.contextId}
          initialContextLabel={chatContext?.contextLabel}
        />
      </>
    );
  }

  // Real calendar items only (matches what DashboardView shows)
  const realCalItems = (brief?.calendarData || []).filter(c => c.real);

  // Live Linear data takes precedence over cached brief data
  const activeLinearItems: LinearItem[] = liveLinear.length ? liveLinear : (brief?.linearItems || []);

  // ═══ SHARED UI ELEMENTS ═══
  const sharedHeader = (
    <Header
      clock={clock}
      ideas={ideas}
      unresolved={unresolved}
      snoozedCount={Object.keys(snoozed).length}
      calSide={calSide}
      eod={eod}
      customTips={customTips}
      lastRefresh={lastRefresh}
      refreshing={refreshing}
      slackItems={(brief?.slackItems || []) as SlackItem[]}
      linearItems={activeLinearItems}
      meetingWarning={meetingWarning}
      onSetView={v => {
        if (v.startsWith("business:")) {
          const tab = v.split(":")[1] as BusinessTab;
          setBusinessTab(tab);
          persistView("business");
        } else {
          persistView(v as View);
        }
      }}
      onToggleCal={() => setCalSide(s => !s)}
      onShowIdea={() => setShowIdea(true)}
      onShowChat={() => { setChatContext(null); persistView("chat"); }}
      onShowCheckin={() => persistView("checkin")}
      onEod={handleEod}
      onTipSaved={handleTipSaved}
      onRefresh={refreshBrief}
      onDismissWarning={() => setMeetingWarning(null)}
      onPrint={() => setPrintMode(true)}
    />
  );

  const newEmailBanner = newEmailCount > 0 ? (
    <div style={{
      background: "#EBF5FF", borderBottom: "2px solid #2563EB", padding: "10px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <span style={{ fontSize: 14, color: "#1E40AF", fontWeight: 600 }}>
        📬 {newEmailCount} new email{newEmailCount > 1 ? "s" : ""} arrived
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleReclassify} disabled={reclassifying} style={{
          background: "#2563EB", color: "#fff", border: "none", borderRadius: 6,
          padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: reclassifying ? 0.6 : 1,
        }}>{reclassifying ? "Classifying..." : "Classify & Update"}</button>
        <button onClick={dismissNewEmails} style={{
          background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB",
          borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer",
        }}>Dismiss</button>
      </div>
    </div>
  ) : null;

  const sharedModals = (
    <>
      {/* Scope / Morning Protection Banner */}
      {scopeWarn && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 10001,
          background: scopeWarn.type === "morning" ? C.ambBg : C.redBg,
          borderBottom: `2px solid ${scopeWarn.type === "morning" ? C.amb : C.red}`,
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          animation: "slideDown 0.3s ease-out",
        }}>
          <div style={{ fontSize: 14, color: C.tx, flex: 1 }}>
            {scopeWarn.type === "morning" ? "🌅 " : "🚦 "}{scopeWarn.message}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
            <button
              onClick={() => { scopeWarn.onAccept(); setScopeWarn(null); }}
              style={{ padding: "6px 14px", fontSize: 12, borderRadius: 8, border: "none", cursor: "pointer",
                background: scopeWarn.type === "morning" ? C.amb : C.red, color: "#fff", fontWeight: 700 }}>
              {scopeWarn.type === "morning" ? "Move to Afternoon" : "Delegate / Park"}
            </button>
            <button
              onClick={() => {
                scopeWarn.onOverride();
                post("/ideas/notify-override", {
                  text: scopeWarn.message,
                  justification: scopeWarn.type === "morning" ? "Tony chose to schedule in morning anyway" : "Tony overrode scope check",
                }).catch(() => {});
                setScopeWarn(null);
              }}
              style={{ padding: "6px 14px", fontSize: 12, borderRadius: 8, border: `1px solid ${C.brd}`, cursor: "pointer",
                background: C.card, color: C.tx }}>
              Override
            </button>
          </div>
        </div>
      )}
      {printMode && (
        <PrintView
          tasks={brief?.tasks || []}
          tDone={tDone}
          calendarData={brief?.calendarData || []}
          emailsImportant={brief?.emailsImportant || []}
          slackItems={brief?.slackItems || []}
          linearItems={activeLinearItems}
          topCallContacts={contacts.map(c => ({ name: c.name, phone: c.phone, company: c.company, nextStep: c.nextStep }))}
          onClose={() => setPrintMode(false)}
          onRefresh={() => refreshBrief(["calendar", "emails"])}
        />
      )}
      <IdeasModal open={showIdea} onClose={() => setShowIdea(false)} onSave={async (idea) => {
        setIdeas(prev => [...prev, idea]);
        // Task creation is triggered explicitly inside IdeasModal via onCreateTask
      }} onCreateTask={async (ideaText, category, urgency, techType) => {
        let taskFields: any = null;
        try {
          const res = await post<{ ok: boolean; taskFields?: any }>("/ideas/generate-task", {
            ideaText, category, urgency, techType,
          });
          if (res?.ok && res.taskFields) taskFields = res.taskFields;
        } catch { /* AI task gen failed — will use fallback below */ }
        // Fallback: if AI didn't produce fields, use basic idea info
        if (!taskFields) {
          taskFields = {
            title: ideaText.slice(0, 120),
            category: category?.toLowerCase() || "tech",
            owner: "Tony",
            priority: urgency === "Now" ? "P0" : urgency === "This Week" ? "P1" : "P2",
            source: "TCC",
            workNotes: ideaText,
          };
        }
        // Always navigate to tasks tab and open the modal
        setBusinessTab("tasks");
        persistView("business");
        setTimeout(() => window.dispatchEvent(new CustomEvent("tcc:prefill-task", { detail: taskFields })), 500);
      }} count={ideas.length} />
      <ClaudeModal open={showChat} onClose={() => setShowChat(false)} />

      {/* ═══ GATE OVERLAY: Check-in ═══ */}
      {(!ck.done || view === "checkin") && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, overflowY: "auto", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}>
          <CheckinGate
            initial={ck}
            onComplete={async (completed) => {
              setCk(completed);
              if (ck.done) {
                setView(prevView || "dashboard");
              } else {
                // Check if journal already exists for today before showing journal gate
                try {
                  const j = await get<{ formattedText?: string; rawText?: string }>("/journal/today");
                  if (j?.formattedText || j?.rawText) {
                    setView("dashboard");
                  } else {
                    setView("journal");
                  }
                } catch {
                  setView("journal");
                }
              }
            }}
          />
        </div>
      )}

      {/* ═══ GATE OVERLAY: Journal ═══ */}
      {view === "journal" && ck.done && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, overflowY: "auto", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}>
          <JournalGate onComplete={() => setView("dashboard")} />
        </div>
      )}
      <EmailCompose
        open={!!emailCompose}
        onClose={() => setEmailCompose(null)}
        prefillTo={emailCompose?.to}
        prefillSubject={emailCompose?.subject}
        prefillBody={emailCompose?.body}
        prefillContactId={emailCompose?.contactId}
        prefillContactName={emailCompose?.contactName}
        replyToSnippet={emailCompose?.replyToSnippet}
        threadId={emailCompose?.threadId}
      />
      <ConnectedCallModal
        open={!!connectedCall}
        onClose={() => setConnectedCall(null)}
        contactId={connectedCall?.contactId || ""}
        contactName={connectedCall?.contactName || ""}
        contactEmail={connectedCall?.contactEmail}
        onFollowUpEmail={prefill => setEmailCompose(prefill)}
      />
    </>
  );

  // ═══ DASHBOARD VIEW (also serves as background for gate overlays) ═══
  if (view === "dashboard" || view === "checkin" || view === "journal") return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#fff", fontFamily: F }}>
      {sharedHeader}
      {newEmailBanner}
      {sharedModals}
      <AttemptModal contact={attempt} onClose={() => setAttempt(null)} onLog={call => setCalls(prev => [...prev, call])} onCompose={opts => setEmailCompose({ to: opts.to, contactId: opts.contactId, contactName: opts.contactName, body: opts.body, subject: opts.subject })} />
      <DashboardView
        tasks={brief?.tasks || []}
        tDone={tDone}
        calendarData={brief?.calendarData || []}
        emailsImportant={brief?.emailsImportant || []}
        linearItems={activeLinearItems}
        contacts={contacts}
        calls={calls}
        onComplete={handleTaskComplete}
        onNavigate={v => persistView(v as View)}
        onOpenEmail={em => setEmailCompose({ threadId: em.gmailMessageId, subject: `Re: ${em.subj}` })}
        onAttempt={c => setAttempt(c)}
        onCompose={c => setEmailCompose({ to: c.email || "", contactId: String(c.id), contactName: c.name })}
      />
    </div>
  );

  // ═══ EMAILS VIEW ═══
  if (view === "emails") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {sharedHeader}
      {newEmailBanner}
      {sharedModals}
      <EmailsView
        emailsImportant={brief?.emailsImportant || []}
        emailsFyi={brief?.emailsFyi || []}
        emailsPromotions={brief?.emailsPromotions || []}
        snoozed={snoozed}
        customTips={customTips}
        onSnooze={handleSnooze}
        onDone={() => persistView("schedule")}
        onTipSaved={handleTipSaved}
        onRefresh={async () => { try { await get("/emails/poll"); } catch { /* ignore */ } await refreshBrief(["emails"]); }}
        unclassifiedEmails={pendingNewEmails}
        onReclassify={handleReclassify}
        reclassifying={reclassifying}
      />
    </div>
  );

  // ═══ SALES VIEW ═══
  if (view === "sales") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {sharedHeader}
      {calSide && <CalendarSidebar items={realCalItems} onClose={() => setCalSide(false)} onSchedule={() => { persistView("schedule"); setCalSide(false); }} />}
      {sharedModals}
      <AttemptModal contact={attempt} onClose={() => setAttempt(null)} onLog={call => setCalls(prev => [...prev, call])} onCompose={opts => setEmailCompose({ to: opts.to, contactId: opts.contactId, contactName: opts.contactName, body: opts.body, subject: opts.subject })} />
      <SalesView
        contacts={contacts}
        calls={calls}
        calSide={calSide}
        onAttempt={c => setAttempt(c)}
        onConnected={name => handleLogCall(name, "connected")}
        onSwitchToTasks={() => { setBusinessTab("tasks"); persistView("business"); }}
        onBackToSchedule={() => persistView("schedule")}
        onCompose={c => setEmailCompose({ to: c.email || "", contactId: String(c.id), contactName: c.name })}
        onConnectedCall={c => setConnectedCall(c)}
      />
    </div>
  );

  // ═══ SALES MORNING VIEW ═══
  if (view === "sales-morning") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {sharedHeader}
      {calSide && <CalendarSidebar items={brief?.calendarData || []} onClose={() => setCalSide(false)} onSchedule={() => { persistView("schedule"); setCalSide(false); }} />}
      {sharedModals}
      <AttemptModal contact={attempt} onClose={() => setAttempt(null)} onLog={call => setCalls(prev => [...prev, call])} onCompose={opts => setEmailCompose({ to: opts.to, contactId: opts.contactId, contactName: opts.contactName, body: opts.body, subject: opts.subject })} />
      <SalesMorning
        calls={calls}
        onAttempt={c => setAttempt(c)}
        onConnectedCall={c => setConnectedCall(c)}
        onCompose={c => setEmailCompose({ to: c.email || "", contactId: String(c.id), contactName: c.name })}
        onOpenChat={openChatWithContext}
        onSwitchToTasks={() => { setBusinessTab("tasks"); persistView("business"); }}
        onBackToSchedule={() => persistView("schedule")}
        onSwitchToFullSales={() => persistView("sales")}
      />
    </div>
  );

  // ═══ BUSINESS VIEW ═══
  if (view === "business") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {sharedHeader}
      {sharedModals}
      <BusinessView
        defaultTab={businessTab}
        onTabChange={setBusinessTab}
        onBack={() => persistView("dashboard")}
      />
    </div>
  );

  // ═══ AI USAGE VIEW ═══
  if (view === "ai-usage") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {sharedHeader}
      {sharedModals}
      <AiUsageView onBack={() => persistView("dashboard")} />
    </div>
  );

  // ═══ SCHEDULE VIEW (default) ═══
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {sharedHeader}
      {calSide && <CalendarSidebar items={realCalItems} onClose={() => setCalSide(false)} onSchedule={() => { persistView("schedule"); setCalSide(false); }} />}
      {sharedModals}
      <ScheduleView
        items={brief?.calendarData || []}
        onEnterSales={() => { persistView("sales"); setCalSide(true); }}
        onEnterTasks={() => { setBusinessTab("tasks"); persistView("business"); setCalSide(true); }}
        onRefresh={() => refreshBrief(["calendar"])}
      />
    </div>
  );
}
