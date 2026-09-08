import { describe, expect, it } from "vitest";
import { dispatchToRootPrompt, parseVoiceIntent } from "../src/intent.js";
import { speakForDispatch } from "../src/mock.js";
import { toolToDispatch } from "../src/realtime.js";

describe("voice intent", () => {
  it("parses abort / steer / follow-up", () => {
    expect(parseVoiceIntent("取消")).toEqual({ kind: "abort" });
    expect(parseVoiceIntent("转向 先看测试")).toEqual({ kind: "steer", message: "先看测试" });
    expect(parseVoiceIntent("跟进 写一份摘要")).toEqual({
      kind: "follow_up",
      message: "写一份摘要",
    });
  });

  it("parses RLM dispatch and wraps a root prompt", () => {
    const d = parseVoiceIntent('派一个子代理叫 auth-reviewer 去审查登录');
    expect(d?.kind).toBe("dispatch_subagent");
    expect(d?.name).toBe("auth-reviewer");
    const prompt = dispatchToRootPrompt(d!);
    expect(prompt).toContain("await rlm(");
    expect(prompt).toContain("auth-reviewer");
  });

  it("maps realtime tools onto Prime actions", () => {
    expect(toolToDispatch("abort_root", {})).toEqual({ kind: "abort" });
    expect(toolToDispatch("dispatch_subagent", { name: "docs", task: "scan" })).toEqual({
      kind: "dispatch_subagent",
      name: "docs",
      task: "scan",
    });
  });

  it("speaks a dispatch confirmation", () => {
    expect(speakForDispatch({ kind: "abort" }, "")).toMatch(/Aborting/);
  });
});
