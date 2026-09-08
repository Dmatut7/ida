import type {
  AgentMessage,
  AssistantMessage,
  ClientCommand,
  LogLine,
  ModelInfo,
  PrimeEvent,
  PrimeSessionState,
  ServerEvent,
  SessionSummary,
  SubagentNode,
  VoiceMode,
  VoicePhase,
  WorkbenchHello,
} from "@ida/protocol";
import { create } from "zustand";
import type { Locale } from "./i18n";
import { WorkbenchSocket } from "./ws";

export type ComposerMode = "prompt" | "steer" | "follow_up";
export type BottomTab = "terminal" | "logs";
export type Theme = "dark" | "light";

interface UiState {
  sidebar: boolean;
  bottom: boolean;
  side: boolean;
  summary: boolean;
  settings: boolean;
  cwdPicker: boolean;
  call: boolean;
  bottomTab: BottomTab;
}

interface VoiceUi {
  phase: VoicePhase;
  mode: VoiceMode;
  bargeIn: boolean;
  speaking: boolean;
  muted: boolean;
  transcripts: { role: "user" | "assistant"; text: string; final: boolean }[];
}

interface Store {
  locale: Locale;
  theme: Theme;
  connected: boolean;
  hello: WorkbenchHello | null;
  session: PrimeSessionState | null;
  sessions: SessionSummary[];
  models: ModelInfo[];
  messages: AgentMessage[];
  streaming: AssistantMessage | null;
  subagents: SubagentNode[];
  logs: LogLine[];
  terminal: string;
  composer: string;
  composerMode: ComposerMode;
  sessionFilter: string;
  ui: UiState;
  voice: VoiceUi;
  socket: WorkbenchSocket | null;
  send: (command: ClientCommand) => void;
  setComposer: (value: string) => void;
  setComposerMode: (mode: ComposerMode) => void;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  toggle: (key: keyof UiState) => void;
  setUi: (patch: Partial<UiState>) => void;
  submit: (override?: string) => void;
  applyEvent: (event: ServerEvent) => void;
  connect: () => void;
}

const defaultSession = (): PrimeSessionState => ({
  model: null,
  thinkingLevel: "medium",
  isStreaming: false,
  isCompacting: false,
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
  sessionId: "",
  autoCompactionEnabled: true,
  messageCount: 0,
  unfinishedActionCount: 0,
  sessionActions: { queuedCount: 0, steering: [], followUps: [] },
  cwd: "",
});

export const useStore = create<Store>((set, get) => ({
  locale: navigator.language.startsWith("zh") ? "zh" : "en",
  theme: "dark",
  connected: false,
  hello: null,
  session: null,
  sessions: [],
  models: [],
  messages: [],
  streaming: null,
  subagents: [],
  logs: [],
  terminal: "",
  composer: "",
  composerMode: "prompt",
  sessionFilter: "",
  ui: {
    sidebar: true,
    bottom: false,
    side: true,
    summary: false,
    settings: false,
    cwdPicker: false,
    call: false,
    bottomTab: "logs",
  },
  voice: {
    phase: "idle",
    mode: "mock",
    bargeIn: false,
    speaking: false,
    muted: false,
    transcripts: [],
  },
  socket: null,
  send: (command) => get().socket?.send(command),
  setComposer: (value) => set({ composer: value }),
  setComposerMode: (mode) => set({ composerMode: mode }),
  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  toggle: (key) =>
    set((s) => ({ ui: { ...s.ui, [key]: typeof s.ui[key] === "boolean" ? !s.ui[key] : s.ui[key] } })),
  setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
  submit: (override) => {
    const { composer, composerMode, session, send } = get();
    const text = (override ?? composer).trim();
    if (!text) return;
    const streaming = session?.isStreaming;
    if (composerMode === "follow_up" || (streaming && composerMode === "prompt" && override === undefined && false)) {
      /* fallthrough */
    }
    if (composerMode === "follow_up") send({ type: "follow_up", message: text });
    else if (composerMode === "steer" || streaming) send({ type: "steer", message: text });
    else send({ type: "prompt", message: text });
    set({ composer: "" });
  },
  applyEvent: (event) => {
    switch (event.type) {
      case "hello.ok":
        set({
          hello: event,
          connected: true,
          session: event.session,
          sessions: event.sessions,
          models: event.models,
          subagents: event.subagents,
        });
        break;
      case "workbench.state":
        set({ session: event.session });
        break;
      case "workbench.sessions":
        set({ sessions: event.sessions });
        break;
      case "workbench.subagents":
        set({ subagents: event.tree });
        break;
      case "workbench.messages":
        set({ messages: event.messages, streaming: null });
        break;
      case "workbench.log":
        set((s) => ({ logs: [...s.logs.slice(-400), event.line] }));
        break;
      case "terminal.out":
        set((s) => ({ terminal: (s.terminal + event.data).slice(-80_000) }));
        break;
      case "error":
        set((s) => ({
          logs: [
            ...s.logs,
            {
              id: `err_${Date.now()}`,
              ts: Date.now(),
              level: "error",
              source: "gateway",
              text: event.message,
            },
          ],
        }));
        break;
      case "prime.event":
        applyPrimeEvent(event.event, set, get);
        break;
      case "voice.state":
        set((s) => ({
          voice: { ...s.voice, phase: event.phase, mode: event.mode, bargeIn: event.bargeIn, speaking: event.speaking },
        }));
        break;
      case "voice.transcript":
        set((s) => ({ voice: { ...s.voice, transcripts: [...s.voice.transcripts.slice(-40), event] } }));
        break;
      case "voice.speak":
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(event.text);
          u.lang = get().locale === "zh" ? "zh-CN" : "en-US";
          window.speechSynthesis.speak(u);
        }
        break;
      case "voice.error":
        set((s) => ({
          logs: [
            ...s.logs,
            { id: `v_${Date.now()}`, ts: Date.now(), level: "error", source: "voice", text: event.message },
          ],
        }));
        break;
      default:
        break;
    }
  },
  connect: () => {
    const socket = new WorkbenchSocket((event) => get().applyEvent(event));
    set({ socket });
    socket.connect();
  },
}));

function applyPrimeEvent(
  event: PrimeEvent,
  set: (partial: Partial<Store> | ((s: Store) => Partial<Store>)) => void,
  get: () => Store,
): void {
  if (event.type === "message_start" && event.message.role === "user") {
    set((s) => ({ messages: [...s.messages, event.message] }));
  }
  if (event.type === "message_update") {
    set({ streaming: event.message });
  }
  if (event.type === "message_end" && event.message.role === "assistant") {
    set((s) => ({
      streaming: null,
      messages: [...s.messages.filter((m) => m !== event.message), event.message],
    }));
  }
  if (event.type === "message_end" && event.message.role === "toolResult") {
    set((s) => ({ messages: [...s.messages, event.message] }));
  }
  if (event.type === "agent_start") {
    set((s) => ({ session: { ...(s.session ?? defaultSession()), isStreaming: true } }));
  }
  if (event.type === "agent_end") {
    set((s) => ({
      streaming: null,
      session: { ...(s.session ?? defaultSession()), isStreaming: false },
    }));
  }
  if (event.type === "tool_execution_start") {
    set((s) => ({
      logs: [
        ...s.logs,
        {
          id: event.toolCallId,
          ts: Date.now(),
          level: "info",
          source: "repl",
          text: `${event.toolName} ${JSON.stringify(event.args).slice(0, 200)}`,
        },
      ],
    }));
  }
  void get;
}

export function visibleMessages(messages: AgentMessage[], streaming: AssistantMessage | null): AgentMessage[] {
  if (!streaming) return messages;
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") return [...messages.slice(0, -1), streaming];
  return [...messages, streaming];
}
