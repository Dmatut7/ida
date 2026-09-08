# 伊达 / Prime Workbench

独立的 Prime Agent 工作台。执行核心是 **[prime-agent-rlm](https://github.com/Dmatut7/prime-agent-rlm)**（`merge/repl-kernel`）：RLM、Python REPL kernel、daemon/RPC、递归子代理、会话 attach。

**不是 OpenAI Codex，也不走 Codex CLI。**

Independent desktop-like workbench for Prime Agent. UI layout is inspired by [codex-webui](https://github.com/lezi-fun/codex-webui) (MIT) but rebranded for Prime — no Codex trademarks or account chrome.

## 它做什么

浏览器 ↔ WebSocket gateway ↔ `prime-agent --mode rpc`（或 daemon 上的 resident worker）。

- **Composer**：prompt / steer / follow-up / abort，语义对齐 Prime RPC
- **Subagent board**：一等公民，展示 `rlm()` 子树，可 observe
- **REPL / tool 事件**：ipython 单元格与 bash 按 Prime 事件流渲染
- **会话**：new / switch / 扫描 `~/.prime/agent/sessions`
- **cwd**：受限目录选择（不跳出 `$HOME`）
- **终端 + 日志**：命令运行器与 gateway/REPL 日志
- **通话模式**：可打断（barge-in）。Mock 不需要云；Realtime API 可选。语音只讨论需求，执行一律交给根代理 `rlm()`

## 快速开始

```bash
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173`。默认 `PRIME_MODE=mock`，**不需要安装 prime-agent**，即可演示流式对话、REPL 事件、子代理树、转向/中止、通话抢话。

```bash
# 只起网关（已 build 前端时也提供静态页）
PRIME_MODE=mock pnpm --filter @ida/gateway start
```

## Mock vs 真实 Prime

| | `PRIME_MODE=mock` | `PRIME_MODE=rpc` |
| --- | --- | --- |
| 依赖 | 无 | [Dmatut7/prime-agent-rlm](https://github.com/Dmatut7/prime-agent-rlm) `merge/repl-kernel` |
| 对话 / REPL / 子代理 | 完整本地演示 | 真实 `prime-agent --mode rpc` JSONL |
| 模型 | mock-prime-rlm | 你本机已登录的 provider |
| daemon attach | 模拟 | `--resume` / `observe` / 扫描 session 目录 |

真实模式：

```bash
git clone https://github.com/Dmatut7/prime-agent-rlm.git
cd prime-agent-rlm
# 按该仓文档准备 Python runtime 与 /login

export PRIME_MODE=rpc
export PRIME_AGENT_BIN=/path/to/prime-agent   # 或 PATH 中的 prime-agent
# 本 fork 务必带上独立 daemon socket，避免挂到旧 supervisor
export PRIME_AGENT_ARGS="--daemon-socket /tmp/prime-agent-ida/daemon.sock"
export PRIME_CWD=/path/to/your/project
```

在本仓库根目录：

```bash
PRIME_MODE=rpc PRIME_AGENT_BIN=prime-agent \
  PRIME_AGENT_ARGS="--daemon-socket /tmp/prime-agent-ida/daemon.sock" \
  pnpm dev
```

Gateway 使用 **LF-only JSONL**（不用 Node `readline`），与 [Prime RPC 文档](https://github.com/Dmatut7/prime-agent-rlm/blob/merge/repl-kernel/packages/coding-agent/docs/rpc.md) 一致。

## 语音

1. 点顶栏电话进入 **通话模式**
2. **Mock barge-in**（默认）：浏览器麦克风能量或 Web Speech 转写；说话会打断 TTS；可输入「派一个审查子代理」
3. **Realtime**：设置 `OPENAI_API_KEY` 后，gateway 把 PCM 转到 OpenAI Realtime。工具 `dispatch_subagent` / `steer_root` / `abort_root` 只驱动根 Prime Agent

语音**不会**自己跑代码。子代理必须由根代理在 REPL 里 `await rlm(...)`。

## 仓库结构

```
apps/web            React + Vite 工作台
packages/gateway    HTTP + WebSocket，mock / rpc 适配
packages/protocol   Prime RPC + 工作台事件类型
packages/voice      双工语音（Realtime + mock 抢话）
```

## 配置

见 `.env.example`。常用：

- `HOST` / `PORT` — 默认 `127.0.0.1:7788`
- `PRIME_MODE=mock|rpc`
- `PRIME_AGENT_BIN` / `PRIME_AGENT_ARGS` / `PRIME_DAEMON_SOCKET` / `PRIME_CWD`
- `IDA_ACCESS_TOKEN` — 可选，保护 `/api` 与 `/ws`
- `OPENAI_API_KEY` — 仅 Realtime 通话需要

不要把 token 写进仓库。

## 安全

Prime 的 worker/kernel **不是沙箱**。本工作台默认只绑 localhost。目录浏览限制在 `$HOME`。把端口暴露到公网等于把本机 shell 和 REPL 暴露出去。

## 已知缺口（诚实）

- Daemon 公共 socket 的完整 attach/replay 协议未在本仓复刻；rpc 模式以 `prime-agent --mode rpc` 为准，会话列表靠扫描 `~/.prime/agent/sessions`，子代理 observe 是 best-effort
- 终端是 bash 命令运行器，不是完整交互式 TTY/Vim
- Mock STT 依赖 Chrome Web Speech，或通话框里打字；无云密钥时不会假装 Realtime 已接通
- 没有 Codex 的 Review diff / 账号头像 / Knot 品牌
- 真实推理需要本机已对 Prime 做过 `/login`

## License

MIT. UI 布局参考了 MIT 许可的 codex-webui；未包含其第三方品牌资源。

---

### English (short)

Prime Workbench (ida / 伊达) is a local workbench for **Prime Agent**, not Codex. `pnpm install && pnpm dev` starts a full mock: streaming chat, REPL/tool events, subagent tree, steer/abort, interruptible call mode. Set `PRIME_MODE=rpc` to spawn `prime-agent --mode rpc`. Voice discusses requirements and can only dispatch work by asking the root agent to `rlm()`.
