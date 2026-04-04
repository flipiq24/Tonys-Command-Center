import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth.js";

function getTasksClient() {
  return google.tasks({ version: "v1", auth: getGoogleAuth() });
}

const DEFAULT_TASKLIST = "@default";

export interface GTask {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  notes?: string;
}

export async function createGoogleTask(title: string, dueDate?: string | null, notes?: string): Promise<string | null> {
  try {
    const tasks = getTasksClient();
    const body: Record<string, string> = { title };
    if (dueDate) body.due = `${dueDate}T00:00:00.000Z`;
    if (notes) body.notes = notes;
    const res = await tasks.tasks.insert({
      tasklist: DEFAULT_TASKLIST,
      requestBody: body,
    });
    return res.data.id ?? null;
  } catch (err) {
    console.warn("[gtasks] createGoogleTask failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function completeGoogleTask(googleTaskId: string): Promise<boolean> {
  try {
    const tasks = getTasksClient();
    await tasks.tasks.patch({
      tasklist: DEFAULT_TASKLIST,
      task: googleTaskId,
      requestBody: { status: "completed" },
    });
    return true;
  } catch (err) {
    console.warn("[gtasks] completeGoogleTask failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function deleteGoogleTask(googleTaskId: string): Promise<boolean> {
  try {
    const tasks = getTasksClient();
    await tasks.tasks.delete({
      tasklist: DEFAULT_TASKLIST,
      task: googleTaskId,
    });
    return true;
  } catch (err) {
    console.warn("[gtasks] deleteGoogleTask failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function listGoogleTasks(): Promise<GTask[]> {
  try {
    const tasks = getTasksClient();
    const res = await tasks.tasks.list({
      tasklist: DEFAULT_TASKLIST,
      showCompleted: false,
      showHidden: false,
      maxResults: 100,
    });
    return (res.data.items || []).map(t => ({
      id: t.id!,
      title: t.title || "",
      status: (t.status as GTask["status"]) || "needsAction",
      due: t.due ?? undefined,
      completed: t.completed ?? undefined,
      notes: t.notes ?? undefined,
    }));
  } catch (err) {
    console.warn("[gtasks] listGoogleTasks failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
