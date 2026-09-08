import type {
  AgentMessage,
  ClientCommand,
  ModelInfo,
  PrimeEvent,
  PrimeResponse,
  PrimeSessionState,
  SessionSummary,
  SubagentNode,
} from "@ida/protocol";

export interface BackendHandlers {
  onPrimeEvent(event: PrimeEvent, sessionId?: string): void;
  onResponse(response: PrimeResponse): void;
  onState(session: PrimeSessionState): void;
  onSessions(sessions: SessionSummary[]): void;
  onSubagents(tree: SubagentNode[]): void;
  onLog(level: "debug" | "info" | "warn" | "error", source: string, text: string): void;
  onMessages(messages: AgentMessage[]): void;
}

export interface PrimeBackend {
  readonly mode: "mock" | "rpc";
  start(): Promise<void>;
  stop(): Promise<void>;
  handle(command: ClientCommand): Promise<void>;
  getState(): PrimeSessionState;
  getMessages(): AgentMessage[];
  getSessions(): SessionSummary[];
  getSubagents(): SubagentNode[];
  getModels(): ModelInfo[];
  getCwd(): string;
}

export const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "mock-prime-rlm",
    name: "Prime RLM (mock)",
    provider: "mock",
    reasoning: true,
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    reasoning: true,
    contextWindow: 200000,
    maxTokens: 16384,
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    reasoning: false,
    contextWindow: 128000,
    maxTokens: 16384,
  },
];
