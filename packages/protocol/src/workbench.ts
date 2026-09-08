import type {
  AgentMessage,
  ImageContent,
  ModelInfo,
  PrimeEvent,
  PrimeSessionState,
  SessionActions,
  StreamingBehavior,
  ThinkingLevel,
} from "./prime.js";
import type { VoiceClientCommand, VoiceServerEvent } from "./voice.js";

export type PrimeMode = "mock" | "rpc";

export type SubagentStatus = "queued" | "running" | "idle" | "completed" | "failed" | "aborted";

export interface SubagentNode {
  id: string;
  name: string;
  status: SubagentStatus;
  parentId: string | null;
  depth: number;
  model?: string;
  lastEvent?: string;
  lastMessage?: string;
  toolName?: string;
  source: "rlm" | "voice" | "user" | "system";
  startedAt: number;
  updatedAt: number;
  sessionId?: string;
  children: SubagentNode[];
}

export interface SessionSummary {
  id: string;
  name: string;
  cwd: string;
  updatedAt: number;
  messageCount: number;
  streaming: boolean;
  source: "mock" | "rpc" | "daemon";
  sessionFile?: string;
}

export interface LogLine {
  id: string;
  ts: number;
  level: "debug" | "info" | "warn" | "error";
  source: "gateway" | "prime" | "repl" | "voice" | "terminal" | "system";
  text: string;
}

export interface WorkbenchHello {
  type: "hello.ok";
  product: "ida";
  name: "Prime Workbench";
  nameZh: "伊达";
  mode: PrimeMode;
  cwd: string;
  session: PrimeSessionState;
  models: ModelInfo[];
  sessions: SessionSummary[];
  subagents: SubagentNode[];
  primeBinary?: string;
  daemonSocket?: string | null;
  voice: {
    realtimeConfigured: boolean;
    defaultMode: "mock" | "realtime";
  };
}

export interface WorkbenchStateEvent {
  type: "workbench.state";
  session: PrimeSessionState;
  actions?: SessionActions;
}

export interface WorkbenchSessionsEvent {
  type: "workbench.sessions";
  sessions: SessionSummary[];
}

export interface WorkbenchSubagentsEvent {
  type: "workbench.subagents";
  tree: SubagentNode[];
}

export interface WorkbenchLogEvent {
  type: "workbench.log";
  line: LogLine;
}

export interface WorkbenchErrorEvent {
  type: "error";
  message: string;
  detail?: string;
  recoverable?: boolean;
}

export interface WorkbenchMessagesEvent {
  type: "workbench.messages";
  messages: AgentMessage[];
}

export interface WorkbenchFsEntry {
  name: string;
  path: string;
  type: "dir" | "file";
}

export type ClientCommand =
  | { type: "hello"; clientId?: string; locale?: "zh" | "en" }
  | { type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: StreamingBehavior }
  | { type: "steer"; message: string }
  | { type: "follow_up"; message: string }
  | { type: "abort" }
  | { type: "new_session"; name?: string }
  | { type: "switch_session"; sessionId: string }
  | { type: "set_cwd"; cwd: string }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "set_thinking_level"; level: ThinkingLevel }
  | { type: "set_session_name"; name: string }
  | { type: "bash"; command: string }
  | { type: "abort_bash" }
  | { type: "observe"; activeSessionId: string }
  | { type: "unobserve"; activeSessionId: string }
  | { type: "list_sessions" }
  | { type: "get_state" }
  | { type: "get_messages" }
  | { type: "compact"; customInstructions?: string }
  | { type: "terminal.input"; data: string }
  | { type: "terminal.resize"; cols: number; rows: number }
  | {
      type: "extension_ui_response";
      id: string;
      value?: string;
      confirmed?: boolean;
      cancelled?: boolean;
    }
  | VoiceClientCommand;

export type ServerEvent =
  | WorkbenchHello
  | WorkbenchStateEvent
  | WorkbenchSessionsEvent
  | WorkbenchSubagentsEvent
  | WorkbenchLogEvent
  | WorkbenchErrorEvent
  | WorkbenchMessagesEvent
  | { type: "prime.event"; event: PrimeEvent }
  | { type: "prime.response"; id?: string; command: string; success: boolean; data?: unknown; error?: string }
  | { type: "terminal.out"; data: string }
  | { type: "extension_ui_request"; id: string; method: string; payload: Record<string, unknown> }
  | VoiceServerEvent;

export function flattenSubagents(nodes: SubagentNode[]): SubagentNode[] {
  const out: SubagentNode[] = [];
  const walk = (list: SubagentNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
