import type { SubagentNode } from "@prime-workbench/protocol";

/** Normalized events emitted by any Prime backend adapter. */
export type AdapterEvent =
  | { kind: "agent_start" }
  | { kind: "agent_end" }
  | { kind: "text_delta"; messageId: string; delta: string }
  | { kind: "thinking_delta"; messageId: string; delta: string }
  | { kind: "message_start"; messageId: string; role: "assistant" }
  | { kind: "message_end"; messageId: string; content: string }
  | { kind: "tool_start"; toolCallId: string; toolName: string; args: unknown; agentId?: string }
  | { kind: "tool_update"; toolCallId: string; partial: string }
  | { kind: "tool_end"; toolCallId: string; result: string; isError?: boolean }
  | { kind: "terminal"; stream: "stdout" | "stderr" | "system" | "repl"; text: string; agentId?: string }
  | { kind: "subagent_tree"; root: SubagentNode }
  | { kind: "subagent_upsert"; node: SubagentNode }
  | { kind: "diff"; files: { path: string; status: "added" | "modified" | "deleted" | "renamed"; patch: string }[] }
  | { kind: "raw"; payload: unknown }
  | { kind: "error"; message: string }
  | { kind: "state"; isStreaming: boolean; sessionId?: string; model?: string | null };

export interface AdapterState {
  sessionId: string;
  isStreaming: boolean;
  cwd: string;
  model?: string | null;
}

export interface PrimeAdapter {
  readonly kind: "mock" | "rpc";
  start(): Promise<void>;
  stop(): Promise<void>;
  prompt(message: string, opts?: { streamingBehavior?: "steer" | "followUp" }): Promise<void>;
  steer(message: string): Promise<void>;
  abort(): Promise<void>;
  newSession(): Promise<void>;
  setCwd(cwd: string): Promise<void>;
  getState(): AdapterState;
  onEvent(handler: (ev: AdapterEvent) => void): () => void;
}
