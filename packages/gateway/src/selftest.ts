/** Headless mock E2E + RPC argv / rlm parse checks (no prime-agent required). */
import { MockPrimeAdapter } from "./mock-adapter.js";
import type { AdapterEvent } from "./adapter.js";
import { buildPrimeRpcArgs, parseRlmSpawns } from "./rpc-args.js";

const events: AdapterEvent[] = [];
const adapter = new MockPrimeAdapter("/tmp/ida-selftest");
adapter.onEvent((ev) => events.push(ev));
await adapter.start();
await adapter.prompt("演示子代理：并行审查认证，并 run a REPL cell");
await adapter.followUp("after that, summarize");
await adapter.observe("sa-research");
await adapter.stop();

function has(kind: AdapterEvent["kind"]): boolean {
  return events.some((e) => e.kind === kind);
}

const tree = [...events].reverse().find((e) => e.kind === "subagent_tree");
const kids = tree && tree.kind === "subagent_tree" ? tree.root.children ?? [] : [];
const checks = {
  agent_start: has("agent_start"),
  thinking_delta: has("thinking_delta"),
  text_delta: has("text_delta"),
  tool_start: has("tool_start"),
  tool_end: has("tool_end"),
  terminal: has("terminal"),
  subagent_tree: kids.length >= 2,
  agent_end: has("agent_end"),
};

const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error("[selftest] FAIL", checks);
  process.exit(1);
}
console.log("[selftest] mock E2E OK", checks);
console.log("[selftest] children", kids.map((c) => `${c.name}:${c.status}`).join(", "));

const argv = buildPrimeRpcArgs({
  envArgs: "--mode rpc --no-session",
  daemonSocket: "/tmp/prime-agent-ida/daemon.sock",
});
if (!argv.includes("--mode") || !argv.includes("rpc") || !argv.includes("/tmp/prime-agent-ida/daemon.sock")) {
  console.error("[selftest] FAIL rpc argv", argv);
  process.exit(1);
}
const framed = `${JSON.stringify({ type: "prompt", message: "hi" })}\n`;
if (!framed.endsWith("\n") || framed.includes("\r")) {
  console.error("[selftest] FAIL jsonl frame");
  process.exit(1);
}
const spawned = parseRlmSpawns("ipython", {
  code: `h = await rlm("review auth", name="auth-reviewer")`,
});
if (spawned[0]?.name !== "auth-reviewer") {
  console.error("[selftest] FAIL rlm parse", spawned);
  process.exit(1);
}
console.log("[selftest] rpc argv/jsonl/rlm parse OK", argv.join(" "));
