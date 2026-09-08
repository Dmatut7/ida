import { describe, expect, it } from "vitest";
import { planTurn } from "../src/backends/mock.js";
import { splitJsonl } from "@ida/protocol";

describe("mock RLM planner", () => {
  it("spawns rlm children for review / 演示 prompts", () => {
    const plan = planTurn("演示子代理，审查认证并并行看测试");
    expect(plan.children.length).toBeGreaterThanOrEqual(2);
    expect(plan.ipython.some((c) => c.code.includes("await rlm("))).toBe(true);
    expect(plan.children.some((c) => c.name.includes("reviewer"))).toBe(true);
  });

  it("keeps a simple chat without children", () => {
    const plan = planTurn("你好，伊达");
    expect(plan.children).toEqual([]);
    expect(plan.answer).toMatch(/伊达|mock/);
  });
});

describe("jsonl used by rpc reader", () => {
  it("keeps unicode separators inside a record", () => {
    const { lines } = splitJsonl('{"t":"a\u2028b"}\n');
    expect(JSON.parse(lines[0] ?? "{}")).toEqual({ t: "a\u2028b" });
  });
});
