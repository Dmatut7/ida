import { Info, PanelBottom, PanelLeft, PanelRight, Phone } from "lucide-react";
import { copy } from "../lib/i18n";
import { useStore } from "../lib/store";

export function Topbar() {
  const { hello, session, locale, ui, toggle, setUi } = useStore();
  const t = copy[locale];
  return (
    <header className="topbar">
      <div className="brand">
        <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.08" />
          <path d="M8 22V10h3.2l4.8 7.4V10H19v12h-3.2L11 14.6V22H8z" fill="#d4a054" />
          <circle cx="23" cy="11" r="2" fill="#d4a054" />
        </svg>
        <strong>{t.product}</strong>
        <small>{t.productEn}</small>
      </div>
      <div className="thread-heading">
        <span>{session?.sessionName || t.newChat}</span>
        <span className="path mono">{session?.cwd || hello?.cwd}</span>
      </div>
      <span className={`badge ${hello?.mode ?? "mock"}`}>{hello?.mode === "rpc" ? t.rpc : t.mock}</span>
      <div className="top-actions">
        <button className={`icon-btn ${ui.sidebar ? "on" : ""}`} title="Sidebar" onClick={() => toggle("sidebar")}>
          <PanelLeft size={16} />
        </button>
        <button className={`icon-btn ${ui.bottom ? "on" : ""}`} title={t.terminal} onClick={() => toggle("bottom")}>
          <PanelBottom size={16} />
        </button>
        <button className={`icon-btn ${ui.summary ? "on" : ""}`} title={t.summary} onClick={() => toggle("summary")}>
          <Info size={16} />
        </button>
        <button className={`icon-btn ${ui.side ? "on" : ""}`} title={t.subagents} onClick={() => toggle("side")}>
          <PanelRight size={16} />
        </button>
        <button
          className={`icon-btn ${ui.call ? "on" : ""}`}
          title={t.call}
          onClick={() => setUi({ call: true })}
        >
          <Phone size={16} />
        </button>
      </div>
    </header>
  );
}
