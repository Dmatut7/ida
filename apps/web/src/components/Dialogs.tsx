import { useEffect, useState } from "react";
import { copy } from "../lib/i18n";
import { useStore } from "../lib/store";

interface FsResponse {
  cwd: string;
  parent: string | null;
  entries: { name: string; path: string; type: "dir" | "file" }[];
}

export function Dialogs() {
  const { ui, setUi, locale, theme, setTheme, setLocale, send, hello, session } = useStore();
  const t = copy[locale];
  const [fs, setFs] = useState<FsResponse | null>(null);

  useEffect(() => {
    if (!ui.cwdPicker) return;
    void load(session?.cwd || hello?.cwd);
  }, [ui.cwdPicker, session?.cwd, hello?.cwd]);

  async function load(path?: string) {
    const qs = path ? `?path=${encodeURIComponent(path)}` : "";
    const res = await fetch(`/api/fs${qs}`);
    if (res.ok) setFs((await res.json()) as FsResponse);
  }

  return (
    <>
      {ui.settings ? (
        <div className="modal-back" onClick={() => setUi({ settings: false })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t.settings}</h3>
            <p className="hint">
              {hello?.nameZh} / {hello?.name} · {hello?.mode}
            </p>
            <label>
              {t.language}
              <select className="search" value={locale} onChange={(e) => setLocale(e.target.value as "zh" | "en")}>
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {t.theme}
              <select className="search" value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <p className="hint">{t.shortcuts}: Enter {t.send}/{t.steer} · Alt+Enter {t.follow} · ⌘K {t.newChat}</p>
            <button className="ghost" onClick={() => send({ type: "compact" })}>
              {t.compact}
            </button>
          </div>
        </div>
      ) : null}
      {ui.cwdPicker ? (
        <div className="modal-back" onClick={() => setUi({ cwdPicker: false })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t.selectCwd}</h3>
            <div className="mono hint">{fs?.cwd}</div>
            <div className="fs-list">
              {fs?.parent ? (
                <button
                  onClick={() => {
                    void load(fs.parent ?? undefined);
                  }}
                >
                  ← {t.parent}
                </button>
              ) : null}
              {fs?.entries
                .filter((e) => e.type === "dir")
                .map((entry) => (
                  <button key={entry.path} onClick={() => void load(entry.path)}>
                    {entry.name}/
                  </button>
                ))}
            </div>
            <button
              className="send"
              style={{ marginTop: 12 }}
              onClick={() => {
                if (fs?.cwd) send({ type: "set_cwd", cwd: fs.cwd });
                setUi({ cwdPicker: false });
              }}
            >
              {t.cwd}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
