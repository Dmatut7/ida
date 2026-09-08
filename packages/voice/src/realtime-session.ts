import WebSocket from "ws";
import type { VoiceSession, VoiceSessionEvents } from "./types.js";

/**
 * OpenAI Realtime API bridge (WebSocket).
 * Architecture mirrors WebRTC+Realtime: client mic PCM16 -> gateway -> Realtime;
 * model audio + transcripts back to client; interrupt via conversation.item.truncate / response.cancel.
 */
export class RealtimeVoiceSession implements VoiceSession {
  readonly mode = "realtime" as const;
  private events: VoiceSessionEvents;
  private apiKey: string;
  private model: string;
  private ws: WebSocket | null = null;
  private running = false;

  constructor(events: VoiceSessionEvents, opts: { apiKey: string; model?: string }) {
    this.events = events;
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gpt-4o-realtime-preview";
  }

  async start(): Promise<void> {
    this.running = true;
    this.events.onState("connecting");
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.model)}`;
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    await new Promise<void>((resolve, reject) => {
      const ws = this.ws!;
      ws.once("open", () => resolve());
      ws.once("error", (e) => reject(e));
    });

    this.ws.on("message", (data) => this.onMessage(data.toString()));
    this.ws.on("close", () => {
      this.running = false;
      this.events.onState("ended");
    });
    this.ws.on("error", (err) => this.events.onError?.(err));

    this.send({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions:
          "You are the voice interface for Prime Agent workbench. Be concise. When the user asks to do coding work, summarize the task so the workbench can dispatch it to the root agent.",
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 400,
          create_response: true,
        },
      },
    });
    this.events.onState("listening");
  }

  async stop(): Promise<void> {
    this.running = false;
    this.ws?.close();
    this.ws = null;
    this.events.onState("ended");
  }

  pushPcm16(chunk: Buffer, _sampleRate: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send({
      type: "input_audio_buffer.append",
      audio: chunk.toString("base64"),
    });
  }

  interrupt(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send({ type: "response.cancel" });
    this.events.onState("interrupted");
    this.events.onState("listening");
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.events.onTranscript("user", text, true);
    this.events.onDispatchPrompt?.(text);
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    this.send({ type: "response.create" });
    this.events.onState("thinking");
  }

  private onMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "input_audio_buffer.speech_started":
        this.events.onUserSpeechStart?.();
        this.events.onState("listening", { level: 0.7 });
        break;
      case "input_audio_buffer.speech_stopped":
        this.events.onUserSpeechEnd?.();
        this.events.onState("thinking");
        break;
      case "response.audio.delta":
        if (msg.delta) {
          this.events.onState("speaking", { level: 0.6 });
          this.events.onAudio(Buffer.from(msg.delta, "base64"), 24000);
        }
        break;
      case "response.audio_transcript.delta":
        if (msg.delta) this.events.onTranscript("assistant", msg.delta, false);
        break;
      case "response.audio_transcript.done":
        if (msg.transcript) this.events.onTranscript("assistant", msg.transcript, true);
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (msg.transcript) {
          this.events.onTranscript("user", msg.transcript, true);
          this.events.onDispatchPrompt?.(msg.transcript);
        }
        break;
      case "response.done":
        this.events.onState("listening");
        break;
      case "error":
        this.events.onError?.(new Error(msg.error?.message ?? "Realtime error"));
        this.events.onState("error", { error: msg.error?.message });
        break;
      default:
        break;
    }
  }

  private send(obj: unknown): void {
    this.ws?.send(JSON.stringify(obj));
  }
}
