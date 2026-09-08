import type {
  AgentMessage,
  ClientCommand,
  LogLine,
  PrimeEvent,
  PrimeResponse,
  PrimeSessionState,
  SessionSummary,
  SubagentNode,
  VoiceDispatch,
  VoiceMode,
  WorkbenchHello,
} from "@ida/protocol";
import { dispatchToRootPrompt, MockVoiceSession, RealtimeVoiceSession, type VoiceSession } from "@ida/voice";
import { MockBackend } from "./backends/mock.js";
import { RpcBackend } from "./backends/rpc.js";
import type { BackendHandlers, PrimeBackend } from "./backends/types.js";
import { ShellSession } from "./terminal.js";
import { id, now } from "./util.js";

export interface HubConfig {
  mode: "mock" | "rpc";
  cwd: string;
  primeBin: string;
  primeArgs: string[];
  sessionDir?: string;
  daemonSocket?: string;
  openaiKey?: string;
}

export type HubSink = (event: unknown) => void;

export class WorkbenchHub {
  readonly config: HubConfig;
  backend!: PrimeBackend;
  shell: ShellSession;
  private sinks = new Set<HubSink>();
  private voice: VoiceSession | null = null;
  private logs: LogLine[] = [];

  constructor(config: HubConfig) {
    this.config = config;
    const handlers = this.backendHandlers();
    this.shell = new ShellSession(config.cwd, handlers);
    this.shell.onOut = (data) => this.broadcast({ type: "terminal.out", data });
    this.backend = this.createBackend(handlers);
  }

  async start(): Promise<void> {
    await this.backend.start();
  }

  async stop(): Promise<void> {
    await this.voice?.stop();
    await this.backend.stop();
  }

  subscribe(sink: HubSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  hello(): WorkbenchHello {
    return {
      type: "hello.ok",
      product: "ida",
      name: "Prime Workbench",
      nameZh: "伊达",
      mode: this.backend.mode,
      cwd: this.backend.getCwd(),
      session: this.backend.getState(),
      models: this.backend.getModels(),
      sessions: this.backend.getSessions(),
      subagents: this.backend.getSubagents(),
      primeBinary: this.config.primeBin,
      daemonSocket: this.config.daemonSocket ?? null,
      voice: {
        realtimeConfigured: Boolean(this.config.openaiKey),
        defaultMode: this.config.openaiKey ? "realtime" : "mock",
      },
    };
  }

  async handle(command: ClientCommand): Promise<void> {
    if (command.type === "hello") {
      this.broadcast(this.hello());
      this.broadcast({ type: "workbench.messages", messages: this.backend.getMessages() });
      return;
    }
    if (command.type.startsWith("voice.")) {
      await this.handleVoice(command);
      return;
    }
    if (command.type === "terminal.input") {
      this.shell.write(command.data);
      return;
    }
    if (command.type === "terminal.resize") return;
    await this.backend.handle(command);
    if (command.type === "set_cwd") this.shell.setCwd(command.cwd);
  }

  private async handleVoice(command: ClientCommand): Promise<void> {
    if (command.type === "voice.start") {
      await this.voice?.stop();
      this.voice = this.createVoice(command.mode);
      await this.voice.start();
      return;
    }
    if (command.type === "voice.stop") {
      await this.voice?.stop();
      this.voice = null;
      return;
    }
    if (!this.voice) return;
    if (command.type === "voice.audio") {
      this.voice.pushAudio(Buffer.from(command.pcm, "base64"));
      return;
    }
    if (command.type === "voice.interrupt") {
      this.voice.interrupt(command.reason);
      return;
    }
    if (command.type === "voice.transcript") {
      this.voice.ingestTranscript(command.text, command.final ?? true);
    }
  }

  private createVoice(mode: VoiceMode): VoiceSession {
    const handlers = {
      onEvent: (event: unknown) => this.broadcast(event),
      onDispatch: (dispatch: VoiceDispatch) => {
        void this.applyVoiceDispatch(dispatch);
      },
    };
    if (mode === "realtime") {
      if (!this.config.openaiKey) {
        this.log("warn", "voice", "OPENAI_API_KEY missing — falling back to mock barge-in");
        return new MockVoiceSession(handlers);
      }
      return new RealtimeVoiceSession(handlers, { apiKey: this.config.openaiKey });
    }
    return new MockVoiceSession(handlers);
  }

  private async applyVoiceDispatch(dispatch: VoiceDispatch): Promise<void> {
    this.log("info", "voice", `dispatch ${dispatch.kind} ${dispatch.name ?? dispatch.message ?? ""}`);
    if (dispatch.kind === "abort") {
      await this.backend.handle({ type: "abort" });
      return;
    }
    if (dispatch.kind === "steer") {
      await this.backend.handle({ type: "steer", message: dispatch.message ?? "" });
      return;
    }
    if (dispatch.kind === "follow_up") {
      await this.backend.handle({ type: "follow_up", message: dispatch.message ?? "" });
      return;
    }
    const message = dispatchToRootPrompt(dispatch) ?? dispatch.message ?? "";
    if (message) await this.backend.handle({ type: "prompt", message, streamingBehavior: "steer" });
  }

  private createBackend(handlers: BackendHandlers): PrimeBackend {
    if (this.config.mode === "rpc") {
      return new RpcBackend(handlers, {
        bin: this.config.primeBin,
        args: this.config.primeArgs,
        cwd: this.config.cwd,
        sessionDir: this.config.sessionDir,
        daemonSocket: this.config.daemonSocket,
      });
    }
    return new MockBackend(handlers, this.config.cwd);
  }

  private backendHandlers(): BackendHandlers {
    return {
      onPrimeEvent: (event: PrimeEvent) => this.broadcast({ type: "prime.event", event }),
      onResponse: (response: PrimeResponse) =>
        this.broadcast({
          type: "prime.response",
          id: response.id,
          command: response.command,
          success: response.success,
          data: response.data,
          error: response.error,
        }),
      onState: (session: PrimeSessionState) => this.broadcast({ type: "workbench.state", session }),
      onSessions: (sessions: SessionSummary[]) => this.broadcast({ type: "workbench.sessions", sessions }),
      onSubagents: (tree: SubagentNode[]) => this.broadcast({ type: "workbench.subagents", tree }),
      onLog: (level, source, text) => this.log(level, source, text),
      onMessages: (messages: AgentMessage[]) => this.broadcast({ type: "workbench.messages", messages }),
    };
  }

  private log(level: LogLine["level"], source: string, text: string): void {
    const line: LogLine = {
      id: id("log"),
      ts: now(),
      level,
      source: source as LogLine["source"],
      text,
    };
    this.logs.push(line);
    if (this.logs.length > 500) this.logs.shift();
    this.broadcast({ type: "workbench.log", line });
  }

  private broadcast(event: unknown): void {
    for (const sink of this.sinks) sink(event);
  }
}
