import { useEffect, useRef, useState } from "react";
import type { VoiceUiState } from "@prime-workbench/protocol";
import { MicCapture, PcmPlayer } from "../lib/audio";
import type { GatewaySocket } from "../lib/ws";

type Send = GatewaySocket["send"];

export function CallOverlay({
  open,
  voice,
  send,
  onClose,
}: {
  open: boolean;
  voice: VoiceUiState;
  send: Send;
  onClose: () => void;
}) {
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef(new PcmPlayer());
  const [text, setText] = useState("");
  const [micOn, setMicOn] = useState(false);

  useEffect(() => {
    if (!open) return;
    send({ type: "voice_start", id: crypto.randomUUID() });
    return () => {
      micRef.current?.stop();
      playerRef.current.interrupt();
      send({ type: "voice_stop" });
      setMicOn(false);
    };
  }, [open, send]);

  // Listen for audio via custom event from App — simpler: App passes last audio through voice callbacks.
  // We hook a window event that App dispatches.
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { pcm16Base64: string; sampleRate: number };
      if (voice.phase === "interrupted") return;
      playerRef.current.playBase64(detail.pcm16Base64, detail.sampleRate);
    };
    window.addEventListener("pw-voice-audio", handler as EventListener);
    return () => window.removeEventListener("pw-voice-audio", handler as EventListener);
  }, [voice.phase]);

  if (!open) return null;

  const bars = Array.from({ length: 16 }, (_, i) => i);

  async function toggleMic() {
    if (micOn) {
      micRef.current?.stop();
      micRef.current = null;
      setMicOn(false);
      return;
    }
    const mic = new MicCapture();
    micRef.current = mic;
    await mic.start((b64, sampleRate) => {
      send({ type: "voice_audio", pcm16Base64: b64, sampleRate });
    });
    setMicOn(true);
  }

  function interrupt() {
    playerRef.current.interrupt();
    send({ type: "voice_interrupt" });
  }

  function sendText() {
    const t = text.trim();
    if (!t) return;
    send({ type: "voice_text", text: t });
    setText("");
  }

  return (
    <div className="call-overlay" onClick={onClose}>
      <div className="call-card" onClick={(e) => e.stopPropagation()}>
        <h2>Voice Call · Prime</h2>
        <div className="call-sub">
          mode={voice.mode} · phase={voice.phase}
          {voice.error ? ` · ${voice.error}` : ""}
          {" · "}
          interruptible duplex (Realtime or mock barge-in)
        </div>
        <div className="wave" aria-hidden>
          {bars.map((i) => (
            <span
              key={i}
              style={{
                animationDelay: `${i * 0.05}s`,
                height: `${12 + voice.level * 40 * ((i % 5) + 1)}px`,
                opacity: voice.phase === "speaking" || micOn ? 1 : 0.35,
              }}
            />
          ))}
        </div>
        <div className="captions">
          {voice.userPartial && (
            <div style={{ color: "var(--muted)", marginBottom: 6 }}>You: {voice.userPartial}</div>
          )}
          <div>{voice.captions || "…"}</div>
        </div>
        <div className="call-actions">
          <button className={`mic ${micOn ? "hot" : ""}`} onClick={() => void toggleMic()} title="Toggle mic">
            🎙
          </button>
          <button className="danger" onClick={interrupt}>
            Interrupt
          </button>
          <button onClick={onClose}>Hang up</button>
        </div>
        <div className="call-text">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type to talk (works in mock without mic)…"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendText();
            }}
          />
          <button className="primary" onClick={sendText}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
