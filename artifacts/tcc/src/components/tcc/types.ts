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
  colorId?: string;
  meetLink?: string;
  priority?: string;
  attendeeCount?: number;
}
export interface EmailItem { id: number; from: string; subj: string; why: string; time?: string; p?: string; gmailMessageId?: string; contactContext?: string; }
export interface TaskItem { id: string; text: string; cat: string; sales?: boolean; priority?: number; }
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
  painPoints?: string;
  sheetId?: string;
  createdAt?: string;
  updatedAt?: string;
  _notes?: ContactNote[];
  _calls?: CallEntry[];
}
export interface CallEntry {
  id?: string;
  contactId?: string;
  contactName: string;
  type: string;
  notes?: string;
  followUpText?: string;
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
  url?: string;
}

export interface LinearItem {
  who: string;
  task: string;
  id: string;
  identifier?: string;
  level: "high" | "mid" | "low";
  dueDate?: string | null;
  startDate?: string | null;
  size?: string | null;
  inSequence?: boolean | null;
  state?: string;
  stateType?: string;
  description?: string | null;
  labels?: string[];
  url?: string;
}

export interface DailyBrief {
  date: string;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  emailsFyi: EmailItem[];
  emailsPromotions?: EmailItem[];
  slackItems?: SlackItem[];
  linearItems?: LinearItem[];
  tasks: TaskItem[];
}
