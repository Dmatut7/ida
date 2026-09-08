import { PhoneOff, MicOff, Mic, Slash } from "lucide-react";
import { useEffect, useRef } from "react";
import { copy } from "../lib/i18n";
import { useStore } from "../lib/store";

export function CallMode() {
  const { ui, setUi, voice, send, hello, locale } = useStore();
  const t = copy[locale];
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<{ stop?: () => void } | null>(null);

  useEffect(() => {
    if (!ui.call) return;
    const mode = hello?.voice.realtimeConfigured ? "realtime" : "mock";
    send({ type: "voice.start", mode });
    void startMic();
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      send({ type: "voice.stop" });
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.call]);

  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 24000 });
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      src.connect(proc);
      proc.connect(ctx.destination);
      proc.onaudioprocess = (ev) => {
        if (useStore.getState().voice.muted) return;
        const input = ev.inputBuffer.getChannelData(0);
        const pcm = floatTo16(input);
        useStore.getState().send({ type: "voice.audio", pcm: pcmToBase64(pcm) });
      };
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        const rec = new SpeechRec();
        rec.lang = useStore.getState().locale === "zh" ? "zh-CN" : "en-US";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e) => {
          const last = e.results[e.results.length - 1];
          if (!last) return;
          useStore.getState().send({
            type: "voice.transcript",
            text: last[0]?.transcript ?? "",
            final: last.isFinal,
          });
        };
        rec.start();
        recRef.current = rec;
      }
    } catch {
      /* mic optional — typed transcripts still work */
    }
  }

  if (!ui.call) return null;
  const phase = voice.phase;
  return (
    <div className="call-overlay" role="dialog" aria-label={t.call}>
      <div className="call-card">
        <div>{t.call} · {voice.mode === "realtime" ? t.voiceRealtime : t.voiceMock}</div>
        <div className={`wave ${phase}`}>
          <i /><i /><i /><i /><i />
        </div>
        <strong>
          {phase === "speaking" ? t.speaking : phase === "interrupted" ? t.bargeIn : t.listening}
        </strong>
        <p className="hint">{t.voiceHint}</p>
        <div className="transcripts">
          {voice.transcripts.slice(-8).map((line, i) => (
            <div key={i}>
              <b>{line.role}:</b> {line.text}
            </div>
          ))}
        </div>
        <VoiceTypeIn />
        <div className="call-actions">
          <button className="chip" onClick={() => useStore.setState((s) => ({ voice: { ...s.voice, muted: !s.voice.muted } }))}>
            {voice.muted ? <MicOff size={14} /> : <Mic size={14} />} {t.mute}
          </button>
          <button className="chip" onClick={() => send({ type: "voice.interrupt", reason: "user" })}>
            <Slash size={14} /> {t.interrupt}
          </button>
          <button
            className="chip danger"
            onClick={() => {
              setUi({ call: false });
              send({ type: "voice.stop" });
            }}
          >
            <PhoneOff size={14} /> {t.hangup}
          </button>
        </div>
      </div>
    </div>
  );
}

function VoiceTypeIn() {
  const { locale } = useStore();
  const t = copy[locale];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const text = String(data.get("say") ?? "").trim();
        if (!text) return;
        useStore.getState().send({ type: "voice.transcript", text, final: true });
        form.reset();
      }}
    >
      <input name="say" className="search" placeholder={t.placeholder} />
    </form>
  );
}

function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
