export interface Thread {
  id: string;
  title: string | null;
  contextType: string;
  contextId: string | null;
  pinned: boolean;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  toolCalls?: { name: string; result: string }[] | null;
  createdAt: string;
}

export interface StreamEvent {
  type: "text" | "tool_start" | "tool_result" | "done" | "error";
  text?: string;
  tool?: string;
  result?: string;
  error?: string;
}

export interface ToolActivity {
  id: string;
  agentName: string;
  toolName: string;
  status: "running" | "done";
  startedAt: number;
}

export interface AgentInfo {
  id: string;
  label: string;
  icon: string;
  description: string;
  category: "specialist" | "integration";
}
