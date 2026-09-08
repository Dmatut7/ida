import { GitBranch } from "lucide-react";
import { copy } from "../lib/i18n";
import { useStore } from "../lib/store";

export function SubagentBoard() {
  const { subagents, locale, send, session } = useStore();
  const t = copy[locale];
  return (
    <aside className="side-panel">
      <div className="side-head">
        <strong>
          <GitBranch size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {t.subagents}
        </strong>
        <span className="badge">{subagents.length}</span>
      </div>
      <div className="side-body">
        {!subagents.length ? <p className="hint">{t.noChildren}</p> : null}
        {subagents.map((node) => (
          <article key={node.id} className="child">
            <div className="meta">
              <strong>{node.name}</strong>
              <span className={`st ${node.status}`}>{node.status}</span>
            </div>
            <div className="hint">
              depth {node.depth} · {node.source}
              {node.toolName ? ` · ${node.toolName}` : ""}
            </div>
            {node.lastMessage ? <div className="mono" style={{ fontSize: 12 }}>{node.lastMessage}</div> : null}
            <button
              className="ghost"
              onClick={() => send({ type: "observe", activeSessionId: node.sessionId || node.id })}
            >
              {t.observe}
            </button>
          </article>
        ))}
        {session?.sessionActions.steering.length ? (
          <div className="hint">steer: {session.sessionActions.steering.join(" · ")}</div>
        ) : null}
      </div>
    </aside>
  );
}
