import { startServer } from "./server.js";

const { host, port, hub } = await startServer();
console.log(`伊达 / Prime Workbench gateway  ${hub.backend.mode}  http://${host}:${port}`);
console.log(`WebSocket  ws://${host}:${port}/ws`);
if (hub.backend.mode === "mock") {
  console.log("PRIME_MODE=mock — streaming chat, REPL events, and subagent tree are simulated.");
} else {
  console.log("PRIME_MODE=rpc — talking to prime-agent --mode rpc. Never Codex CLI.");
}

const shutdown = () => {
  void hub.stop().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
