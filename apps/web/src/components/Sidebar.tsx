import { FolderOpen, Plus, Settings } from "lucide-react";
import { copy } from "../lib/i18n";
import { useStore } from "../lib/store";

export function Sidebar() {
  const { sessions, session, hello, connected, locale, sessionFilter, send, setUi, applyFilter } = useSidebar();
  const t = copy[locale];
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="product-row">
          <strong>{t.product}</strong>
          <span className="badge">{hello?.mode}</span>
        </div>
        <input
          className="search"
          placeholder={t.search}
          value={sessionFilter}
          onChange={(e) => applyFilter(e.target.value)}
        />
        <button className="new-task" onClick={() => send({ type: "new_session" })}>
          <Plus size={16} />
          {t.newChat}
          <kbd className="mono" style={{ marginLeft: "auto", color: "var(--muted)" }}>
            ⌘K
          </kbd>
        </button>
        <button className="row-btn" onClick={() => setUi({ cwdPicker: true })}>
          <FolderOpen size={16} />
          {t.cwd}
        </button>
      </div>
      <div className="session-list">
        {sessions
          .filter((s) => s.name.toLowerCase().includes(sessionFilter.toLowerCase()))
          .map((s) => (
            <button
              key={s.id}
              className={`session ${s.id === session?.sessionId ? "active" : ""}`}
              onClick={() => send({ type: "switch_session", sessionId: s.sessionFile || s.id })}
            >
              <span>{s.name}</span>
              <small>
                {s.source} · {s.messageCount}
              </small>
            </button>
          ))}
      </div>
      <div className="sidebar-footer">
        <div className="status">
          <span className={`dot ${connected ? "ok" : ""}`} />
          {connected ? t.connected : t.disconnected}
        </div>
        <button className="row-btn" onClick={() => setUi({ settings: true })}>
          <Settings size={16} />
          {t.settings}
        </button>
      </div>
    </aside>
  );
}

function useSidebar() {
  const store = useStore();
  return {
    ...store,
    applyFilter: (value: string) => useStore.setState({ sessionFilter: value }),
  };
}
