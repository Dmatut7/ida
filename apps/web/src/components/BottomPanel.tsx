import { useState } from "react";
import { copy } from "../lib/i18n";
import { useStore } from "../lib/store";

export function BottomPanel() {
  const { logs, terminal, locale, ui, setUi, send } = useStore();
  const t = copy[locale];
  const [cmd, setCmd] = useState("");
  if (!ui.bottom) return null;
  const text =
    ui.bottomTab === "terminal"
      ? terminal || "$ "
      : logs.map((l) => `${new Date(l.ts).toISOString().slice(11, 19)} ${l.source} ${l.text}`).join("\n");
  return (
    <section className="bottom">
      <div className="bottom-tabs">
        <button className={ui.bottomTab === "terminal" ? "on" : ""} onClick={() => setUi({ bottomTab: "terminal" })}>
          {t.terminal}
        </button>
        <button className={ui.bottomTab === "logs" ? "on" : ""} onClick={() => setUi({ bottomTab: "logs" })}>
          {t.logs}
        </button>
      </div>
      <pre className="mono">{text}</pre>
      {ui.bottomTab === "terminal" ? (
        <form
          className="term-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (!cmd.trim()) return;
            send({ type: "terminal.input", data: `${cmd}\n` });
            setCmd("");
          }}
        >
          <input className="mono" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="$" />
          <button className="chip active" type="submit">
            {t.run}
          </button>
        </form>
      ) : null}
    </section>
  );
}
