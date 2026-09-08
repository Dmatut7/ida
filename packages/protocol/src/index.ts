/** Shared protocol types for Prime Workbench UI <-> Gateway. */

export type PrimeMode = "mock" | "rpc";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  thinking?: string;
  toolName?: string;
  toolCallId?: string;
  streaming?: boolean;
  timestamp: number;
  agentId?: string;
}

export type SubagentStatus = "idle" | "running" | "waiting" | "done" | "error" | "aborted";

export interface SubagentNode {
  id: string;
  name: string;
  role?: string;
  status: SubagentStatus;
  parentId: string | null;
  depth: number;
  summary?: string;
  startedAt?: number;
  endedAt?: number;
  children?: SubagentNode[];
}

export interface TerminalLine {
  id: string;
  stream: "stdout" | "stderr" | "system" | "repl";
  text: string;
  timestamp: number;
  agentId?: string;
}

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  patch: string;
}

export interface SessionState {
  sessionId: string;
  mode: PrimeMode;
  cwd: string;
  isStreaming: boolean;
  model?: string | null;
  thinkingLevel?: string;
  connected: boolean;
  voiceMode: "mock" | "realtime" | "unavailable";
}

/** Client -> Gateway */
export type ClientMessage =
  | { type: "hello"; client: "web"; protocolVersion: number }
  | { type: "prompt"; id: string; message: string; streamingBehavior?: "steer" | "followUp" }
  | { type: "steer"; id: string; message: string }
  | { type: "follow_up"; id: string; message: string }
  | { type: "abort"; id?: string }
  | { type: "new_session"; id?: string }
  | { type: "set_cwd"; cwd: string }
  | { type: "get_state" }
  | { type: "observe_subagent"; activeSessionId: string }
  | { type: "voice_start"; id: string; mode?: "mock" | "realtime" }
  | { type: "voice_stop"; id?: string }
  | { type: "voice_audio"; pcm16Base64: string; sampleRate: number }
  | { type: "voice_interrupt" }
  | { type: "voice_text"; text: string };

/** Gateway -> Client */
export type ServerMessage =
  | { type: "hello_ok"; state: SessionState; protocolVersion: number }
  | { type: "state"; state: SessionState }
  | { type: "error"; message: string; id?: string }
  | { type: "chat_upsert"; message: ChatMessage }
  | { type: "chat_delta"; id: string; delta: string; field?: "content" | "thinking" }
  | { type: "chat_done"; id: string }
  | { type: "subagent_tree"; root: SubagentNode }
  | { type: "subagent_upsert"; node: SubagentNode }
  | { type: "terminal"; line: TerminalLine }
  | { type: "diff"; files: DiffFile[] }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown; agentId?: string }
  | { type: "tool_update"; toolCallId: string; partial: string }
  | { type: "tool_end"; toolCallId: string; result: string; isError?: boolean }
  | { type: "voice_state"; state: VoiceUiState }
  | { type: "voice_transcript"; role: "user" | "assistant"; text: string; final: boolean }
  | { type: "voice_audio"; pcm16Base64: string; sampleRate: number }
  | { type: "response"; id: string; success: boolean; command?: string; error?: string; data?: unknown };

export type VoiceCallPhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "ended" | "error";

export interface VoiceUiState {
  phase: VoiceCallPhase;
  mode: "mock" | "realtime";
  captions: string;
  userPartial: string;
  level: number;
  error?: string;
}

export const PROTOCOL_VERSION = 1;
