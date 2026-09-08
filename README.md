# Prime Workbench

独立的桌面/网页工作台，面向 [Prime Agent](https://github.com/Dmatut7/prime-agent-rlm)（RLM / REPL / daemon / RPC）。

UI 布局灵感来自桌面 Agent 工作台信息架构（参考 [lezi-fun/codex-webui](https://github.com/lezi-fun/codex-webui)），但 **Prime 才是协议与能力的 source of truth**——本仓库重新实现界面与网关，不使用 Codex 商标。

## 功能

- 对话 transcript + composer（prompt / steer / abort / new session）
- **Subagent Board**：一等公民的 RLM 子代理树
- 底部 Terminal / REPL 面板
- Diff / Review 面板
- 工作目录（cwd）设置
- **双工语音 Call Mode**：OpenAI Realtime 风格架构；无 key 时自动 **mock**（可打断 / barge-in）

## 快速开始

```bash
cd /workspace/prime-workbench
pnpm install
cp .env.example .env
pnpm dev
```

默认：

- UI: http://127.0.0.1:5173
- Gateway: http://127.0.0.1:8787  （WebSocket `/ws`）
- `PRIME_MODE=mock` —— **无需安装 prime-agent** 即可端到端使用

## 连接本地 prime-agent（真实 RPC）

1. 安装/构建 [prime-agent](https://github.com/Dmatut7/prime-agent-rlm)，确保 CLI 在 `PATH` 中。
2. 编辑 `.env`：

```bash
PRIME_MODE=rpc
PRIME_BIN=prime-agent
PRIME_ARGS=--mode rpc --no-session
PRIME_CWD=/path/to/your/project
```

3. 重新 `pnpm dev`。Gateway 会 spawn `prime-agent --mode rpc`，按官方 JSONL（LF-only）协议收发核心命令，并流式转发事件。

说明：真实 daemon socket 协议、完整 observe/subagent catalog 等尚未全部接入；RPC stdin 适配器覆盖日常使用路径。

## 语音设置

```bash
OPENAI_API_KEY=sk-...
VOICE_MODE=auto
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
```

- 有 key：Realtime WebSocket 桥（PCM16、VAD、打断）。转写 dispatch 到 root agent。
- 无 key：mock 模式演示 barge-in UX。

## 架构

```
apps/web          React + Vite UI
packages/gateway  Node gateway：WS ↔ Prime adapter（mock | rpc）
packages/protocol 共享类型
packages/voice    Realtime / mock 双工语音会话
```

## License

MIT
