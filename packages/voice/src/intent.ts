import type { VoiceDispatch } from "@ida/protocol";

const ABORT = /^(abort|stop|取消|中止|停下|别说了|够了)(?:\s|$)/i;
const STEER = /^(steer|转向|改成|不要这样|先别|改做)(?:\s+|$)/i;
const FOLLOW = /^(follow[- ]?up|跟进|做完后再|结束后)(?:\s+|$)/i;
const NAMED =
  /(?:叫|named|name\s*[:=]?\s*)[「"'“]?([A-Za-z][A-Za-z0-9._-]*)[」"'”]?/i;
const DISPATCH_TASK = /(?:去做|去|to|task[:：]\s*)(.+)$/i;

export function parseVoiceIntent(text: string): VoiceDispatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (ABORT.test(trimmed)) return { kind: "abort" };
  if (STEER.test(trimmed)) {
    return { kind: "steer", message: trimmed.replace(STEER, "").trim() || trimmed };
  }
  if (FOLLOW.test(trimmed)) {
    return { kind: "follow_up", message: trimmed.replace(FOLLOW, "").trim() || trimmed };
  }
  if (/子代理|subagent|rlm\(|派一个|dispatch/i.test(trimmed)) {
    const name = trimmed.match(NAMED)?.[1] ?? inferName(trimmed);
    const task = trimmed.match(DISPATCH_TASK)?.[1]?.trim() ?? trimmed;
    return { kind: "dispatch_subagent", name, task };
  }
  return { kind: "prompt", message: trimmed };
}

function inferName(text: string): string {
  if (/auth|认证|登录/i.test(text)) return "auth-reviewer";
  if (/test|测试/i.test(text)) return "test-reviewer";
  if (/doc|文档/i.test(text)) return "docs-reviewer";
  if (/research|调研|搜索/i.test(text)) return "researcher";
  if (/implement|实现|写代码/i.test(text)) return "implementer";
  return "worker";
}

export function dispatchToRootPrompt(dispatch: VoiceDispatch): string | null {
  if (dispatch.kind === "dispatch_subagent") {
    const name = dispatch.name ?? "worker";
    const task = dispatch.task ?? "";
    return [
      "Voice call requested an RLM child. Use the persistent Python REPL.",
      `Spawn with: await rlm(${JSON.stringify(task)}, name=${JSON.stringify(name)})`,
      "Do not implement the child's work in the parent. Admit the child and continue.",
    ].join(" ");
  }
  if (dispatch.kind === "prompt") return dispatch.message ?? "";
  return null;
}
