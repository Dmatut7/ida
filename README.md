# Prime Workbench（伊达 / ida）

独立的桌面/网页工作台，执行核心是 [Prime Agent](https://github.com/Dmatut7/prime-agent-rlm)（`merge/repl-kernel`）：RLM、Python REPL kernel、daemon/RPC、递归子代理。

**不是 OpenAI Codex，也不走 Codex CLI。** UI 布局参考了 [codex-webui](https://github.com/lezi-fun/codex-webui)（MIT）的信息架构，但已去掉 Codex 商标与账号条。

## 功能

- Composer：`prompt` / `steer` / `follow_up` / `abort` / 新会话，对齐 Prime RPC
- **Subagent Board**（一等公民）：mock 下完整演示树；rpc 下从 `rlm()` / `observe` 映射
- Terminal / REPL 事件流
- Diff / Review 面板
- cwd 设置
- **通话模式**：可打断。无 key 用 mock barge-in；有 `OPENAI_API_KEY` 走 Realtime。转写会 dispatch 给根代理

## 快速开始

```bash
git clone https://github.com/Dmatut7/ida.git
cd ida
pnpm install
cp .env.example .env
pnpm dev
```

- UI: http://127.0.0.1:5173
- Gateway: http://127.0.0.1:8787  （WebSocket `/ws`，健康检查 `/health`）
- 默认 `PRIME_MODE=mock`：**不需要安装 prime-agent** 即可端到端使用

生产构建：

```bash
pnpm build
pnpm --filter @prime-workbench/gateway start
# 另开终端预览前端
pnpm --filter @prime-workbench/web preview
```

## Mock vs 真实 Prime

| | `PRIME_MODE=mock` | `PRIME_MODE=rpc` |
| --- | --- | --- |
| 依赖 | 无 | [prime-agent-rlm](https://github.com/Dmatut7/prime-agent-rlm) `merge/repl-kernel` |
| 对话 / REPL / 子代理 | 完整本地演示 | `prime-agent --mode rpc` JSONL（仅 LF 分帧） |
| 语音 | mock barge-in | 同上；执行仍走根代理 |

真实 RPC：

```bash
# 1) 按 prime-agent-rlm 文档安装，并 /login
# 2) 本 fork 建议独立 daemon socket，避免挂到旧 supervisor
export PRIME_MODE=rpc
export PRIME_BIN=prime-agent          # 或绝对路径
export PRIME_CWD=/path/to/your/project
export PRIME_ARGS="--mode rpc --daemon-socket /tmp/prime-agent-ida/daemon.sock"
# 或
export PRIME_DAEMON_SOCKET=/tmp/prime-agent-ida/daemon.sock
pnpm dev
```

Gateway 按 [Prime RPC](https://github.com/Dmatut7/prime-agent-rlm/blob/merge/repl-kernel/packages/coding-agent/docs/rpc.md) 发送 `prompt` / `steer` / `follow_up` / `abort` / `new_session` / `observe`，并把 `message_update`、tool/REPL、`observed_session_event` 转成工作台事件。

完整 daemon 公共 socket 的 attach/replay 未整包复刻；日常路径是 RPC stdin。需要常驻 worker 时把 `--daemon-socket` 交给 `PRIME_ARGS`。

## 语音

```bash
# 可选。留空则 mock
OPENAI_API_KEY=
VOICE_MODE=auto
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
```

- 无 key：通话里打字或开麦，可打断 TTS；「spawn a research subagent」会变成根代理 prompt
- 有 key：gateway 把 PCM16 转到 OpenAI Realtime；转写 `onDispatchPrompt` → 根代理

语音不自己跑代码。子代理必须由根代理 `await rlm(...)`。

## 架构

```
apps/web            React + Vite
packages/gateway    HTTP + WS，mock | rpc 适配器
packages/protocol   共享类型
packages/voice      Realtime + mock 双工会话
```

## 安全

默认绑 `127.0.0.1`。Prime worker/kernel **不是沙箱**。不要把端口暴露到公网。不要把 token 写进仓库。

## License

MIT

---

### English (short)

Prime Workbench is a local UI for **Prime Agent**, not Codex. `pnpm install && pnpm dev` starts mock mode: streaming chat, thinking, REPL/tool events, subagent tree, diffs, interruptible call. Set `PRIME_MODE=rpc` and `PRIME_BIN` / `PRIME_ARGS` to talk to `prime-agent --mode rpc`. Voice transcripts dispatch to the root agent only.
