export type VoiceMode = "mock" | "realtime";

export interface VoiceSessionEvents {
  onState: (phase: string, extra?: Record<string, unknown>) => void;
  onTranscript: (role: "user" | "assistant", text: string, final: boolean) => void;
  onAudio: (pcm16: Buffer, sampleRate: number) => void;
  onUserSpeechStart?: () => void;
  onUserSpeechEnd?: () => void;
  onError?: (err: Error) => void;
  onDispatchPrompt?: (text: string) => void;
}

export interface VoiceSession {
  readonly mode: VoiceMode;
  start(): Promise<void>;
  stop(): Promise<void>;
  pushPcm16(chunk: Buffer, sampleRate: number): void;
  interrupt(): void;
  sendText(text: string): void;
}
