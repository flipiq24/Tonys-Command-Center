import { useState, useEffect, useCallback } from "react";
import { get, post } from "@/lib/api";
import { FontLink } from "@/components/tcc/FontLink";
import { CheckinGate } from "@/components/tcc/CheckinGate";
import { JournalGate } from "@/components/tcc/JournalGate";
import { Header } from "@/components/tcc/Header";
import { CalendarSidebar } from "@/components/tcc/CalendarSidebar";
import { IdeasModal } from "@/components/tcc/IdeasModal";
import { AttemptModal } from "@/components/tcc/AttemptModal";
import { ClaudeModal } from "@/components/tcc/ClaudeModal";
import { EmailsView } from "@/components/tcc/EmailsView";
import { ScheduleView } from "@/components/tcc/ScheduleView";
import { SalesView } from "@/components/tcc/SalesView";
import { TasksView } from "@/components/tcc/TasksView";
import { C, F, FS } from "@/components/tcc/constants";
import type { CalItem, EmailItem, TaskItem, Contact, CallEntry, Idea, DailyBrief } from "@/components/tcc/types";

type View = "checkin" | "journal" | "emails" | "schedule" | "sales" | "tasks";

interface CheckinState {
  bed: string; wake: string; sleep: string;
  bible: boolean; workout: boolean; journal: boolean;
  nut: string; unplug: boolean; done: boolean;
}

const DEFAULT_CONTACTS: Contact[] = [
  { id: "1", name: "Mike Oyoque", company: "MR EXCELLENCE", status: "Warm", phone: "(555) 123-4567", nextStep: "Follow up demo", lastContactDate: "Mar 25" },
  { id: "2", name: "Xander Clemens", company: "Family Office Club", status: "Hot", phone: "(555) 234-5678", nextStep: "Intro call — 10K investors", lastContactDate: "Mar 30" },
  { id: "3", name: "Fernando Perez", company: "Park Ave Capital", status: "New", phone: "(555) 345-6789", nextStep: "Call re: Chino", lastContactDate: "Today" },
  { id: "4", name: "Tony Fletcher", company: "LPT/FairClose", status: "Warm", phone: "(555) 456-7890", nextStep: "Broker Playbook", lastContactDate: "Apr 1" },
  { id: "5", name: "Kyle Draper", company: "", status: "New", phone: "(555) 567-8901", nextStep: "Demo?", lastContactDate: "Mar 28" },
  { id: "6", name: "Chris Craddock", company: "EXP Realty", status: "New", phone: "(555) 678-9012", nextStep: "#1 EXP recruiter", lastContactDate: "Never" },
];

export default function App() {
  const [view, setView] = useState<View>("checkin");
  const [clock, setClock] = useState(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
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
  const [demos, setDemos] = useState(0);
  const [attempt, setAttempt] = useState<{ id: string | number; name: string } | null>(null);
  const [calSide, setCalSide] = useState(false);

  // Ideas state
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [showIdea, setShowIdea] = useState(false);

  // UI state
  const [showChat, setShowChat] = useState(false);
  const [eod, setEod] = useState(false);

  useEffect(() => {
    const i = setInterval(() => setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })), 30000);
    return () => clearInterval(i);
  }, []);

  // Load all state from DB on mount
  useEffect(() => {
    (async () => {
      try {
        const [checkin, journal, briefData, callData, ideaData, demoData, snoozedData, taskData] = await Promise.all([
          get<{ id?: string; done?: boolean; bedtime?: string; waketime?: string; sleepHours?: string; bible?: boolean; workout?: boolean; journal?: boolean; nutrition?: string; unplug?: boolean }>("/checkin/today").catch(() => null),
          get<{ formattedText?: string; rawText?: string }>("/journal/today").catch(() => null),
          get<DailyBrief>("/brief/today").catch(() => null),
          get<CallEntry[]>("/calls").catch(() => []),
          get<Idea[]>("/ideas").catch(() => []),
          get<{ count: number }>("/demos/count").catch(() => ({ count: 0 })),
          get<Record<number, string>>("/emails/snoozed").catch(() => ({})),
          get<{ taskId: string }[]>("/tasks/completed").catch(() => []),
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

          // Advance gate only when persisted record exists
          if (journal?.formattedText || journal?.rawText) {
            setView("emails");
          } else {
            setView("journal");
          }
        }

        if (briefData) setBrief(briefData);
        if (callData?.length) setCalls(callData);
        if (ideaData?.length) setIdeas(ideaData);
        if (demoData) setDemos(demoData.count);
        if (snoozedData) setSnoozed(snoozedData);
        if (taskData?.length) {
          const done: Record<string, boolean> = {};
          for (const t of taskData) done[t.taskId] = true;
          setTDone(done);
        }
      } catch {
        /* start fresh */
      }
      setLoading(false);
    })();
  }, []);

  // Load contacts lazily when entering sales
  useEffect(() => {
    if (view === "sales" && !contactsLoaded) {
      get<Contact[]>("/contacts").then(c => {
        setContacts(c.length > 0 ? c : DEFAULT_CONTACTS);
        setContactsLoaded(true);
      }).catch(() => {
        setContacts(DEFAULT_CONTACTS);
        setContactsLoaded(true);
      });
    }
  }, [view, contactsLoaded]);

  const handleSnooze = useCallback((emailId: number, until: string) => {
    setSnoozed(prev => ({ ...prev, [emailId]: until }));
  }, []);

  const handleTaskToggle = useCallback(async (task: TaskItem) => {
    if (task.sales) { setView("sales"); return; }
    const newVal = !tDone[task.id];
    setTDone(prev => ({ ...prev, [task.id]: newVal }));
    if (newVal) {
      post("/tasks/completed", { taskId: task.id, taskText: task.text }).catch(() => {});
    }
  }, [tDone]);

  const handleLogCall = useCallback(async (contactName: string, type: string) => {
    try {
      const call = await post<CallEntry>("/calls", { contactName, type });
      setCalls(prev => [...prev, call]);
    } catch {
      setCalls(prev => [...prev, { contactName, type, createdAt: new Date().toISOString() }]);
    }
  }, []);

  const handleDemoChange = useCallback(async (delta: number) => {
    try {
      if (delta > 0) {
        const r = await post<{ count: number }>("/demos/increment");
        setDemos(r.count);
      } else {
        const r = await post<{ count: number }>("/demos/decrement");
        setDemos(r.count);
      }
    } catch {
      setDemos(prev => Math.max(0, prev + delta));
    }
  }, []);

  const handleEod = useCallback(async () => {
    setEod(true);
    post("/eod-report", {}).catch(() => {});
  }, []);

  const unresolved = (brief?.emailsImportant || []).filter(e => !snoozed[e.id]).length;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FontLink />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FS, fontSize: 24, marginBottom: 8 }}>Tony's Command Center</div>
          <div style={{ color: C.mut, fontSize: 14 }}>Loading your day...</div>
        </div>
      </div>
    );
  }

  // ═══ GATE: Check-in ═══
  if (!ck.done) {
    return <CheckinGate initial={ck} onComplete={(completed) => { setCk(completed); setView("journal"); }} />;
  }

  // ═══ GATE: Journal ═══
  if (view === "journal") {
    return <JournalGate onComplete={() => setView("emails")} />;
  }

  // ═══ SHARED UI ELEMENTS ═══
  const SharedModals = () => (
    <>
      <IdeasModal open={showIdea} onClose={() => setShowIdea(false)} onSave={idea => setIdeas(prev => [...prev, idea])} count={ideas.length} />
      <ClaudeModal open={showChat} onClose={() => setShowChat(false)} />
    </>
  );

  const SharedHeader = () => (
    <Header
      clock={clock}
      ideas={ideas}
      unresolved={unresolved}
      calSide={calSide}
      eod={eod}
      onSetView={v => setView(v as View)}
      onToggleCal={() => setCalSide(s => !s)}
      onShowIdea={() => setShowIdea(true)}
      onShowChat={() => setShowChat(true)}
      onEod={handleEod}
    />
  );

  // ═══ EMAILS VIEW ═══
  if (view === "emails") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <SharedHeader />
      <SharedModals />
      <EmailsView
        emailsImportant={brief?.emailsImportant || []}
        emailsFyi={brief?.emailsFyi || []}
        snoozed={snoozed}
        onSnooze={handleSnooze}
        onDone={() => setView("schedule")}
      />
    </div>
  );

  // ═══ SALES VIEW ═══
  if (view === "sales") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <SharedHeader />
      {calSide && <CalendarSidebar items={brief?.calendarData || []} onClose={() => setCalSide(false)} />}
      <SharedModals />
      <AttemptModal contact={attempt} onClose={() => setAttempt(null)} onLog={call => setCalls(prev => [...prev, call])} />
      <SalesView
        contacts={contacts}
        calls={calls}
        demos={demos}
        calSide={calSide}
        onAttempt={c => setAttempt(c)}
        onConnected={name => handleLogCall(name, "connected")}
        onDemoChange={handleDemoChange}
        onSwitchToTasks={() => setView("tasks")}
        onBackToSchedule={() => setView("schedule")}
      />
    </div>
  );

  // ═══ TASKS VIEW ═══
  if (view === "tasks") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <SharedHeader />
      {calSide && <CalendarSidebar items={brief?.calendarData || []} onClose={() => setCalSide(false)} />}
      <SharedModals />
      <TasksView
        tasks={brief?.tasks || []}
        tDone={tDone}
        calSide={calSide}
        onToggle={handleTaskToggle}
        onSwitchToSales={() => setView("sales")}
        onBackToSchedule={() => setView("schedule")}
      />
    </div>
  );

  // ═══ SCHEDULE VIEW (default) ═══
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      <SharedHeader />
      {calSide && <CalendarSidebar items={brief?.calendarData || []} onClose={() => setCalSide(false)} />}
      <SharedModals />
      <ScheduleView
        items={brief?.calendarData || []}
        onEnterSales={() => { setView("sales"); setCalSide(true); }}
        onEnterTasks={() => { setView("tasks"); setCalSide(true); }}
      />
    </div>
  );
}
