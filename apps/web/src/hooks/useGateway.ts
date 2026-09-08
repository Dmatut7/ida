import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  DiffFile,
  ServerMessage,
  SessionState,
  SubagentNode,
  TerminalLine,
  VoiceUiState,
} from "@prime-workbench/protocol";
import { GatewaySocket } from "../lib/ws";

export function useGateway() {
  const sockRef = useRef<GatewaySocket | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tree, setTree] = useState<SubagentNode | null>(null);
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const [diffs, setDiffs] = useState<DiffFile[]>([]);
  const [voice, setVoice] = useState<VoiceUiState>({
    phase: "idle",
    mode: "mock",
    captions: "",
    userPartial: "",
    level: 0,
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const sock = new GatewaySocket();
    sockRef.current = sock;
    const unsub = sock.on((msg: ServerMessage) => {
      switch (msg.type) {
        case "hello_ok":
        case "state":
          setState(msg.state);
          setConnected(true);
          break;
        case "chat_upsert":
          setMessages((prev) => upsertMessage(prev, msg.message));
          break;
        case "chat_delta":
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msg.id) return m;
              if (msg.field === "thinking") {
                return { ...m, thinking: (m.thinking ?? "") + msg.delta, streaming: true };
              }
              return { ...m, content: m.content + msg.delta, streaming: true };
            }),
          );
          break;
        case "chat_done":
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, streaming: false } : m)));
          break;
        case "subagent_tree":
          setTree(msg.root);
          break;
        case "subagent_upsert":
          setTree((prev) => (prev ? patchTree(prev, msg.node) : msg.node));
          break;
        case "terminal":
          setTerminal((prev) => [...prev.slice(-400), msg.line]);
          break;
        case "diff":
          setDiffs(msg.files);
          break;
        case "voice_state":
          setVoice(msg.state);
          break;
        case "voice_transcript":
          setVoice((v) =>
            msg.role === "assistant"
              ? { ...v, captions: msg.text }
              : { ...v, userPartial: msg.text },
          );
          break;
        case "voice_audio":
          window.dispatchEvent(
            new CustomEvent("pw-voice-audio", {
              detail: { pcm16Base64: msg.pcm16Base64, sampleRate: msg.sampleRate },
            }),
          );
          break;
        case "error":
          setTerminal((prev) => [
            ...prev,
            { id: String(Date.now()), stream: "stderr", text: msg.message, timestamp: Date.now() },
          ]);
          break;
        default:
          break;
      }
    });
    sock.connect();
    const iv = window.setInterval(() => setConnected(sock.connected), 800);
    return () => {
      unsub();
      sock.dispose();
      window.clearInterval(iv);
    };
  }, []);

  const send = useCallback((msg: Parameters<GatewaySocket["send"]>[0]) => {
    sockRef.current?.send(msg);
  }, []);

  const prompt = useCallback(
    (text: string) => {
      const id = crypto.randomUUID();
      send({ type: "prompt", id, message: text });
    },
    [send],
  );

  return useMemo(
    () => ({
      state,
      messages,
      tree,
      terminal,
      diffs,
      voice,
      connected,
      send,
      prompt,
    }),
    [state, messages, tree, terminal, diffs, voice, connected, send, prompt],
  );
}

function upsertMessage(prev: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const idx = prev.findIndex((m) => m.id === msg.id);
  if (idx === -1) return [...prev, msg];
  const next = prev.slice();
  next[idx] = msg;
  return next;
}

function patchTree(root: SubagentNode, node: SubagentNode): SubagentNode {
  if (root.id === node.id) return { ...root, ...node, children: node.children ?? root.children };
  return {
    ...root,
    children: root.children?.map((c) => patchTree(c, node)),
  };
}
