import { describe, expect, it } from "vitest";
import { encodeJsonl, splitJsonl } from "../src/jsonl.js";

describe("jsonl framing", () => {
  it("splits only on LF and strips CR", () => {
    const { lines, rest } = splitJsonl('{"a":1}\r\n{"b":2}\n{"partial"');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('{"partial"');
  });

  it("does not split on unicode line separators", () => {
    const inner = `{"text":"line\u2028still-one"}`;
    const { lines, rest } = splitJsonl(`${inner}\n`);
    expect(lines).toEqual([inner]);
    expect(rest).toBe("");
  });

  it("encodes a trailing LF", () => {
    expect(encodeJsonl({ type: "abort" })).toBe('{"type":"abort"}\n');
  });
});
