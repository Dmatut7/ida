import { VOICE_TOOLS, type VoiceDispatch, type VoicePhase } from "@ida/protocol";
import WebSocket from "ws";
import { emitState, type VoiceHandlers, type VoiceSession } from "./bridge.js";

const REALTIME_URL = "wss://api.openai.com/v1/realtime";

export interface RealtimeOptions {
  apiKey: string;
  model?: string;
  voice?: string;
}

export class RealtimeVoiceSession implements VoiceSession {
  readonly mode = "realtime" as const;
  phase: VoicePhase = "idle";
  private handlers: VoiceHandlers;
  private options: RealtimeOptions;
  private socket: WebSocket | null = null;
  private speaking = false;

  constructor(handlers: VoiceHandlers, options: RealtimeOptions) {
    this.handlers = handlers;
    this.options = options;
  }

  async start(): Promise<void> {
    const model = this.options.model ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview";
    const voice = this.options.voice ?? process.env.OPENAI_REALTIME_VOICE ?? "alloy";
    this.phase = "connecting";
    emitState(this.handlers, this.mode, this.phase);

    const url = `${REALTIME_URL}?model=${encodeURIComponent(model)}`;
    this.socket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Realtime connect timeout")), 15_000);
      this.socket?.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket?.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    this.socket.on("message", (raw) => {
      this.onMessage(String(raw));
    });
    this.socket.on("close", () => {
      this.phase = "idle";
      emitState(this.handlers, this.mode, this.phase);
    });

    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: [
          "You are 伊达 (ida) voice inside Prime Workbench.",
          "You discuss requirements with the user. You do not execute code, files, or shell yourself.",
          "All execution goes through the root Prime Agent (RLM + Python REPL + recursive subagents).",
          "When the user wants work done, call dispatch_subagent so the root agent can rlm() a child.",
          "Use steer_root / follow_up_root / abort_root to control a running root turn.",
          "Keep spoken replies short. Prefer Chinese if the user speaks Chinese.",
          "Never claim to be OpenAI Codex or Codex Desktop.",
        ].join(" "),
        voice,
        modalities: ["text", "audio"],
        turn_detection: { type: "server_vad", interrupt_response: true },
        input_audio_transcription: { model: "whisper-1" },
        tools: VOICE_TOOLS.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    });

    this.phase = "listening";
    emitState(this.handlers, this.mode, this.phase);
  }

  async stop(): Promise<void> {
    this.socket?.close();
    this.socket = null;
    this.speaking = false;
    this.phase = "idle";
    emitState(this.handlers, this.mode, this.phase, { speaking: false });
  }

  pushAudio(pcm: Buffer): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.send({ type: "input_audio_buffer.append", audio: pcm.toString("base64") });
  }

  interrupt(_reason: "barge-in" | "user" = "user"): void {
    this.send({ type: "response.cancel" });
    this.speaking = false;
    this.phase = "interrupted";
    emitState(this.handlers, this.mode, this.phase, { bargeIn: true, speaking: false });
    this.phase = "listening";
    emitState(this.handlers, this.mode, this.phase);
  }

  ingestTranscript(text: string, final = true): void {
    if (!final || !text.trim()) return;
    this.handlers.onEvent({ type: "voice.transcript", role: "user", text: text.trim(), final: true });
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: text.trim() }],
      },
    });
    this.send({ type: "response.create" });
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private onMessage(raw: string): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = String(event.type ?? "");

    if (type === "input_audio_buffer.speech_started") {
      if (this.speaking) {
        this.interrupt("barge-in");
      } else {
        this.phase = "listening";
        emitState(this.handlers, this.mode, this.phase);
      }
    }

    if (type === "response.audio.delta" && typeof event.delta === "string") {
      this.speaking = true;
      this.phase = "speaking";
      emitState(this.handlers, this.mode, this.phase, { speaking: true });
      this.handlers.onEvent({ type: "voice.audio", pcm: event.delta, mime: "audio/pcm" });
    }

    if (
      type === "response.audio_transcript.delta" ||
      type === "response.output_audio_transcript.delta"
    ) {
      const delta = String(event.delta ?? "");
      if (delta) {
        this.handlers.onEvent({ type: "voice.transcript", role: "assistant", text: delta, final: false });
      }
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" &&
      typeof event.transcript === "string"
    ) {
      this.handlers.onEvent({
        type: "voice.transcript",
        role: "user",
        text: event.transcript,
        final: true,
      });
    }

    if (type === "response.function_call_arguments.done" || type === "response.output_item.done") {
      const name = String(event.name ?? (event.item as { name?: string } | undefined)?.name ?? "");
      const rawArgs = String(
        event.arguments ?? (event.item as { arguments?: string } | undefined)?.arguments ?? "",
      );
      if (name) this.handleTool(name, rawArgs);
    }

    if (type === "error") {
      const message = JSON.stringify(event.error ?? event);
      this.handlers.onEvent({ type: "voice.error", message });
      this.phase = "error";
      emitState(this.handlers, this.mode, this.phase);
    }

    if (type === "response.done") {
      this.speaking = false;
      this.phase = "listening";
      emitState(this.handlers, this.mode, this.phase, { speaking: false });
    }
  }

  private handleTool(name: string, rawArgs: string): void {
    let args: Record<string, unknown> = {};
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }
    const dispatch = toolToDispatch(name, args);
    if (!dispatch) return;
    this.handlers.onEvent({ type: "voice.dispatch", dispatch });
    this.handlers.onDispatch(dispatch);
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: undefined,
        output: JSON.stringify({ ok: true, forwarded: dispatch.kind }),
      },
    });
  }
}

export function toolToDispatch(name: string, args: Record<string, unknown>): VoiceDispatch | null {
  switch (name) {
    case "dispatch_subagent":
      return {
        kind: "dispatch_subagent",
        name: String(args.name ?? "worker"),
        task: String(args.task ?? args.summary ?? ""),
      };
    case "steer_root":
      return { kind: "steer", message: String(args.message ?? "") };
    case "follow_up_root":
      return { kind: "follow_up", message: String(args.message ?? "") };
    case "abort_root":
      return { kind: "abort" };
    case "discuss_requirements":
      return {
        kind: "prompt",
        message: `Voice discussed requirements: ${String(args.summary ?? "")}`,
      };
    default:
      return null;
  }
}
