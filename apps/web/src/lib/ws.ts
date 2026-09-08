import type { ClientCommand, ServerEvent } from "@ida/protocol";

export type WsHandler = (event: ServerEvent) => void;

export class WorkbenchSocket {
  private ws: WebSocket | null = null;
  private handler: WsHandler;
  private retries = 0;
  private closed = false;

  constructor(handler: WsHandler) {
    this.handler = handler;
  }

  connect(): void {
    this.closed = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const token = new URLSearchParams(location.search).get("token");
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const ws = new WebSocket(`${proto}://${location.host}/ws${qs}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.send({ type: "hello", locale: navigator.language.startsWith("zh") ? "zh" : "en" });
    };
    ws.onmessage = (ev) => {
      try {
        this.handler(JSON.parse(String(ev.data)) as ServerEvent);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      const wait = Math.min(8000, 400 * 2 ** this.retries++);
      setTimeout(() => this.connect(), wait);
    };
  }

  send(command: ClientCommand): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
