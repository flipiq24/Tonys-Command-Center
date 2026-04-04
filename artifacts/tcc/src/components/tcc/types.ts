export interface CheckinState {
  bed: string; wake: string; sleep: string;
  bible: boolean; workout: boolean; journal: boolean;
  nut: string; unplug: boolean; done: boolean;
}

export interface CalItem {
  t: string;
  tEnd?: string;
  n: string;
  loc?: string;
  note?: string;
  real?: boolean;
  calendarEventId?: string;
  calendarLink?: string;
  htmlLink?: string;
  slackChannelId?: string;
  slackMessageTs?: string;
  gmailMessageId?: string;
  linearIdentifier?: string;
}
export interface EmailItem { id: number; from: string; subj: string; why: string; time?: string; p?: string; gmailMessageId?: string; }
export interface TaskItem { id: string; text: string; cat: string; sales?: boolean; }
export interface ContactNote {
  id: string;
  contactId: string;
  text: string;
  kind?: string;
  createdAt?: string;
}

export interface Contact {
  id: string | number;
  name: string;
  company?: string;
  status?: string;
  phone?: string;
  email?: string;
  type?: string;
  category?: string;
  title?: string;
  nextStep?: string;
  lastContactDate?: string;
  notes?: string;
  source?: string;
  pipelineStage?: string;
  dealValue?: string | null;
  leadSource?: string;
  linkedinUrl?: string;
  website?: string;
  tags?: string[];
  followUpDate?: string | null;
  expectedCloseDate?: string | null;
  dealProbability?: number | null;
  createdAt?: string;
  updatedAt?: string;
  _notes?: ContactNote[];
  _calls?: CallEntry[];
}
export interface CallEntry {
  id?: string;
  contactName: string;
  type: string;
  notes?: string;
  createdAt?: string;
}
export interface Idea {
  id: string;
  text: string;
  category: string;
  urgency: string;
  techType?: string;
  priorityPosition?: number;
}
export interface SlackItem {
  from: string;
  message: string;
  level: "high" | "mid" | "low";
  channel: string;
}

export interface LinearItem {
  who: string;
  task: string;
  id: string;
  level: "high" | "mid" | "low";
}

export interface DailyBrief {
  date: string;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  emailsFyi: EmailItem[];
  slackItems?: SlackItem[];
  linearItems?: LinearItem[];
  tasks: TaskItem[];
}
