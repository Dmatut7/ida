import type { VoiceDispatch, VoicePhase } from "@ida/protocol";
import { emitState, type VoiceHandlers, type VoiceSession } from "./bridge.js";
import { parseVoiceIntent } from "./intent.js";

export class MockVoiceSession implements VoiceSession {
  readonly mode = "mock" as const;
  phase: VoicePhase = "idle";
  private handlers: VoiceHandlers;
  private energy = 0;
  private speaking = false;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUser = "";

  constructor(handlers: VoiceHandlers) {
    this.handlers = handlers;
  }

  async start(): Promise<void> {
    this.phase = "listening";
    emitState(this.handlers, this.mode, this.phase);
    this.speak(
      "Call mode ready. Mock barge-in is on — talk over me to interrupt. I can discuss requirements and dispatch Prime RLM subagents through the root agent.",
      false,
    );
  }

  async stop(): Promise<void> {
    this.clearSpeak();
    this.phase = "idle";
    this.speaking = false;
    emitState(this.handlers, this.mode, this.phase, { speaking: false, bargeIn: false });
  }

  pushAudio(pcm: Buffer): void {
    if (pcm.length < 4) return;
    let sum = 0;
    for (let i = 0; i + 1 < pcm.length; i += 2) {
      sum += Math.abs(pcm.readInt16LE(i));
    }
    this.energy = sum / (pcm.length / 2);
    if (this.speaking && this.energy > 1800) {
      this.interrupt("barge-in");
    }
  }

  interrupt(reason: "barge-in" | "user" = "user"): void {
    this.clearSpeak();
    this.speaking = false;
    this.phase = "interrupted";
    emitState(this.handlers, this.mode, this.phase, { bargeIn: true, speaking: false });
    this.handlers.onEvent({
      type: "voice.transcript",
      role: "assistant",
      text: reason === "barge-in" ? "[interrupted by barge-in]" : "[interrupted]",
      final: true,
    });
    this.phase = "listening";
    emitState(this.handlers, this.mode, this.phase);
  }

  ingestTranscript(text: string, final = true): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.lastUser = trimmed;
    this.handlers.onEvent({ type: "voice.transcript", role: "user", text: trimmed, final });
    if (!final) return;
    if (this.speaking) this.interrupt("barge-in");
    this.phase = "thinking";
    emitState(this.handlers, this.mode, this.phase);
    const dispatch = parseVoiceIntent(trimmed);
    if (!dispatch) {
      this.phase = "listening";
      emitState(this.handlers, this.mode, this.phase);
      return;
    }
    this.applyDispatch(dispatch);
  }

  private applyDispatch(dispatch: VoiceDispatch): void {
    this.handlers.onEvent({ type: "voice.dispatch", dispatch });
    this.handlers.onDispatch(dispatch);
    const spoken = speakForDispatch(dispatch, this.lastUser);
    this.speak(spoken, true);
  }

  private speak(text: string, _afterDispatch: boolean): void {
    this.clearSpeak();
    this.speaking = true;
    this.phase = "speaking";
    emitState(this.handlers, this.mode, this.phase, { speaking: true });
    this.handlers.onEvent({ type: "voice.transcript", role: "assistant", text, final: true });
    this.handlers.onEvent({ type: "voice.speak", text, interruptible: true });
    this.speakTimer = setTimeout(() => {
      this.speaking = false;
      this.phase = "listening";
      emitState(this.handlers, this.mode, this.phase, { speaking: false });
    }, Math.min(12000, 900 + text.length * 35));
  }

  private clearSpeak(): void {
    if (this.speakTimer) {
      clearTimeout(this.speakTimer);
      this.speakTimer = null;
    }
  }
}

export function speakForDispatch(dispatch: VoiceDispatch, userText: string): string {
  switch (dispatch.kind) {
    case "abort":
      return "Aborting the root agent turn.";
    case "steer":
      return `Steering the root agent: ${dispatch.message ?? userText}`;
    case "follow_up":
      return `Queued a follow-up for when the root agent finishes: ${dispatch.message ?? userText}`;
    case "dispatch_subagent":
      return `Dispatching RLM child “${dispatch.name}” through the root agent. The parent will call rlm() — I will not run the work myself.`;
    default:
      return `Sending that to the root Prime Agent: ${dispatch.message ?? userText}`;
  }
}
