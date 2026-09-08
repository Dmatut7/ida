/** Types that mirror Prime Agent RPC (prime-agent --mode rpc). */

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type SteeringMode = "all" | "one-at-a-time";
export type FollowUpMode = "all" | "one-at-a-time";
export type StreamingBehavior = "steer" | "followUp";

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

export interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type AssistantContent = TextContent | ThinkingContent | ToolCallContent;

export interface ModelInfo {
  id: string;
  name: string;
  api?: string;
  provider: string;
  baseUrl?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export interface SessionActions {
  queuedCount: number;
  steering: string[];
  followUps: string[];
  active?: { kind: string; phase: string; label: string };
}

export interface PrimeSessionState {
  model: ModelInfo | null;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: SteeringMode;
  followUpMode: FollowUpMode;
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  unfinishedActionCount: number;
  sessionActions: SessionActions;
  cwd: string;
}

export interface UserMessage {
  role: "user";
  content: string | Array<TextContent | ImageContent>;
  timestamp: number;
  attachments?: unknown[];
  source?: "composer" | "voice" | "steer" | "follow_up" | "system";
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContent[];
  api?: string;
  provider?: string;
  model?: string;
  usage?: TokenUsage & { cost?: Record<string, number> };
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted";
  timestamp: number;
  sessionId?: string;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: TextContent[];
  isError: boolean;
  timestamp: number;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string | null;
  timestamp: number;
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage;

export type PrimeCommandType =
  | "prompt"
  | "steer"
  | "follow_up"
  | "abort"
  | "new_session"
  | "get_state"
  | "get_messages"
  | "set_model"
  | "cycle_model"
  | "get_available_models"
  | "set_thinking_level"
  | "cycle_thinking_level"
  | "set_steering_mode"
  | "set_follow_up_mode"
  | "compact"
  | "set_auto_compaction"
  | "set_auto_retry"
  | "abort_retry"
  | "bash"
  | "abort_bash"
  | "get_session_stats"
  | "export_html"
  | "switch_session"
  | "fork"
  | "clone"
  | "get_fork_messages"
  | "get_last_assistant_text"
  | "set_session_name"
  | "get_commands"
  | "send_message"
  | "observe"
  | "unobserve"
  | "list_schedules"
  | "add_schedule"
  | "cancel_schedule"
  | "list_heartbeats"
  | "get_heartbeat"
  | "set_heartbeat"
  | "update_heartbeat"
  | "manage_heartbeat"
  | "agent_messages_status"
  | "agent_messages_pause"
  | "agent_messages_resume"
  | "agent_messages_clear"
  | "extension_ui_response";

export interface PrimeCommand {
  id?: string;
  type: PrimeCommandType | string;
  [key: string]: unknown;
}

export interface PrimeResponse {
  type: "response";
  id?: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type AssistantMessageEvent =
  | { type: "start"; partial?: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial?: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial?: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content?: string; partial?: AssistantMessage }
  | { type: "thinking_start"; contentIndex: number; partial?: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial?: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content?: string; partial?: AssistantMessage }
  | { type: "toolcall_start"; contentIndex: number; partial?: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta?: string; partial?: AssistantMessage }
  | {
      type: "toolcall_end";
      contentIndex: number;
      toolCall?: ToolCallContent;
      partial?: AssistantMessage;
    }
  | { type: "done"; reason: "stop" | "length" | "toolUse" }
  | { type: "error"; reason: "aborted" | "error" };

export type PrimeEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message?: AssistantMessage; toolResults?: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AssistantMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      partialResult: { content: TextContent[]; details?: Record<string, unknown> };
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: { content: TextContent[]; details?: Record<string, unknown> };
      isError: boolean;
    }
  | { type: "session_action_update"; actions: SessionActions }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | {
      type: "compaction_end";
      reason: "manual" | "threshold" | "overflow";
      result: { summary: string; firstKeptEntryId?: string; tokensBefore?: number } | null;
      aborted: boolean;
      willRetry?: boolean;
      errorMessage?: string;
    }
  | {
      type: "auto_retry_start";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      errorMessage: string;
    }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
  | { type: "extension_error"; extensionPath: string; event: string; error: string }
  | { type: "extension_ui_request"; id: string; method: string; [key: string]: unknown }
  | { type: "observed_session_event"; activeSessionId: string; event: PrimeEvent }
  | { type: "observed_session_closed"; activeSessionId: string };

export function isPrimeResponse(value: unknown): value is PrimeResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as PrimeResponse).type === "response"
  );
}

export function isPrimeEvent(value: unknown): value is PrimeEvent {
  return typeof value === "object" && value !== null && "type" in value;
}
