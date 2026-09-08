import { useEffect, useState } from "react";
import { useGateway } from "./hooks/useGateway";
import { SubagentBoard } from "./components/SubagentBoard";
import { DiffPanel } from "./components/DiffPanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { CallOverlay } from "./components/CallOverlay";

export function App() {
  const gw = useGateway();
  const [draft, setDraft] = useState("");
  const [cwd, setCwd] = useState("");
  const [callOpen, setCallOpen] = useState(false);

  useEffect(() => {
    if (gw.state?.cwd && !cwd) setCwd(gw.state.cwd);
  }, [gw.state, cwd]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    gw.prompt(text);
    setDraft("");
  }

  function applyCwd() {
    if (!cwd.trim()) return;
    gw.send({ type: "set_cwd", cwd: cwd.trim() });
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-mark">◈</div>
          <span>Prime Workbench</span>
        </div>
        <span className={`badge ${gw.state?.mode ?? "mock"}`}>{gw.state?.mode ?? "…"} mode</span>
        <span className="badge dot" style={{ color: gw.connected ? "var(--ok)" : "var(--danger)" }}>
          {gw.connected ? "connected" : "reconnecting"}
        </span>
        {gw.state?.isStreaming && <span className="badge">streaming</span>}
        <div className="cwd-box">
          <span style={{ color: "var(--muted)", fontSize: 12 }}>cwd</span>
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCwd()}
          />
          <button onClick={applyCwd}>Set</button>
        </div>
        <div className="spacer" />
        <button onClick={() => gw.send({ type: "new_session", id: crypto.randomUUID() })}>New session</button>
        <button className="primary" onClick={() => setCallOpen(true)}>
          Call
        </button>
      </header>

      <div className="main">
        <div className="center">
          <div className="transcript">
            {gw.messages.length === 0 && (
              <div className="empty">
                <strong>Prime Workbench</strong>
                <div>
                  Chat with the root agent, watch the RLM subagent tree, inspect REPL/tool output, and start an
                  interruptible voice call.
                </div>
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  Try: spawn a research subagent and run a REPL cell, or open Call (mock voice works without API key).
                </div>
              </div>
            )}
            {gw.messages.map((m) => (
              <div key={m.id} className={`msg ${m.role} ${m.streaming ? "streaming" : ""}`}>
                <div className="role">{m.role}</div>
                {m.thinking && <div className="thinking">{m.thinking}</div>}
                <div className="body">{m.content}</div>
              </div>
            ))}
          </div>

          <div className="composer">
            <div className="composer-box">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message Prime… (Enter to send, Shift+Enter newline)"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="composer-actions">
                <span className="hint">
                  {gw.state?.model ? `model ${gw.state.model}` : "mock-prime-rlm"} · session {gw.state?.sessionId ?? "—"}
                </span>
                <button onClick={() => gw.send({ type: "abort" })} disabled={!gw.state?.isStreaming}>
                  Abort
                </button>
                <button className="primary" onClick={submit}>
                  Send
                </button>
              </div>
            </div>
          </div>

          <TerminalPanel lines={gw.terminal} />
        </div>

        <aside className="right">
          <SubagentBoard tree={gw.tree} />
          <DiffPanel files={gw.diffs} />
        </aside>
      </div>

      <CallOverlay open={callOpen} voice={gw.voice} send={gw.send} onClose={() => setCallOpen(false)} />
    </div>
  );
}
