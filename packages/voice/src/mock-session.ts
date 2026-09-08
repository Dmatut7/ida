import type { VoiceSession, VoiceSessionEvents } from "./types.js";

/** High-fidelity mock duplex voice: VAD-ish barge-in, captions, TTS-like PCM tone bursts. */
export class MockVoiceSession implements VoiceSession {
  readonly mode = "mock" as const;
  private events: VoiceSessionEvents;
  private running = false;
  private speaking = false;
  private speakTimer: NodeJS.Timeout | null = null;
  private levelTimer: NodeJS.Timeout | null = null;
  private audioTimer: NodeJS.Timeout | null = null;
  private userBuffer = "";
  private interrupted = false;

  constructor(events: VoiceSessionEvents) {
    this.events = events;
  }

  async start(): Promise<void> {
    this.running = true;
    this.events.onState("connecting");
    await sleep(250);
    if (!this.running) return;
    this.events.onState("listening");
    this.events.onTranscript("assistant", "Mock voice ready. Speak or type — interrupt anytime.", true);
    this.levelTimer = setInterval(() => {
      if (!this.running) return;
      const level = this.speaking ? 0.55 + Math.random() * 0.4 : 0.05 + Math.random() * 0.08;
      this.events.onState(this.speaking ? "speaking" : "listening", { level });
    }, 120);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.clearTimers();
    this.events.onState("ended");
  }

  pushPcm16(chunk: Buffer, _sampleRate: number): void {
    if (!this.running || chunk.length < 64) return;
    // crude energy VAD
    let sum = 0;
    for (let i = 0; i + 1 < chunk.length; i += 2) {
      const s = chunk.readInt16LE(i);
      sum += Math.abs(s);
    }
    const avg = sum / (chunk.length / 2);
    if (avg > 1200) {
      this.events.onUserSpeechStart?.();
      if (this.speaking) this.interrupt();
      this.userBuffer += ".";
      if (this.userBuffer.length % 8 === 0) {
        this.events.onTranscript("user", "…(speech)…", false);
      }
    }
  }

  interrupt(): void {
    if (!this.speaking) return;
    this.interrupted = true;
    this.speaking = false;
    this.clearSpeak();
    this.events.onState("interrupted", { level: 0.2 });
    this.events.onTranscript("assistant", "— interrupted —", true);
    setTimeout(() => {
      if (this.running) this.events.onState("listening");
    }, 200);
  }

  sendText(text: string): void {
    if (!this.running) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    this.events.onTranscript("user", trimmed, true);
    this.events.onDispatchPrompt?.(trimmed);
    void this.speakReply(trimmed);
  }

  private async speakReply(userText: string): Promise<void> {
    this.interrupted = false;
    this.events.onState("thinking");
    await sleep(400);
    if (!this.running || this.interrupted) return;

    const reply =
      userText.toLowerCase().includes("subagent")
        ? "I'll spawn a research subagent and watch the tree while we talk."
        : `Got it: ${userText.slice(0, 120)}. Working on that now — interrupt me if you want to steer.`;

    this.speaking = true;
    this.events.onState("speaking");
    this.events.onTranscript("assistant", "", false);

    // stream captions + tone bursts
    const words = reply.split(" ");
    let acc = "";
    for (const w of words) {
      if (!this.running || this.interrupted) return;
      acc = acc ? `${acc} ${w}` : w;
      this.events.onTranscript("assistant", acc, false);
      this.emitToneBurst(0.08);
      await sleep(90 + Math.random() * 70);
    }
    if (this.interrupted || !this.running) return;
    this.events.onTranscript("assistant", reply, true);
    this.speaking = false;
    this.events.onState("listening");
  }

  private emitToneBurst(seconds: number): void {
    const sampleRate = 24000;
    const n = Math.floor(sampleRate * seconds);
    const buf = Buffer.alloc(n * 2);
    const freq = 220 + Math.random() * 180;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const env = Math.sin(Math.PI * (i / n));
      const sample = Math.floor(Math.sin(2 * Math.PI * freq * t) * env * 5000);
      buf.writeInt16LE(sample, i * 2);
    }
    this.events.onAudio(buf, sampleRate);
  }

  private clearSpeak(): void {
    if (this.speakTimer) clearTimeout(this.speakTimer);
    this.speakTimer = null;
    if (this.audioTimer) clearInterval(this.audioTimer);
    this.audioTimer = null;
  }

  private clearTimers(): void {
    this.clearSpeak();
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
