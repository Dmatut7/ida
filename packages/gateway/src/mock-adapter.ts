import { randomUUID } from "node:crypto";
import type { SubagentNode } from "@prime-workbench/protocol";
import type { AdapterEvent, AdapterState, PrimeAdapter } from "./adapter.js";

export class MockPrimeAdapter implements PrimeAdapter {
  readonly kind = "mock" as const;
  private handlers = new Set<(ev: AdapterEvent) => void>();
  private state: AdapterState = {
    sessionId: randomUUID().slice(0, 8),
    isStreaming: false,
    cwd: process.cwd(),
    model: "mock-prime-rlm",
  };
  private abortFlag = false;
  private tree: SubagentNode;

  constructor(cwd?: string) {
    if (cwd) this.state.cwd = cwd;
    this.tree = this.seedTree();
  }

  async start(): Promise<void> {
    this.emit({ kind: "terminal", stream: "system", text: `[mock] Prime backend ready (cwd=${this.state.cwd})` });
    this.emit({ kind: "subagent_tree", root: this.tree });
    this.emit({ kind: "state", isStreaming: false, sessionId: this.state.sessionId, model: this.state.model });
  }

  async stop(): Promise<void> {
    this.abortFlag = true;
  }

  onEvent(handler: (ev: AdapterEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  getState(): AdapterState {
    return { ...this.state };
  }

  async setCwd(cwd: string): Promise<void> {
    this.state.cwd = cwd;
    this.emit({ kind: "terminal", stream: "system", text: `[mock] cwd -> ${cwd}` });
    this.emit({ kind: "state", isStreaming: this.state.isStreaming, sessionId: this.state.sessionId, model: this.state.model });
  }

  async newSession(): Promise<void> {
    this.abortFlag = true;
    this.state.sessionId = randomUUID().slice(0, 8);
    this.state.isStreaming = false;
    this.tree = this.seedTree();
    this.emit({ kind: "terminal", stream: "system", text: `[mock] new session ${this.state.sessionId}` });
    this.emit({ kind: "subagent_tree", root: this.tree });
    this.emit({ kind: "state", isStreaming: false, sessionId: this.state.sessionId, model: this.state.model });
  }

  async abort(): Promise<void> {
    this.abortFlag = true;
    this.state.isStreaming = false;
    this.emit({ kind: "terminal", stream: "system", text: "[mock] abort" });
    this.emit({ kind: "agent_end" });
    this.emit({ kind: "state", isStreaming: false, sessionId: this.state.sessionId, model: this.state.model });
  }

  async steer(message: string): Promise<void> {
    this.emit({ kind: "terminal", stream: "system", text: `[mock] steer: ${message.slice(0, 80)}` });
    if (this.state.isStreaming) {
      // inject a short note mid-stream on next tick — prompt loop checks abortFlag
      this.emit({ kind: "text_delta", messageId: "steer-note", delta: `\n\n(steered: ${message.slice(0, 60)})\n` });
    } else {
      await this.prompt(message);
    }
  }

  async prompt(message: string): Promise<void> {
    this.abortFlag = false;
    this.state.isStreaming = true;
    const messageId = randomUUID().slice(0, 10);
    this.emit({ kind: "agent_start" });
    this.emit({ kind: "state", isStreaming: true, sessionId: this.state.sessionId, model: this.state.model });
    this.emit({ kind: "message_start", messageId, role: "assistant" });

    const lower = message.toLowerCase();
    const wantsSub = /subagent|research|parallel|spawn|rlm/.test(lower);
    const wantsRepl = /repl|python|ipython|cell/.test(lower);
    const wantsDiff = /diff|patch|edit|refactor|fix/.test(lower);

    await this.streamThinking(messageId, "Planning with RLM: decompose, spawn specialists if needed, then synthesize.");

    if (wantsSub) {
      await this.runSubagentDemo(messageId);
    }
    if (wantsRepl) {
      await this.runReplDemo(messageId);
    }
    if (wantsDiff) {
      await this.runDiffDemo(messageId);
    }

    const reply = this.composeReply(message, { wantsSub, wantsRepl, wantsDiff });
    await this.streamText(messageId, reply);
    if (this.abortFlag) return;

    this.emit({ kind: "message_end", messageId, content: reply });
    this.state.isStreaming = false;
    this.emit({ kind: "agent_end" });
    this.emit({ kind: "state", isStreaming: false, sessionId: this.state.sessionId, model: this.state.model });
  }

  private composeReply(
    message: string,
    flags: { wantsSub: boolean; wantsRepl: boolean; wantsDiff: boolean },
  ): string {
    const bits = [
      `I'm the **mock Prime** backend inside Prime Workbench.`,
      `You said: “${message.slice(0, 200)}${message.length > 200 ? "…" : ""}”`,
      "",
      `Working directory: \`${this.state.cwd}\``,
      `Session: \`${this.state.sessionId}\``,
      "",
    ];
    if (flags.wantsSub) bits.push("Spawned a short RLM subagent tree — check the Subagent board.");
    if (flags.wantsRepl) bits.push("Ran a simulated IPython/REPL cell; see the terminal panel.");
    if (flags.wantsDiff) bits.push("Proposed a sample diff in the review panel.");
    bits.push("", "Tip: set `PRIME_MODE=rpc` and install prime-agent to talk to the real daemon.");
    return bits.join("\n");
  }

  private async streamThinking(messageId: string, text: string): Promise<void> {
    for (const word of text.split(" ")) {
      if (this.abortFlag) return;
      this.emit({ kind: "thinking_delta", messageId, delta: word + " " });
      await sleep(25);
    }
  }

  private async streamText(messageId: string, text: string): Promise<void> {
    const chunkSize = 3;
    const words = text.split(/(\s+)/);
    let buf = "";
    for (const w of words) {
      if (this.abortFlag) return;
      buf += w;
      if (buf.split(/\s+/).length >= chunkSize) {
        this.emit({ kind: "text_delta", messageId, delta: buf });
        buf = "";
        await sleep(35);
      }
    }
    if (buf) this.emit({ kind: "text_delta", messageId, delta: buf });
  }

  private async runSubagentDemo(parentMessageId: string): Promise<void> {
    const researchId = "sa-research";
    const codeId = "sa-code";
    this.tree = {
      ...this.tree,
      status: "running",
      children: [
        {
          id: researchId,
          name: "research",
          role: "explore",
          status: "running",
          parentId: this.tree.id,
          depth: 1,
          summary: "Gathering context…",
          startedAt: Date.now(),
          children: [
            {
              id: "sa-web",
              name: "web-scan",
              role: "tool",
              status: "running",
              parentId: researchId,
              depth: 2,
              summary: "Scanning docs",
              startedAt: Date.now(),
            },
          ],
        },
        {
          id: codeId,
          name: "implementer",
          role: "code",
          status: "waiting",
          parentId: this.tree.id,
          depth: 1,
          summary: "Waiting on research",
        },
      ],
    };
    this.emit({ kind: "subagent_tree", root: this.tree });
    this.emit({
      kind: "tool_start",
      toolCallId: "call-spawn-1",
      toolName: "rlm.spawn",
      args: { name: "research", goal: "explore codebase" },
    });
    this.emit({ kind: "terminal", stream: "system", text: "[rlm] spawn research (depth=1)" });
    await sleep(400);
    if (this.abortFlag) return;

    this.emit({
      kind: "tool_start",
      toolCallId: "call-bash-1",
      toolName: "bash",
      args: { command: "rg -n 'RPC' packages --glob '*.md' | head" },
      agentId: researchId,
    });
    this.emit({ kind: "tool_update", toolCallId: "call-bash-1", partial: "packages/.../rpc.md:1:# RPC Mode\n" });
    await sleep(300);
    this.emit({
      kind: "tool_end",
      toolCallId: "call-bash-1",
      result: "packages/coding-agent/docs/rpc.md:1:# RPC Mode\n",
    });
    this.emit({ kind: "terminal", stream: "stdout", text: "packages/coding-agent/docs/rpc.md:1:# RPC Mode", agentId: researchId });

    // mark children done
    this.patchNode(researchId, { status: "done", summary: "Found RPC JSONL docs" });
    this.patchNode("sa-web", { status: "done", summary: "Docs indexed" });
    this.patchNode(codeId, { status: "running", summary: "Drafting response" });
    this.emit({ kind: "subagent_tree", root: this.tree });
    await sleep(350);
    this.patchNode(codeId, { status: "done", summary: "Ready to synthesize" });
    this.tree = { ...this.tree, status: "running", summary: "Synthesizing" };
    this.emit({ kind: "subagent_tree", root: this.tree });
    this.emit({ kind: "tool_end", toolCallId: "call-spawn-1", result: "subagents completed" });
    void parentMessageId;
  }

  private async runReplDemo(messageId: string): Promise<void> {
    const toolCallId = "call-repl-1";
    this.emit({
      kind: "tool_start",
      toolCallId,
      toolName: "ipython",
      args: { code: "sum(i*i for i in range(10))" },
    });
    this.emit({ kind: "terminal", stream: "repl", text: "In [1]: sum(i*i for i in range(10))" });
    await sleep(250);
    this.emit({ kind: "tool_update", toolCallId, partial: "285" });
    this.emit({ kind: "terminal", stream: "repl", text: "Out[1]: 285" });
    this.emit({ kind: "tool_end", toolCallId, result: "285" });
    this.emit({ kind: "text_delta", messageId, delta: "\n\nREPL result: `285`\n" });
  }

  private async runDiffDemo(messageId: string): Promise<void> {
    const patch = `@@ -1,5 +1,8 @@
 export function greet(name: string) {
-  return 'hi ' + name
+  // prefer template literal
+  return \`hello, \${name}!\`
 }
`;
    this.emit({
      kind: "diff",
      files: [{ path: "src/greet.ts", status: "modified", patch }],
    });
    this.emit({ kind: "text_delta", messageId, delta: "\nProposed edit to `src/greet.ts` (see Diff panel).\n" });
  }

  private seedTree(): SubagentNode {
    return {
      id: "root",
      name: "root-agent",
      role: "prime",
      status: "idle",
      parentId: null,
      depth: 0,
      summary: "Root RLM session",
      children: [],
    };
  }

  private patchNode(id: string, patch: Partial<SubagentNode>): void {
    const walk = (n: SubagentNode): SubagentNode => {
      if (n.id === id) return { ...n, ...patch };
      return { ...n, children: n.children?.map(walk) };
    };
    this.tree = walk(this.tree);
  }

  private emit(ev: AdapterEvent): void {
    for (const h of this.handlers) h(ev);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
