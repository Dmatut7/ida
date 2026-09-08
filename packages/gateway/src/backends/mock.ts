import type {
  AgentMessage,
  AssistantMessage,
  AssistantMessageEvent,
  ClientCommand,
  ModelInfo,
  PrimeEvent,
  PrimeSessionState,
  SessionActions,
  SessionSummary,
  SubagentNode,
  TextContent,
  ToolResultMessage,
} from "@ida/protocol";
import { DEFAULT_MODELS, type BackendHandlers, type PrimeBackend } from "./types.js";
import { id, now, sleep, streamText } from "../util.js";

interface MockSession {
  state: PrimeSessionState;
  messages: AgentMessage[];
  repl: Record<string, unknown>;
}

export class MockBackend implements PrimeBackend {
  readonly mode = "mock" as const;
  private handlers: BackendHandlers;
  private cwd: string;
  private sessions = new Map<string, MockSession>();
  private activeId = "";
  private abort: AbortController | null = null;
  private subagents: SubagentNode[] = [];
  private models: ModelInfo[] = DEFAULT_MODELS;
  private childTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(handlers: BackendHandlers, cwd: string) {
    this.handlers = handlers;
    this.cwd = cwd;
    const session = this.createSession("伊达 · 演示会话");
    this.activeId = session.state.sessionId;
  }

  async start(): Promise<void> {
    this.handlers.onLog("info", "gateway", "Mock Prime runtime ready (no prime-agent binary required)");
    this.emitAll();
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    for (const t of this.childTimers) clearTimeout(t);
    this.childTimers = [];
  }

  getState(): PrimeSessionState {
    return this.active().state;
  }

  getMessages(): AgentMessage[] {
    return this.active().messages;
  }

  getSessions(): SessionSummary[] {
    return [...this.sessions.values()].map((s) => ({
      id: s.state.sessionId,
      name: s.state.sessionName ?? s.state.sessionId,
      cwd: s.state.cwd,
      updatedAt: now(),
      messageCount: s.messages.length,
      streaming: s.state.isStreaming,
      source: "mock" as const,
    }));
  }

  getSubagents(): SubagentNode[] {
    return this.subagents;
  }

  getModels(): ModelInfo[] {
    return this.models;
  }

  getCwd(): string {
    return this.cwd;
  }

  async handle(command: ClientCommand): Promise<void> {
    switch (command.type) {
      case "prompt":
        await this.prompt(command.message, command.streamingBehavior);
        break;
      case "steer":
        await this.steer(command.message);
        break;
      case "follow_up":
        await this.followUp(command.message);
        break;
      case "abort":
        this.abortRun("user");
        break;
      case "new_session":
        this.switchTo(this.createSession(command.name ?? "新会话").state.sessionId);
        break;
      case "switch_session":
        this.switchTo(command.sessionId);
        break;
      case "set_cwd":
        this.cwd = command.cwd;
        this.active().state.cwd = command.cwd;
        this.handlers.onLog("info", "gateway", `cwd → ${command.cwd}`);
        this.emitState();
        break;
      case "set_model": {
        const model =
          this.models.find((m) => m.id === command.modelId && m.provider === command.provider) ??
          this.models.find((m) => m.id === command.modelId) ??
          null;
        this.active().state.model = model;
        this.emitState();
        break;
      }
      case "set_thinking_level":
        this.active().state.thinkingLevel = command.level;
        this.emitState();
        break;
      case "set_session_name":
        this.active().state.sessionName = command.name;
        this.emitState();
        this.emitSessions();
        break;
      case "bash":
        await this.runBash(command.command);
        break;
      case "abort_bash":
        this.abort?.abort();
        break;
      case "observe":
        this.handlers.onLog("info", "prime", `observe ${command.activeSessionId}`);
        break;
      case "unobserve":
        this.handlers.onLog("info", "prime", `unobserve ${command.activeSessionId}`);
        break;
      case "list_sessions":
        this.emitSessions();
        break;
      case "get_state":
        this.emitState();
        break;
      case "get_messages":
        this.handlers.onMessages(this.active().messages);
        break;
      case "compact":
        await this.compact(command.customInstructions);
        break;
      default:
        break;
    }
  }

  private active(): MockSession {
    const session = this.sessions.get(this.activeId);
    if (!session) throw new Error("no active session");
    return session;
  }

  private createSession(name: string): MockSession {
    const sessionId = id("sess");
    const session: MockSession = {
      repl: { cwd: this.cwd, notes: [] },
      messages: [],
      state: {
        model: this.models[0] ?? null,
        thinkingLevel: "medium",
        isStreaming: false,
        isCompacting: false,
        steeringMode: "one-at-a-time",
        followUpMode: "one-at-a-time",
        sessionId,
        sessionName: name,
        autoCompactionEnabled: true,
        messageCount: 0,
        unfinishedActionCount: 0,
        sessionActions: emptyActions(),
        cwd: this.cwd,
      },
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  private switchTo(sessionId: string): void {
    if (!this.sessions.has(sessionId)) return;
    this.abortRun("switch");
    this.activeId = sessionId;
    this.emitAll();
    this.handlers.onMessages(this.active().messages);
  }

  private emitAll(): void {
    this.emitState();
    this.emitSessions();
    this.handlers.onSubagents(this.subagents);
  }

  private emitState(): void {
    this.handlers.onState(this.active().state);
  }

  private emitSessions(): void {
    this.handlers.onSessions(this.getSessions());
  }

  private emit(event: PrimeEvent, sessionId?: string): void {
    this.handlers.onPrimeEvent(event, sessionId);
  }

  private pushMessage(message: AgentMessage): void {
    const session = this.active();
    session.messages.push(message);
    session.state.messageCount = session.messages.length;
  }

  private abortRun(reason: string): void {
    this.abort?.abort();
    this.abort = null;
    const state = this.active().state;
    state.isStreaming = false;
    state.sessionActions = emptyActions();
    this.handlers.onLog("info", "prime", `abort (${reason})`);
    this.emitState();
  }

  private async prompt(message: string, streamingBehavior?: "steer" | "followUp"): Promise<void> {
    if (this.active().state.isStreaming) {
      if (streamingBehavior === "followUp") {
        await this.followUp(message);
        return;
      }
      await this.steer(message);
      return;
    }
    this.handlers.onResponse({ type: "response", command: "prompt", success: true });
    await this.runTurn(message, "composer");
  }

  private async steer(message: string): Promise<void> {
    const state = this.active().state;
    state.sessionActions.steering.push(message);
    state.sessionActions.queuedCount += 1;
    this.emit({ type: "session_action_update", actions: state.sessionActions });
    this.handlers.onResponse({ type: "response", command: "steer", success: true });
    this.handlers.onLog("info", "prime", `steer queued: ${message}`);
    if (state.isStreaming) {
      this.abortRun("steer");
    }
    await this.runTurn(message, "steer");
  }

  private async followUp(message: string): Promise<void> {
    const state = this.active().state;
    state.sessionActions.followUps.push(message);
    state.sessionActions.queuedCount += 1;
    this.emit({ type: "session_action_update", actions: state.sessionActions });
    this.handlers.onResponse({ type: "response", command: "follow_up", success: true });
    this.handlers.onLog("info", "prime", `follow-up queued: ${message}`);
    if (!state.isStreaming) {
      await this.runTurn(message, "follow_up");
    }
  }

  private async compact(instructions?: string): Promise<void> {
    const state = this.active().state;
    state.isCompacting = true;
    this.emit({ type: "compaction_start", reason: "manual" });
    await sleep(200);
    const summary = instructions
      ? `Compacted with focus: ${instructions}`
      : "Compacted older turns. REPL namespace and child registry retained.";
    this.emit({
      type: "compaction_end",
      reason: "manual",
      result: { summary, tokensBefore: 48000 },
      aborted: false,
    });
    state.isCompacting = false;
    this.emitState();
  }

  private async runBash(command: string): Promise<void> {
    const output = mockBash(command, this.cwd, this.active().repl);
    const message = {
      role: "bashExecution" as const,
      command,
      output,
      exitCode: 0,
      cancelled: false,
      truncated: false,
      timestamp: now(),
    };
    this.pushMessage(message);
    this.handlers.onResponse({
      type: "response",
      command: "bash",
      success: true,
      data: { output, exitCode: 0, cancelled: false, truncated: false },
    });
    this.handlers.onLog("info", "terminal", `$ ${command}\n${output}`);
  }

  private async runTurn(userText: string, source: "composer" | "steer" | "follow_up" | "voice"): Promise<void> {
    const controller = new AbortController();
    this.abort = controller;
    const signal = controller.signal;
    const session = this.active();
    session.state.isStreaming = true;
    session.state.unfinishedActionCount = 1;
    this.emitState();

    const user = {
      role: "user" as const,
      content: userText,
      timestamp: now(),
      source,
    };
    this.pushMessage(user);
    this.emit({ type: "message_start", message: user });
    this.emit({ type: "message_end", message: user });
    this.emit({ type: "agent_start" });
    this.emit({ type: "turn_start" });

    const assistant = emptyAssistant(session.state);
    this.emit({ type: "message_start", message: assistant });
    this.emitDelta(assistant, { type: "start", partial: assistant });

    try {
      const plan = planTurn(userText);
      await this.streamThinking(assistant, plan.thinking, signal);

      if (plan.ipython.length) {
        await this.streamTextBlock(
          assistant,
          "I'll use the persistent Python REPL — the only built-in model tool — then admit RLM children if needed.",
          signal,
        );
      }

      for (const cell of plan.ipython) {
        await this.runIpython(assistant, cell, signal);
      }

      for (const child of plan.children) {
        this.spawnChild(child, userText);
      }

      const closing = plan.children.length
        ? `${plan.answer}\n\nAdmitted ${plan.children.length} RLM child(ren). Handles return at admission — results arrive via agent_message, never as rlm() return values. Watch the Subagent board.`
        : plan.answer;

      await this.streamTextBlock(assistant, closing, signal);
      assistant.stopReason = "stop";
      this.emitDelta(assistant, { type: "done", reason: "stop" });
      this.emit({ type: "message_end", message: assistant });
      this.pushMessage(structuredClone(assistant));
      this.emit({ type: "turn_end", message: assistant, toolResults: [] });
      this.emit({ type: "agent_end", messages: [user, assistant] });
    } catch (err) {
      if (signal.aborted) {
        assistant.stopReason = "aborted";
        this.emitDelta(assistant, { type: "error", reason: "aborted" });
        this.emit({ type: "message_end", message: assistant });
        this.pushMessage(structuredClone(assistant));
        this.emit({ type: "agent_end", messages: [user, assistant] });
      } else {
        this.handlers.onLog("error", "prime", String(err));
      }
    } finally {
      session.state.isStreaming = false;
      session.state.unfinishedActionCount = 0;
      session.state.sessionActions = emptyActions();
      this.abort = null;
      this.emitState();
      this.emitSessions();
    }
  }

  private async streamThinking(assistant: AssistantMessage, thinking: string, signal: AbortSignal): Promise<void> {
    const idx = assistant.content.length;
    assistant.content.push({ type: "thinking", thinking: "" });
    this.emitDelta(assistant, { type: "thinking_start", contentIndex: idx, partial: assistant });
    await streamText(
      thinking,
      (delta) => {
        const block = assistant.content[idx];
        if (block?.type === "thinking") block.thinking += delta;
        this.emitDelta(assistant, { type: "thinking_delta", contentIndex: idx, delta, partial: assistant });
      },
      signal,
      8,
    );
    this.emitDelta(assistant, { type: "thinking_end", contentIndex: idx, content: thinking, partial: assistant });
  }

  private async streamTextBlock(assistant: AssistantMessage, text: string, signal: AbortSignal): Promise<void> {
    const idx = assistant.content.length;
    assistant.content.push({ type: "text", text: "" });
    this.emitDelta(assistant, { type: "text_start", contentIndex: idx, partial: assistant });
    await streamText(
      text,
      (delta) => {
        const block = assistant.content[idx];
        if (block?.type === "text") block.text += delta;
        this.emitDelta(assistant, { type: "text_delta", contentIndex: idx, delta, partial: assistant });
      },
      signal,
      12,
    );
    this.emitDelta(assistant, { type: "text_end", contentIndex: idx, content: text, partial: assistant });
  }

  private emitDelta(message: AssistantMessage, ev: AssistantMessageEvent): void {
    this.emit({ type: "message_update", message: structuredClone(message), assistantMessageEvent: ev });
  }

  private async runIpython(assistant: AssistantMessage, cell: IpythonCell, signal: AbortSignal): Promise<void> {
    const callId = id("call");
    const idx = assistant.content.length;
    const toolCall = { type: "toolCall" as const, id: callId, name: "ipython", arguments: { code: cell.code } };
    assistant.content.push(toolCall);
    this.emitDelta(assistant, { type: "toolcall_start", contentIndex: idx, partial: assistant });
    this.emitDelta(assistant, { type: "toolcall_end", contentIndex: idx, toolCall, partial: assistant });

    this.emit({ type: "tool_execution_start", toolCallId: callId, toolName: "ipython", args: { code: cell.code } });
    this.handlers.onLog("info", "repl", `>>> ${cell.code.split("\n")[0]}`);
    await sleep(80, signal);
    let acc = "";
    for (const chunk of cell.outputChunks) {
      acc += chunk;
      this.emit({
        type: "tool_execution_update",
        toolCallId: callId,
        toolName: "ipython",
        args: { code: cell.code },
        partialResult: { content: text(acc) },
      });
      this.handlers.onLog("debug", "repl", chunk);
      await sleep(60, signal);
    }
    this.emit({
      type: "tool_execution_end",
      toolCallId: callId,
      toolName: "ipython",
      result: { content: text(acc), details: { kernel: "python -m rlm.repl" } },
      isError: false,
    });
    const result: ToolResultMessage = {
      role: "toolResult",
      toolCallId: callId,
      toolName: "ipython",
      content: text(acc),
      isError: false,
      timestamp: now(),
    };
    this.pushMessage(result);
    this.active().repl.last = acc;
  }

  private spawnChild(spec: ChildSpec, parentTask: string): void {
    const child: SubagentNode = {
      id: id("rlm"),
      name: spec.name,
      status: "running",
      parentId: this.activeId,
      depth: 1,
      model: this.active().state.model?.id,
      lastEvent: "admitted",
      lastMessage: spec.task,
      toolName: "rlm",
      source: spec.source,
      startedAt: now(),
      updatedAt: now(),
      sessionId: id("child"),
      children: [],
    };
    this.subagents = [...this.subagents, child];
    this.handlers.onSubagents(this.subagents);
    this.handlers.onLog("info", "prime", `rlm admitted ${child.name} (${child.id})`);

    const runChildTurn = async (textOut: string, tool?: { code: string; out: string }, status: SubagentNode["status"] = "running") => {
      const event: PrimeEvent = {
        type: "message_update",
        message: emptyAssistant(this.active().state),
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: textOut },
      };
      this.emit({ type: "observed_session_event", activeSessionId: child.sessionId ?? child.id, event });
      if (tool) {
        const toolId = id("call");
        this.emit({
          type: "observed_session_event",
          activeSessionId: child.sessionId ?? child.id,
          event: {
            type: "tool_execution_start",
            toolCallId: toolId,
            toolName: "ipython",
            args: { code: tool.code },
          },
        });
        this.emit({
          type: "observed_session_event",
          activeSessionId: child.sessionId ?? child.id,
          event: {
            type: "tool_execution_end",
            toolCallId: toolId,
            toolName: "ipython",
            result: { content: text(tool.out) },
            isError: false,
          },
        });
      }
      this.subagents = this.subagents.map((n) =>
        n.id === child.id
          ? { ...n, status, lastMessage: textOut, lastEvent: status, updatedAt: now() }
          : n,
      );
      this.handlers.onSubagents(this.subagents);
    };

    const t1 = setTimeout(() => {
      void runChildTurn(`${spec.name} inspecting ${this.cwd}`, {
        code: `from pathlib import Path\nprint(list(Path(${JSON.stringify(this.cwd)}).glob('*'))[:8])`,
        out: mockLs(this.cwd),
      });
    }, 400);
    const t2 = setTimeout(() => {
      void runChildTurn(spec.result, undefined, "completed");
      this.handlers.onLog("info", "prime", `agent_message from ${spec.name} → parent`);
    }, spec.duration);
    this.childTimers.push(t1, t2);
    void parentTask;
  }
}

interface IpythonCell {
  code: string;
  outputChunks: string[];
}

interface ChildSpec {
  name: string;
  task: string;
  result: string;
  duration: number;
  source: SubagentNode["source"];
}

interface TurnPlan {
  thinking: string;
  ipython: IpythonCell[];
  children: ChildSpec[];
  answer: string;
}

export function planTurn(userText: string): TurnPlan {
  const text = userText.trim();
  const wantsChildren = /子代理|subagent|rlm|审查|review|并行|parallel|调研|research|demo|演示|dispatch|派/i.test(
    text,
  );
  const wantsCode = /code|实现|implement|bug|fix|文件|file|repl|python|bash|ls/i.test(text);

  const children: ChildSpec[] = wantsChildren
    ? [
        {
          name: /auth|认证|登录/i.test(text) ? "auth-reviewer" : "api-reviewer",
          task: "Review the relevant surface and reply to the parent with findings.",
          result: "Findings: no critical issue in the mock tree. Recommend adding an attach/resume check.",
          duration: 1600,
          source: /voice|通话|dispatch/i.test(text) ? "voice" : "rlm",
        },
        {
          name: /test|测试/i.test(text) ? "test-reviewer" : "docs-reviewer",
          task: "Scan tests or docs and report gaps.",
          result: "Gaps: document mock vs rpc, and that voice dispatches only through the root rlm() call.",
          duration: 2200,
          source: "rlm",
        },
      ]
    : [];

  if (/三个|3 |three/i.test(text) && children.length) {
    children.push({
      name: "integration-audit",
      task: "Run a slow integration audit in the background.",
      result: "Audit complete: gateway JSONL framing matches Prime RPC (LF only).",
      duration: 2800,
      source: "rlm",
    });
  }

  const ipython: IpythonCell[] = [];
  if (wantsCode || wantsChildren) {
    ipython.push({
      code: [
        "from pathlib import Path",
        "files = list(Path('.').glob('*'))[:12]",
        "print('cwd files:', [p.name for p in files])",
      ].join("\n"),
      outputChunks: ["cwd files: ", "['package.json', 'apps', 'packages', 'README.md']\n"],
    });
  }
  if (wantsChildren) {
    const calls = children
      .map((c) => `${c.name.replace(/-/g, "_")} = await rlm(${JSON.stringify(c.task)}, name=${JSON.stringify(c.name)})`)
      .join("\n");
    ipython.push({
      code: calls + "\nprint([h.name for h in (await rlm.list_subagents())])",
      outputChunks: [
        "admitted ",
        children.map((c) => c.name).join(", "),
        "\n",
        `${JSON.stringify(children.map((c) => c.name))}\n`,
      ],
    });
  }

  return {
    thinking: wantsChildren
      ? "User wants parallel work. Prime RLM rule: one built-in tool (ipython). Spawn children with rlm(); do not await their answers. Parent keeps a tight context."
      : "Stay inside the REPL programming model. Context is a variable; tools are function calls.",
    ipython,
    children,
    answer: wantsChildren
      ? `Root turn admitted ${children.map((c) => c.name).join(", ")}. This is the real Prime shape: recursive language model, persistent kernel, daemon-reattachable children.`
      : wantsCode
        ? "REPL state is kept across turns. Ask me to spawn reviewers if you want the subagent board to light up."
        : `收到。${text.slice(0, 180)}\n\n我是伊达（Prime Workbench）里的 mock 根代理，协议与 \`prime-agent --mode rpc\` 对齐：prompt / steer / abort、ipython REPL、rlm 子代理。输入「演示子代理」或在通话里说「派一个审查子代理」。`,
  };
}

function emptyActions(): SessionActions {
  return { queuedCount: 0, steering: [], followUps: [] };
}

function emptyAssistant(state: PrimeSessionState): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    provider: state.model?.provider,
    model: state.model?.id,
    timestamp: now(),
    sessionId: state.sessionId,
  };
}

function text(value: string): TextContent[] {
  return [{ type: "text", text: value }];
}

function mockBash(command: string, cwd: string, repl: Record<string, unknown>): string {
  if (command.trim() === "pwd") return cwd;
  if (command.startsWith("echo ")) return command.slice(5);
  if (/\bls\b/.test(command)) return mockLs(cwd);
  repl.lastBash = command;
  return `(mock) ran: ${command}\ncwd=${cwd}`;
}

function mockLs(cwd: string): string {
  return `package.json\napps\npackages\nREADME.md\nLICENSE\n# cwd=${cwd}`;
}
