import { copy } from "../lib/i18n";
import { useStore } from "../lib/store";

export function SummaryPanel() {
  const { session, hello, subagents, locale, ui } = useStore();
  const t = copy[locale];
  if (!ui.summary) return null;
  return (
    <div className="modal-back" onClick={() => useStore.getState().setUi({ summary: false })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t.summary}</h3>
        <p className="hint">
          {hello?.nameZh} · {hello?.mode} · cwd {session?.cwd}
        </p>
        <ul className="hint">
          <li>session {session?.sessionId}</li>
          <li>model {session?.model?.name ?? session?.model?.id ?? "—"}</li>
          <li>thinking {session?.thinkingLevel}</li>
          <li>
            {t.subagents} {subagents.length} ({subagents.filter((s) => s.status === "running").length} running)
          </li>
          <li>queued {session?.sessionActions.queuedCount}</li>
        </ul>
      </div>
    </div>
  );
}
