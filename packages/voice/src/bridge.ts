import type { VoiceDispatch, VoiceMode, VoicePhase, VoiceServerEvent } from "@ida/protocol";

export interface VoiceHandlers {
  onEvent(event: VoiceServerEvent): void;
  onDispatch(dispatch: VoiceDispatch): void;
}

export interface VoiceSession {
  readonly mode: VoiceMode;
  readonly phase: VoicePhase;
  start(): Promise<void>;
  stop(): Promise<void>;
  pushAudio(pcm: Buffer): void;
  interrupt(reason?: "barge-in" | "user"): void;
  ingestTranscript(text: string, final?: boolean): void;
}

export function emitState(
  handlers: VoiceHandlers,
  mode: VoiceMode,
  phase: VoicePhase,
  extra: { bargeIn?: boolean; speaking?: boolean } = {},
): void {
  handlers.onEvent({
    type: "voice.state",
    mode,
    phase,
    bargeIn: extra.bargeIn ?? phase === "interrupted",
    speaking: extra.speaking ?? phase === "speaking",
  });
}
