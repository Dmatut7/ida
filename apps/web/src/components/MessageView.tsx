import type { AgentMessage, AssistantContent } from "@ida/protocol";
import { renderMarkdown } from "../lib/markdown";

export function MessageView({ message }: { message: AgentMessage }) {
  if (message.role === "user") {
    const text = typeof message.content === "string" ? message.content : message.content.map((c) => ("text" in c ? c.text : "")).join("");
    return (
      <article className="msg user">
        <div className="who">{message.source === "voice" ? "Voice" : "You"}</div>
        <div className="bubble">{text}</div>
      </article>
    );
  }
  if (message.role === "toolResult") {
    return (
      <article className="msg tool-result">
        <div className="tool">
          <header>
            <span>{message.toolName}</span>
            <span>{message.isError ? "error" : "ok"}</span>
          </header>
          <pre>{message.content.map((c) => c.text).join("")}</pre>
        </div>
      </article>
    );
  }
  if (message.role === "bashExecution") {
    return (
      <article className="msg">
        <div className="tool">
          <header>
            <span>bash</span>
            <span>exit {message.exitCode}</span>
          </header>
          <pre>{`$ ${message.command}\n${message.output}`}</pre>
        </div>
      </article>
    );
  }
  return (
    <article className="msg assistant">
      <div className="who">Prime · root</div>
      {message.content.map((block, i) => (
        <ContentBlock key={i} block={block} />
      ))}
    </article>
  );
}

function ContentBlock({ block }: { block: AssistantContent }) {
  if (block.type === "thinking") {
    return <div className="think">{block.thinking}</div>;
  }
  if (block.type === "toolCall") {
    const code = String(block.arguments.code ?? block.arguments.command ?? JSON.stringify(block.arguments, null, 2));
    return (
      <div className="tool">
        <header>
          <span>{block.name === "ipython" ? "REPL · ipython" : block.name}</span>
          <span className="mono">{block.id.slice(0, 10)}</span>
        </header>
        <pre>{code}</pre>
      </div>
    );
  }
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }} />;
}
