import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { browseDir } from "./fs-browse.js";
import { WorkbenchHub, type HubConfig } from "./hub.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

export function loadConfig(): HubConfig {
  const mode = process.env.PRIME_MODE === "rpc" ? "rpc" : "mock";
  const extra = (process.env.PRIME_AGENT_ARGS ?? "").trim();
  return {
    mode,
    cwd: resolve(process.env.PRIME_CWD || process.cwd()),
    primeBin: process.env.PRIME_AGENT_BIN || "prime-agent",
    primeArgs: extra ? extra.split(/\s+/) : [],
    sessionDir: process.env.PRIME_SESSION_DIR,
    daemonSocket: process.env.PRIME_DAEMON_SOCKET || undefined,
    openaiKey: process.env.OPENAI_API_KEY,
  };
}

export async function startServer(): Promise<{ port: number; host: string; hub: WorkbenchHub }> {
  const hub = new WorkbenchHub(loadConfig());
  await hub.start();

  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 7788);
  const token = process.env.IDA_ACCESS_TOKEN || "";
  const webRoot = resolveWebRoot();

  const http = createServer((req, res) => {
    void handleHttp(req, res, hub, token, webRoot);
  });
  const wss = new WebSocketServer({ noServer: true });

  http.on("upgrade", (req, socket, head) => {
    if (!authorized(req, token)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const url = new URL(req.url ?? "/", "http://ida.local");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachClient(ws, hub);
    });
  });

  await new Promise<void>((resolve) => http.listen(port, host, resolve));
  return { port, host, hub };
}

function attachClient(ws: WebSocket, hub: WorkbenchHub): void {
  const unsub = hub.subscribe((event) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  });
  ws.send(JSON.stringify(hub.hello()));
  ws.on("message", (raw) => {
    let command: unknown;
    try {
      command = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "invalid json" }));
      return;
    }
    void hub.handle(command as Parameters<WorkbenchHub["handle"]>[0]).catch((err) => {
      ws.send(
        JSON.stringify({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
          recoverable: true,
        }),
      );
    });
  });
  ws.on("close", () => unsub());
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  hub: WorkbenchHub,
  token: string,
  webRoot: string | null,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://ida.local");
  if (url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      product: "ida",
      mode: hub.backend.mode,
      cwd: hub.backend.getCwd(),
      streaming: hub.backend.getState().isStreaming,
    });
    return;
  }
  if (!authorized(req, token) && url.pathname.startsWith("/api/")) {
    json(res, 401, { error: "unauthorized" });
    return;
  }
  if (url.pathname === "/api/fs") {
    try {
      json(res, 200, browseDir(url.searchParams.get("path") ?? undefined));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (url.pathname === "/api/hello") {
    json(res, 200, hub.hello());
    return;
  }
  if (webRoot) {
    serveStatic(res, webRoot, url.pathname);
    return;
  }
  json(res, 404, { error: "not found — run pnpm --filter @ida/web dev in development" });
}

function serveStatic(res: ServerResponse, root: string, pathname: string): void {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const file = join(root, clean);
  if (!file.startsWith(root) || !existsSync(file)) {
    const fallback = join(root, "index.html");
    if (existsSync(fallback)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      createReadStream(fallback).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

function resolveWebRoot(): string | null {
  const candidates = [
    resolve(process.cwd(), "apps/web/dist"),
    resolve(process.cwd(), "../../apps/web/dist"),
  ];
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? null;
}

function authorized(req: IncomingMessage, token: string): boolean {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  const query = new URL(req.url ?? "/", "http://ida.local").searchParams.get("token");
  return header === `Bearer ${token}` || query === token;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
