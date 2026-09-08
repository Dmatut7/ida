import { useEffect, useRef } from "react";
import type { TerminalLine } from "@prime-workbench/protocol";

export function TerminalPanel({ lines }: { lines: TerminalLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="terminal">
      <div className="terminal-bar">
        <span>Terminal / REPL</span>
        <span style={{ marginLeft: "auto" }}>{lines.length} lines</span>
      </div>
      <div className="terminal-body" ref={ref}>
        {lines.length === 0 && <div className="term-line system">Waiting for tool / REPL output…</div>}
        {lines.map((l) => (
          <div key={l.id} className={`term-line ${l.stream}`}>
            {l.agentId ? `[${l.agentId}] ` : ""}
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
