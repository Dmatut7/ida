import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { MockPrimeAdapter } from "./mock-adapter.js";
import { RpcPrimeAdapter } from "./rpc-adapter.js";
import { SessionHub } from "./session-hub.js";
import type { PrimeAdapter } from "./adapter.js";

function loadEnvFile(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const mode = (process.env.PRIME_MODE ?? "mock").toLowerCase();

function createAdapter(): PrimeAdapter {
  if (mode === "rpc") {
    return new RpcPrimeAdapter({
      bin: process.env.PRIME_BIN,
      cwd: process.env.PRIME_CWD || process.cwd(),
    });
  }
  return new MockPrimeAdapter(process.env.PRIME_CWD || process.cwd());
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode, voice: process.env.VOICE_MODE ?? "auto" });
});

app.get("/api/config", (_req, res) => {
  res.json({
    mode,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    voiceMode: process.env.VOICE_MODE ?? "auto",
    cwd: process.env.PRIME_CWD || process.cwd(),
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const adapter = createAdapter();
const hub = new SessionHub(adapter);

wss.on("connection", (ws) => {
  hub.addSocket(ws);
});

await hub.start();

server.listen(PORT, HOST, () => {
  console.log(`[prime-workbench gateway] http://${HOST}:${PORT}  mode=${mode}`);
  console.log(`[prime-workbench gateway] ws://${HOST}:${PORT}/ws`);
});

async function shutdown() {
  console.log("shutting down…");
  await hub.stop();
  server.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
