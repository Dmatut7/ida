import { ArrowUp, FolderOpen, Phone, Square } from "lucide-react";
import { useRef } from "react";
import { copy } from "../lib/i18n";
import { useStore } from "../lib/store";

export function Composer() {
  const {
    composer,
    setComposer,
    composerMode,
    setComposerMode,
    session,
    locale,
    submit,
    send,
    setUi,
    models,
  } = useStore();
  const t = copy[locale];
  const ref = useRef<HTMLTextAreaElement>(null);
  const streaming = Boolean(session?.isStreaming);

  return (
    <div className="composer-dock">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={ref}
          rows={2}
          value={composer}
          placeholder={t.placeholder}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (e.altKey) setComposerMode("follow_up");
              submit();
            }
          }}
        />
        <div className="composer-foot">
          <div className="composer-left">
            <button type="button" className="chip" onClick={() => setUi({ cwdPicker: true })}>
              <FolderOpen size={14} /> {cwdLabel(session?.cwd)}
            </button>
            <ModeChip mode="prompt" current={composerMode} onPick={setComposerMode} label={t.send} />
            <ModeChip mode="steer" current={composerMode} onPick={setComposerMode} label={t.steer} />
            <ModeChip mode="follow_up" current={composerMode} onPick={setComposerMode} label={t.follow} />
            <select
              className="chip"
              value={session?.model?.id ?? ""}
              onChange={(e) => {
                const model = models.find((m) => m.id === e.target.value);
                if (model) send({ type: "set_model", provider: model.provider, modelId: model.id });
              }}
            >
              {models.map((m) => (
                <option key={`${m.provider}:${m.id}`} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              className="chip"
              value={session?.thinkingLevel ?? "medium"}
              onChange={(e) =>
                send({ type: "set_thinking_level", level: e.target.value as NonNullable<typeof session>["thinkingLevel"] })
              }
            >
              {["off", "low", "medium", "high", "xhigh"].map((level) => (
                <option key={level} value={level}>
                  {t.effort} {level}
                </option>
              ))}
            </select>
          </div>
          <div className="composer-right">
            {session && session.sessionActions.queuedCount > 0 ? (
              <span className="badge">
                {t.queued} {session.sessionActions.queuedCount}
              </span>
            ) : null}
            <button type="button" className="ghost" onClick={() => setUi({ call: true })}>
              <Phone size={14} /> {t.call}
            </button>
            {streaming ? (
              <button type="button" className="chip danger" onClick={() => send({ type: "abort" })}>
                <Square size={12} /> {t.abort}
              </button>
            ) : (
              <button className="send" type="submit">
                <ArrowUp size={14} /> {composerMode === "steer" ? t.steer : composerMode === "follow_up" ? t.follow : t.send}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function ModeChip({
  mode,
  current,
  onPick,
  label,
}: {
  mode: "prompt" | "steer" | "follow_up";
  current: string;
  onPick: (mode: "prompt" | "steer" | "follow_up") => void;
  label: string;
}) {
  return (
    <button type="button" className={`chip ${current === mode ? "active" : ""}`} onClick={() => onPick(mode)}>
      {label}
    </button>
  );
}

function cwdLabel(cwd?: string): string {
  if (!cwd) return "cwd";
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}
