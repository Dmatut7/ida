import { describe, expect, it } from "vitest";
import type { AgentMessage, PrimeEvent, PrimeSessionState, SessionSummary, SubagentNode } from "@ida/protocol";
import { MockBackend } from "../src/backends/mock.js";
import type { BackendHandlers } from "../src/backends/types.js";

function harness() {
  const events: PrimeEvent[] = [];
  const trees: SubagentNode[][] = [];
  const handlers: BackendHandlers = {
    onPrimeEvent: (e) => events.push(e),
    onResponse: () => undefined,
    onState: (_s: PrimeSessionState) => undefined,
    onSessions: (_s: SessionSummary[]) => undefined,
    onSubagents: (t) => trees.push(t),
    onLog: () => undefined,
    onMessages: (_m: AgentMessage[]) => undefined,
  };
  return { events, trees, backend: new MockBackend(handlers, "/tmp/ida") };
}

describe("mock backend runtime", () => {
  it("streams a user turn and admits rlm children", async () => {
    const { events, trees, backend } = harness();
    await backend.start();
    await backend.handle({ type: "prompt", message: "演示子代理审查认证" });
    expect(events.some((e) => e.type === "agent_start")).toBe(true);
    expect(events.some((e) => e.type === "message_update")).toBe(true);
    expect(events.some((e) => e.type === "tool_execution_start")).toBe(true);
    expect(events.some((e) => e.type === "agent_end")).toBe(true);
    expect(trees.at(-1)?.length).toBeGreaterThanOrEqual(2);
    expect(backend.getState().isStreaming).toBe(false);
  });

  it("steer while idle starts a turn", async () => {
    const { events, backend } = harness();
    await backend.start();
    await backend.handle({ type: "steer", message: "先看测试" });
    expect(events.some((e) => e.type === "session_action_update")).toBe(true);
    expect(events.some((e) => e.type === "agent_end")).toBe(true);
  });
});
