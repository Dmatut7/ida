export type VoiceMode = "mock" | "realtime";

export type VoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error";

export type VoiceClientCommand =
  | { type: "voice.start"; mode: VoiceMode }
  | { type: "voice.stop" }
  | { type: "voice.audio"; pcm: string; mime?: string }
  | { type: "voice.interrupt"; reason?: "barge-in" | "user" }
  | { type: "voice.transcript"; text: string; final?: boolean };

export type VoiceDispatchKind =
  | "prompt"
  | "steer"
  | "follow_up"
  | "abort"
  | "dispatch_subagent";

export interface VoiceDispatch {
  kind: VoiceDispatchKind;
  message?: string;
  name?: string;
  task?: string;
}

export type VoiceServerEvent =
  | {
      type: "voice.state";
      phase: VoicePhase;
      mode: VoiceMode;
      bargeIn: boolean;
      speaking: boolean;
    }
  | {
      type: "voice.transcript";
      role: "user" | "assistant";
      text: string;
      final: boolean;
    }
  | {
      type: "voice.audio";
      pcm: string;
      mime?: string;
    }
  | {
      type: "voice.speak";
      text: string;
      interruptible: true;
    }
  | {
      type: "voice.dispatch";
      dispatch: VoiceDispatch;
    }
  | {
      type: "voice.error";
      message: string;
    };

export const VOICE_TOOLS = [
  {
    name: "discuss_requirements",
    description:
      "Clarify or record product/engineering requirements. Does not execute code. Use before dispatching work.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Short requirement summary" },
        questions: { type: "array", items: { type: "string" } },
      },
      required: ["summary"],
    },
  },
  {
    name: "dispatch_subagent",
    description:
      "Ask the root Prime Agent to spawn an RLM child via rlm(task, name=...). Voice never executes work itself.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        task: { type: "string" },
      },
      required: ["name", "task"],
    },
  },
  {
    name: "steer_root",
    description: "Steer the running root Prime Agent after the current tool turn.",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  {
    name: "follow_up_root",
    description: "Queue a follow-up for the root Prime Agent after it finishes.",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  {
    name: "abort_root",
    description: "Abort the current root Prime Agent turn.",
    parameters: { type: "object", properties: {} },
  },
] as const;
