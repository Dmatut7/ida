import { MockVoiceSession } from "./mock-session.js";
import { RealtimeVoiceSession } from "./realtime-session.js";
import type { VoiceMode, VoiceSession, VoiceSessionEvents } from "./types.js";

export * from "./types.js";
export { MockVoiceSession } from "./mock-session.js";
export { RealtimeVoiceSession } from "./realtime-session.js";

export interface CreateVoiceOptions {
  mode?: "auto" | VoiceMode;
  apiKey?: string;
  model?: string;
}

export function resolveVoiceMode(opts: CreateVoiceOptions): VoiceMode {
  if (opts.mode === "mock") return "mock";
  if (opts.mode === "realtime") return "realtime";
  return opts.apiKey ? "realtime" : "mock";
}

export function createVoiceSession(events: VoiceSessionEvents, opts: CreateVoiceOptions = {}): VoiceSession {
  const mode = resolveVoiceMode(opts);
  if (mode === "realtime") {
    if (!opts.apiKey) throw new Error("OPENAI_API_KEY required for realtime voice");
    return new RealtimeVoiceSession(events, { apiKey: opts.apiKey, model: opts.model });
  }
  return new MockVoiceSession(events);
}
