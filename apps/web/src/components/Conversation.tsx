import { useEffect, useRef } from "react";
import { copy } from "../lib/i18n";
import { useStore, visibleMessages } from "../lib/store";
import { MessageView } from "./MessageView";

export function Conversation() {
  const { messages, streaming, locale, send } = useStore();
  const t = copy[locale];
  const list = visibleMessages(messages, streaming);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [list.length, streaming]);

  if (!list.length) {
    return (
      <section className="conversation">
        <div className="empty">
          <svg width="48" height="48" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M8 22V10h3.2l4.8 7.4V10H19v12h-3.2L11 14.6V22H8z" fill="#d4a054" />
            <circle cx="23" cy="11" r="2" fill="#d4a054" />
          </svg>
          <h1>{t.emptyTitle}</h1>
          <p>{t.emptyBody}</p>
          <div className="composer-right" style={{ justifyContent: "center", marginTop: 16 }}>
            <button className="send" onClick={() => send({ type: "prompt", message: "演示子代理：并行审查认证与文档" })}>
              {t.demo}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="conversation">
      {list.map((message, i) => (
        <MessageView key={`${message.role}-${i}-${"timestamp" in message ? message.timestamp : i}`} message={message} />
      ))}
      <div ref={end} />
    </section>
  );
}
