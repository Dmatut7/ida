import type { ClientMessage, ServerMessage } from "@prime-workbench/protocol";

export type Handler = (msg: ServerMessage) => void;

export class GatewaySocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private url: string;
  private reconnectTimer: number | null = null;
  connected = false;

  constructor(url?: string) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.url =
      url ||
      (import.meta as any).env?.VITE_GATEWAY_URL ||
      `${proto}://${location.hostname}:8787/ws`;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.connected = true;
      this.send({ type: "hello", client: "web", protocolVersion: 1 });
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        /* ignore */
      }
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.reconnectTimer = window.setTimeout(() => this.connect(), 1200);
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  dispose(): void {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
