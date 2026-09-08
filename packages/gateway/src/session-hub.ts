import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  type ChatMessage,
  type ClientMessage,
  type ServerMessage,
  type SessionState,
  type SubagentNode,
  type TerminalLine,
  type VoiceUiState,
} from "@prime-workbench/protocol";
import { createVoiceSession, type VoiceSession } from "@prime-workbench/voice";
import type { AdapterEvent, PrimeAdapter } from "./adapter.js";

export class SessionHub {
  private adapter: PrimeAdapter;
  private sockets = new Set<WebSocket>();
  private messages = new Map<string, ChatMessage>();
  private order: string[] = [];
  private tree: SubagentNode | null = null;
  private voice: VoiceSession | null = null;
  private voiceUi: VoiceUiState = {
    phase: "idle",
    mode: "mock",
    captions: "",
    userPartial: "",
    level: 0,
  };
  private unsub: (() => void) | null = null;

  constructor(adapter: PrimeAdapter) {
    this.adapter = adapter;
  }

  async start(): Promise<void> {
    this.unsub = this.adapter.onEvent((ev) => this.onAdapterEvent(ev));
    await this.adapter.start();
  }

  async stop(): Promise<void> {
    this.unsub?.();
    await this.voice?.stop();
    await this.adapter.stop();
  }

  addSocket(ws: WebSocket): void {
    this.sockets.add(ws);
    ws.on("message", (data) => {
      void this.onClientMessage(ws, data.toString());
    });
    ws.on("close", () => this.sockets.delete(ws));
    this.send(ws, {
      type: "hello_ok",
      protocolVersion: PROTOCOL_VERSION,
      state: this.snapshotState(),
    });
    for (const id of this.order) {
      const m = this.messages.get(id);
      if (m) this.send(ws, { type: "chat_upsert", message: m });
    }
    if (this.tree) this.send(ws, { type: "subagent_tree", root: this.tree });
    this.send(ws, { type: "voice_state", state: this.voiceUi });
  }

  private snapshotState(): SessionState {
    const st = this.adapter.getState();
    return {
      sessionId: st.sessionId,
      mode: this.adapter.kind,
      cwd: st.cwd,
      isStreaming: st.isStreaming,
      model: st.model,
      connected: true,
      voiceMode: this.voiceUi.mode,
    };
  }

  private async onClientMessage(ws: WebSocket, raw: string): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      this.send(ws, { type: "error", message: "invalid JSON" });
      return;
    }
    try {
      switch (msg.type) {
        case "hello":
          this.send(ws, { type: "hello_ok", protocolVersion: PROTOCOL_VERSION, state: this.snapshotState() });
          break;
        case "prompt": {
          const user: ChatMessage = {
            id: msg.id || randomUUID(),
            role: "user",
            content: msg.message,
            timestamp: Date.now(),
          };
          this.upsertChat(user);
          await this.adapter.prompt(msg.message, { streamingBehavior: msg.streamingBehavior });
          this.send(ws, { type: "response", id: msg.id, success: true, command: "prompt" });
          break;
        }
        case "steer":
          await this.adapter.steer(msg.message);
          this.send(ws, { type: "response", id: msg.id, success: true, command: "steer" });
          break;
        case "abort":
          await this.adapter.abort();
          if (msg.id) this.send(ws, { type: "response", id: msg.id, success: true, command: "abort" });
          break;
        case "new_session":
          this.messages.clear();
          this.order = [];
          await this.adapter.newSession();
          this.broadcast({ type: "state", state: this.snapshotState() });
          if (msg.id) this.send(ws, { type: "response", id: msg.id, success: true, command: "new_session" });
          break;
        case "set_cwd":
          await this.adapter.setCwd(msg.cwd);
          this.broadcast({ type: "state", state: this.snapshotState() });
          break;
        case "get_state":
          this.send(ws, { type: "state", state: this.snapshotState() });
          break;
        case "voice_start":
          await this.startVoice(msg.mode);
          this.send(ws, { type: "response", id: msg.id, success: true, command: "voice_start" });
          break;
        case "voice_stop":
          await this.stopVoice();
          break;
        case "voice_audio":
          if (this.voice) {
            this.voice.pushPcm16(Buffer.from(msg.pcm16Base64, "base64"), msg.sampleRate);
          }
          break;
        case "voice_interrupt":
          this.voice?.interrupt();
          break;
        case "voice_text":
          this.voice?.sendText(msg.text);
          break;
        default:
          break;
      }
    } catch (err: any) {
      this.send(ws, { type: "error", message: err?.message ?? String(err), id: (msg as any).id });
    }
  }

  private async startVoice(mode?: "mock" | "realtime"): Promise<void> {
    await this.stopVoice();
    const apiKey = process.env.OPENAI_API_KEY;
    const preferred = mode ?? (process.env.VOICE_MODE as any) ?? "auto";
    this.voice = createVoiceSession(
      {
        onState: (phase, extra) => {
          this.voiceUi = {
            ...this.voiceUi,
            phase: phase as any,
            level: typeof extra?.level === "number" ? extra.level : this.voiceUi.level,
            error: typeof extra?.error === "string" ? extra.error : this.voiceUi.error,
          };
          this.broadcast({ type: "voice_state", state: this.voiceUi });
        },
        onTranscript: (role, text, final) => {
          if (role === "assistant") {
            this.voiceUi = { ...this.voiceUi, captions: text };
          } else {
            this.voiceUi = { ...this.voiceUi, userPartial: text };
          }
          this.broadcast({ type: "voice_transcript", role, text, final });
          this.broadcast({ type: "voice_state", state: this.voiceUi });
        },
        onAudio: (pcm16, sampleRate) => {
          this.broadcast({
            type: "voice_audio",
            pcm16Base64: pcm16.toString("base64"),
            sampleRate,
          });
        },
        onDispatchPrompt: (text) => {
          const user: ChatMessage = {
            id: randomUUID(),
            role: "user",
            content: `[voice] ${text}`,
            timestamp: Date.now(),
          };
          this.upsertChat(user);
          void this.adapter.prompt(text);
        },
        onError: (err) => {
          this.voiceUi = { ...this.voiceUi, phase: "error", error: err.message };
          this.broadcast({ type: "voice_state", state: this.voiceUi });
        },
      },
      {
        mode: preferred === "auto" ? "auto" : preferred,
        apiKey,
        model: process.env.OPENAI_REALTIME_MODEL,
      },
    );
    this.voiceUi = {
      phase: "connecting",
      mode: this.voice.mode,
      captions: "",
      userPartial: "",
      level: 0,
    };
    this.broadcast({ type: "voice_state", state: this.voiceUi });
    await this.voice.start();
  }

  private async stopVoice(): Promise<void> {
    if (!this.voice) return;
    await this.voice.stop();
    this.voice = null;
    this.voiceUi = { phase: "ended", mode: this.voiceUi.mode, captions: "", userPartial: "", level: 0 };
    this.broadcast({ type: "voice_state", state: this.voiceUi });
  }

  private onAdapterEvent(ev: AdapterEvent): void {
    switch (ev.kind) {
      case "text_delta": {
        const existing = this.messages.get(ev.messageId);
        if (!existing) {
          this.upsertChat({
            id: ev.messageId,
            role: "assistant",
            content: ev.delta,
            streaming: true,
            timestamp: Date.now(),
          });
        } else {
          this.upsertChat({ ...existing, content: existing.content + ev.delta, streaming: true });
        }
        this.broadcast({ type: "chat_delta", id: ev.messageId, delta: ev.delta, field: "content" });
        break;
      }
      case "thinking_delta": {
        const existing = this.messages.get(ev.messageId);
        if (!existing) {
          this.upsertChat({
            id: ev.messageId,
            role: "assistant",
            content: "",
            thinking: ev.delta,
            streaming: true,
            timestamp: Date.now(),
          });
        } else {
          this.upsertChat({
            ...existing,
            thinking: (existing.thinking ?? "") + ev.delta,
            streaming: true,
          });
        }
        this.broadcast({ type: "chat_delta", id: ev.messageId, delta: ev.delta, field: "thinking" });
        break;
      }
      case "message_start":
        this.upsertChat({
          id: ev.messageId,
          role: "assistant",
          content: "",
          streaming: true,
          timestamp: Date.now(),
        });
        break;
      case "message_end": {
        const existing = this.messages.get(ev.messageId);
        if (existing) {
          this.upsertChat({
            ...existing,
            content: existing.content || ev.content,
            streaming: false,
          });
        }
        this.broadcast({ type: "chat_done", id: ev.messageId });
        break;
      }
      case "tool_start":
        this.broadcast({
          type: "tool_start",
          toolCallId: ev.toolCallId,
          toolName: ev.toolName,
          args: ev.args,
          agentId: ev.agentId,
        });
        this.pushTerminal({
          id: randomUUID(),
          stream: "system",
          text: `▶ ${ev.toolName} ${JSON.stringify(ev.args).slice(0, 180)}`,
          timestamp: Date.now(),
          agentId: ev.agentId,
        });
        break;
      case "tool_update":
        this.broadcast({ type: "tool_update", toolCallId: ev.toolCallId, partial: ev.partial });
        break;
      case "tool_end":
        this.broadcast({
          type: "tool_end",
          toolCallId: ev.toolCallId,
          result: ev.result,
          isError: ev.isError,
        });
        this.pushTerminal({
          id: randomUUID(),
          stream: ev.isError ? "stderr" : "stdout",
          text: ev.result.slice(0, 500),
          timestamp: Date.now(),
        });
        break;
      case "terminal":
        this.pushTerminal({
          id: randomUUID(),
          stream: ev.stream,
          text: ev.text,
          timestamp: Date.now(),
          agentId: ev.agentId,
        });
        break;
      case "subagent_tree":
        this.tree = ev.root;
        this.broadcast({ type: "subagent_tree", root: ev.root });
        break;
      case "subagent_upsert":
        this.broadcast({ type: "subagent_upsert", node: ev.node });
        break;
      case "diff":
        this.broadcast({ type: "diff", files: ev.files });
        break;
      case "error":
        this.broadcast({ type: "error", message: ev.message });
        break;
      case "state":
        this.broadcast({ type: "state", state: this.snapshotState() });
        break;
      case "agent_start":
      case "agent_end":
      case "raw":
        break;
    }
  }

  private upsertChat(message: ChatMessage): void {
    if (!this.messages.has(message.id)) this.order.push(message.id);
    this.messages.set(message.id, message);
    this.broadcast({ type: "chat_upsert", message });
  }

  private pushTerminal(line: TerminalLine): void {
    this.broadcast({ type: "terminal", line });
  }

  private broadcast(msg: ServerMessage): void {
    const raw = JSON.stringify(msg);
    for (const ws of this.sockets) {
      if (ws.readyState === ws.OPEN) ws.send(raw);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
}
