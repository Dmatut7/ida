import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { encodeJsonl, isPrimeResponse, type AgentMessage, type ClientCommand, type ModelInfo, type PrimeCommand, type PrimeEvent, type PrimeSessionState, type SessionSummary, type SubagentNode } from "@ida/protocol";
import { attachJsonlReader } from "../jsonl-reader.js";
import { id, now } from "../util.js";
import { DEFAULT_MODELS, type BackendHandlers, type PrimeBackend } from "./types.js";
import { scanPrimeSessions } from "../sessions.js";

export interface RpcBackendOptions {
  bin: string;
  args: string[];
  cwd: string;
  sessionDir?: string;
  daemonSocket?: string;
}

export class RpcBackend implements PrimeBackend {
  readonly mode = "rpc" as const;
  private handlers: BackendHandlers;
  private options: RpcBackendOptions;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, (res: { success: boolean; data?: unknown; error?: string }) => void>();
  private state: PrimeSessionState;
  private messages: AgentMessage[] = [];
  private sessions: SessionSummary[] = [];
  private subagents: SubagentNode[] = [];
  private models: ModelInfo[] = DEFAULT_MODELS;
  private req = 0;

  constructor(handlers: BackendHandlers, options: RpcBackendOptions) {
    this.handlers = handlers;
    this.options = options;
    this.state = {
      model: null,
      thinkingLevel: "medium",
      isStreaming: false,
      isCompacting: false,
      steeringMode: "one-at-a-time",
      followUpMode: "one-at-a-time",
      sessionId: id("sess"),
      autoCompactionEnabled: true,
      messageCount: 0,
      unfinishedActionCount: 0,
      sessionActions: { queuedCount: 0, steering: [], followUps: [] },
      cwd: options.cwd,
    };
  }

  async start(): Promise<void> {
    const bin = this.options.bin;
    if (!commandExists(bin)) {
      throw new Error(
        `prime-agent binary not found: ${bin}. Install Dmatut7/prime-agent-rlm (branch merge/repl-kernel) or set PRIME_AGENT_BIN. Mock mode: PRIME_MODE=mock.`,
      );
    }
    const args = ["--mode", "rpc", ...this.options.args];
    if (this.options.sessionDir) args.push("--session-dir", this.options.sessionDir);
    this.handlers.onLog("info", "gateway", `spawn ${bin} ${args.join(" ")} cwd=${this.options.cwd}`);
    this.proc = spawn(bin, args, {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...(this.options.daemonSocket ? { PRIME_AGENT_DAEMON_SOCKET: this.options.daemonSocket } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim()) this.handlers.onLog("warn", "prime", line);
      }
    });
    attachJsonlReader(this.proc.stdout, (line) => this.onLine(line));
    this.proc.on("exit", (code) => {
      this.handlers.onLog("error", "gateway", `prime-agent exited ${code}`);
    });
    await this.refresh();
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    this.proc.stdin.end();
    this.proc.kill("SIGTERM");
    this.proc = null;
  }

  getState(): PrimeSessionState {
    return this.state;
  }

  getMessages(): AgentMessage[] {
    return this.messages;
  }

  getSessions(): SessionSummary[] {
    return this.sessions;
  }

  getSubagents(): SubagentNode[] {
    return this.subagents;
  }

  getModels(): ModelInfo[] {
    return this.models;
  }

  getCwd(): string {
    return this.state.cwd;
  }

  async handle(command: ClientCommand): Promise<void> {
    switch (command.type) {
      case "prompt":
        await this.rpc({
          type: "prompt",
          message: command.message,
          images: command.images,
          streamingBehavior: command.streamingBehavior,
        });
        break;
      case "steer":
        await this.rpc({ type: "steer", message: command.message });
        break;
      case "follow_up":
        await this.rpc({ type: "follow_up", message: command.message });
        break;
      case "abort":
        await this.rpc({ type: "abort" });
        break;
      case "new_session":
        await this.rpc({ type: "new_session" });
        if (command.name) await this.rpc({ type: "set_session_name", name: command.name });
        await this.refresh();
        break;
      case "switch_session":
        await this.rpc({ type: "switch_session", sessionPath: command.sessionId });
        await this.refresh();
        break;
      case "set_cwd":
        this.options.cwd = command.cwd;
        this.state.cwd = command.cwd;
        this.handlers.onLog(
          "warn",
          "gateway",
          "cwd change in rpc mode restarts the Prime RPC process so the worker/kernel inherit the directory.",
        );
        await this.stop();
        await this.start();
        break;
      case "set_model":
        await this.rpc({ type: "set_model", provider: command.provider, modelId: command.modelId });
        break;
      case "set_thinking_level":
        await this.rpc({ type: "set_thinking_level", level: command.level });
        break;
      case "set_session_name":
        await this.rpc({ type: "set_session_name", name: command.name });
        break;
      case "bash":
        await this.rpc({ type: "bash", command: command.command });
        break;
      case "abort_bash":
        await this.rpc({ type: "abort_bash" });
        break;
      case "observe":
        await this.rpc({ type: "observe", activeSessionId: command.activeSessionId });
        break;
      case "unobserve":
        await this.rpc({ type: "unobserve", activeSessionId: command.activeSessionId });
        break;
      case "compact":
        await this.rpc({ type: "compact", customInstructions: command.customInstructions });
        break;
      case "get_state":
      case "list_sessions":
      case "get_messages":
        await this.refresh();
        break;
      default:
        break;
    }
  }

  private async refresh(): Promise<void> {
    try {
      const state = await this.rpc({ type: "get_state" });
      if (state.success && state.data && typeof state.data === "object") {
        this.state = { ...this.state, ...(state.data as PrimeSessionState), cwd: this.options.cwd };
      }
    } catch (err) {
      this.handlers.onLog("warn", "gateway", `get_state: ${String(err)}`);
    }
    try {
      const models = await this.rpc({ type: "get_available_models" });
      const list = (models.data as { models?: ModelInfo[] } | undefined)?.models;
      if (models.success && list?.length) this.models = list;
    } catch {
      /* optional */
    }
    try {
      const msgs = await this.rpc({ type: "get_messages" });
      const list = (msgs.data as { messages?: AgentMessage[] } | undefined)?.messages;
      if (msgs.success && list) {
        this.messages = list;
        this.handlers.onMessages(list);
      }
    } catch {
      /* optional */
    }
    this.sessions = scanPrimeSessions(this.options.sessionDir);
    if (!this.sessions.some((s) => s.id === this.state.sessionId)) {
      this.sessions.unshift({
        id: this.state.sessionId,
        name: this.state.sessionName ?? this.state.sessionId,
        cwd: this.state.cwd,
        updatedAt: now(),
        messageCount: this.state.messageCount,
        streaming: this.state.isStreaming,
        source: "rpc",
        sessionFile: this.state.sessionFile,
      });
    }
    this.handlers.onState(this.state);
    this.handlers.onSessions(this.sessions);
    this.handlers.onSubagents(this.subagents);
  }

  private rpc(command: PrimeCommand): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin.writable) {
        reject(new Error("prime-agent RPC stdin is closed"));
        return;
      }
      const requestId = command.id ?? `req_${++this.req}`;
      this.pending.set(requestId, resolve);
      this.proc.stdin.write(encodeJsonl({ ...command, id: requestId }), (err) => {
        if (err) {
          this.pending.delete(requestId);
          reject(err);
        }
      });
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          resolve({ success: false, error: `timeout waiting for ${command.type}` });
        }
      }, 30_000);
    });
  }

  private onLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      this.handlers.onLog("warn", "prime", `non-json: ${line.slice(0, 200)}`);
      return;
    }
    if (isPrimeResponse(value)) {
      const resolver = value.id ? this.pending.get(value.id) : undefined;
      if (resolver) {
        this.pending.delete(value.id!);
        resolver(value);
      }
      this.handlers.onResponse(value);
      return;
    }
    const event = value as PrimeEvent;
    this.ingestEvent(event);
    this.handlers.onPrimeEvent(event);
  }

  private ingestEvent(event: PrimeEvent): void {
    if (event.type === "agent_start") {
      this.state.isStreaming = true;
      this.handlers.onState(this.state);
    }
    if (event.type === "agent_end") {
      this.state.isStreaming = false;
      this.handlers.onState(this.state);
    }
    if (event.type === "session_action_update") {
      this.state.sessionActions = event.actions;
      this.handlers.onState(this.state);
    }
    if (event.type === "message_end") {
      this.messages.push(event.message);
    }
    if (event.type === "tool_execution_start") {
      this.maybeAdmitSubagent(event.toolName, event.args);
      this.handlers.onLog("info", "repl", `${event.toolName} ${summarizeArgs(event.args)}`);
    }
    if (event.type === "observed_session_event") {
      this.touchObserved(event.activeSessionId, event.event);
    }
    if (event.type === "observed_session_closed") {
      this.subagents = this.subagents.map((n) =>
        n.sessionId === event.activeSessionId || n.id === event.activeSessionId
          ? { ...n, status: "completed", updatedAt: now() }
          : n,
      );
      this.handlers.onSubagents(this.subagents);
    }
  }

  private maybeAdmitSubagent(toolName: string, args: Record<string, unknown>): void {
    const code = String(args.code ?? args.command ?? "");
    const matches = [...code.matchAll(/rlm\s*\(\s*(['"`])([\s\S]*?)\1[\s\S]*?name\s*=\s*(['"`])([^'"`]+)\3/g)].map(
      (m) => ({ task: m[2] ?? "rlm child", name: m[4] ?? "" }),
    );
    if (!matches.length && !/rlm\s*\(/.test(code) && toolName !== "rlm") return;
    if (!matches.length && (/rlm\s*\(/.test(code) || toolName === "rlm")) {
      matches.push({ task: "spawned work", name: `child-${this.subagents.length + 1}` });
    }
    let changed = false;
    for (const match of matches) {
      const name = match.name || `child-${this.subagents.length + 1}`;
      if (this.subagents.some((n) => n.name === name && n.status === "running")) continue;
      this.subagents.push({
        id: id("rlm"),
        name,
        status: "running",
        parentId: this.state.sessionId,
        depth: 1,
        lastEvent: "admitted",
        lastMessage: match.task,
        toolName,
        source: "rlm",
        startedAt: now(),
        updatedAt: now(),
        children: [],
      });
      changed = true;
      void this.rpc({ type: "observe", activeSessionId: name }).catch(() => undefined);
    }
    if (changed) this.handlers.onSubagents(this.subagents);
  }

  private touchObserved(activeSessionId: string, event: PrimeEvent): void {
    this.subagents = this.subagents.map((n) => {
      if (n.sessionId !== activeSessionId && n.id !== activeSessionId && n.name !== activeSessionId) {
        return n;
      }
      return {
        ...n,
        status: "running",
        lastEvent: event.type,
        updatedAt: now(),
      };
    });
    this.handlers.onSubagents(this.subagents);
  }
}

function summarizeArgs(args: Record<string, unknown>): string {
  const code = args.code ?? args.command;
  if (typeof code === "string") return code.replace(/\s+/g, " ").slice(0, 160);
  return JSON.stringify(args).slice(0, 160);
}

function commandExists(bin: string): boolean {
  if (bin.includes("/") || bin.includes("\\")) return existsSync(bin);
  const path = process.env.PATH ?? "";
  return path.split(":").some((dir) => existsSync(`${dir}/${bin}`));
}
