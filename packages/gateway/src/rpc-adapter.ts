import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { randomUUID } from "node:crypto";
import type { AdapterEvent, AdapterState, PrimeAdapter } from "./adapter.js";

export interface RpcAdapterOptions {
  bin?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Spawns `prime-agent --mode rpc` and speaks strict JSONL over stdin/stdout.
 * Uses LF-only framing (not Node readline) per Prime RPC docs.
 */
export class RpcPrimeAdapter implements PrimeAdapter {
  readonly kind = "rpc" as const;
  private opts: Required<Pick<RpcAdapterOptions, "bin" | "args" | "cwd">> & { env: NodeJS.ProcessEnv };
  private proc: ChildProcessWithoutNullStreams | null = null;
  private handlers = new Set<(ev: AdapterEvent) => void>();
  private state: AdapterState;
  private buffer = "";
  private decoder = new StringDecoder("utf8");
  private currentAssistantId: string | null = null;

  constructor(opts: RpcAdapterOptions = {}) {
    this.opts = {
      bin: opts.bin ?? process.env.PRIME_BIN ?? "prime-agent",
      args: opts.args ?? (process.env.PRIME_ARGS ? process.env.PRIME_ARGS.split(/\s+/).filter(Boolean) : ["--mode", "rpc", "--no-session"]),
      cwd: opts.cwd ?? process.env.PRIME_CWD ?? process.cwd(),
      env: opts.env ?? process.env,
    };
    this.state = {
      sessionId: "pending",
      isStreaming: false,
      cwd: this.opts.cwd,
      model: null,
    };
  }

  async start(): Promise<void> {
    if (this.proc) return;
    this.emit({ kind: "terminal", stream: "system", text: `[rpc] spawning ${this.opts.bin} ${this.opts.args.join(" ")}` });
    this.proc = spawn(this.opts.bin, this.opts.args, {
      cwd: this.opts.cwd,
      env: this.opts.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8").trimEnd();
      if (text) this.emit({ kind: "terminal", stream: "stderr", text });
    });
    this.proc.on("exit", (code, signal) => {
      this.emit({ kind: "terminal", stream: "system", text: `[rpc] process exited code=${code} signal=${signal}` });
      this.proc = null;
      this.state.isStreaming = false;
      this.emit({ kind: "state", isStreaming: false, sessionId: this.state.sessionId, model: this.state.model });
    });
    // Probe state
    await this.send({ type: "get_state", id: "boot-state" });
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    try {
      this.proc.stdin.end();
    } catch { /* ignore */ }
    this.proc.kill("SIGTERM");
    this.proc = null;
  }

  onEvent(handler: (ev: AdapterEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  getState(): AdapterState {
    return { ...this.state };
  }

  async setCwd(cwd: string): Promise<void> {
    // RPC process is bound to spawn cwd; restart with new cwd.
    this.opts.cwd = cwd;
    this.state.cwd = cwd;
    await this.stop();
    await this.start();
  }

  async prompt(message: string, opts?: { streamingBehavior?: "steer" | "followUp" }): Promise<void> {
    const cmd: Record<string, unknown> = { type: "prompt", id: randomUUID(), message };
    if (opts?.streamingBehavior) cmd.streamingBehavior = opts.streamingBehavior;
    await this.send(cmd);
  }

  async steer(message: string): Promise<void> {
    await this.send({ type: "steer", id: randomUUID(), message });
  }

  async abort(): Promise<void> {
    await this.send({ type: "abort", id: randomUUID() });
  }

  async newSession(): Promise<void> {
    await this.send({ type: "new_session", id: randomUUID() });
  }

  private async send(obj: Record<string, unknown>): Promise<void> {
    if (!this.proc?.stdin.writable) throw new Error("RPC process not running");
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }

  private onStdout(chunk: Buffer | string): void {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx === -1) break;
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      this.emit({ kind: "terminal", stream: "stderr", text: `[rpc] bad json: ${line.slice(0, 120)}` });
      return;
    }
    this.emit({ kind: "raw", payload: msg });
    const t = msg.type as string;

    if (t === "response") {
      if (msg.command === "get_state" && msg.success && msg.data) {
        this.state.sessionId = msg.data.sessionId ?? this.state.sessionId;
        this.state.isStreaming = !!msg.data.isStreaming;
        this.state.model = msg.data.model?.id ?? msg.data.model ?? this.state.model;
        this.emit({ kind: "state", isStreaming: this.state.isStreaming, sessionId: this.state.sessionId, model: this.state.model });
      }
      if (!msg.success && msg.error) {
        this.emit({ kind: "error", message: String(msg.error) });
      }
      return;
    }

    if (t === "agent_start") {
      this.state.isStreaming = true;
      this.currentAssistantId = randomUUID().slice(0, 10);
      this.emit({ kind: "agent_start" });
      this.emit({ kind: "message_start", messageId: this.currentAssistantId, role: "assistant" });
      this.emit({ kind: "state", isStreaming: true, sessionId: this.state.sessionId, model: this.state.model });
      return;
    }
    if (t === "agent_end") {
      if (this.currentAssistantId) {
        this.emit({ kind: "message_end", messageId: this.currentAssistantId, content: "" });
      }
      this.currentAssistantId = null;
      this.state.isStreaming = false;
      this.emit({ kind: "agent_end" });
      this.emit({ kind: "state", isStreaming: false, sessionId: this.state.sessionId, model: this.state.model });
      return;
    }
    if (t === "message_update") {
      const ame = msg.assistantMessageEvent;
      const mid = this.currentAssistantId ?? randomUUID().slice(0, 10);
      if (!this.currentAssistantId) this.currentAssistantId = mid;
      if (ame?.type === "text_delta" && ame.delta) {
        this.emit({ kind: "text_delta", messageId: mid, delta: ame.delta });
      }
      if (ame?.type === "thinking_delta" && ame.delta) {
        this.emit({ kind: "thinking_delta", messageId: mid, delta: ame.delta });
      }
      return;
    }
    if (t === "tool_execution_start") {
      this.emit({
        kind: "tool_start",
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        args: msg.args,
      });
      this.emit({
        kind: "terminal",
        stream: msg.toolName === "ipython" || msg.toolName === "repl" ? "repl" : "system",
        text: `[tool:${msg.toolName}] start ${JSON.stringify(msg.args).slice(0, 200)}`,
      });
      return;
    }
    if (t === "tool_execution_update") {
      const partial =
        msg.partialResult?.content?.map((c: any) => c.text ?? "").join("") ??
        JSON.stringify(msg.partialResult ?? {});
      this.emit({ kind: "tool_update", toolCallId: msg.toolCallId, partial });
      return;
    }
    if (t === "tool_execution_end") {
      const result =
        msg.result?.content?.map((c: any) => c.text ?? "").join("") ??
        JSON.stringify(msg.result ?? {});
      this.emit({ kind: "tool_end", toolCallId: msg.toolCallId, result, isError: !!msg.isError });
      return;
    }
    if (t === "observed_session_event") {
      // Surface observed subagent activity lightly
      this.emit({
        kind: "terminal",
        stream: "system",
        text: `[observe ${msg.activeSessionId}] ${msg.event?.type ?? "?"}`,
        agentId: msg.activeSessionId,
      });
      return;
    }
  }

  private emit(ev: AdapterEvent): void {
    for (const h of this.handlers) h(ev);
  }
}
