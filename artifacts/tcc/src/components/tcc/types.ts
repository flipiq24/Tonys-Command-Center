export interface CalItem { t: string; n: string; loc?: string; note?: string; real?: boolean; }
export interface EmailItem { id: number; from: string; subj: string; why: string; time?: string; p?: string; }
export interface TaskItem { id: string; text: string; cat: string; sales?: boolean; }
export interface Contact {
  id: string | number;
  name: string;
  company?: string;
  status?: string;
  phone?: string;
  email?: string;
  nextStep?: string;
  lastContactDate?: string;
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
export interface DailyBrief {
  date: string;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  emailsFyi: EmailItem[];
  tasks: TaskItem[];
}
