/** Build argv for `prime-agent --mode rpc` (LF JSONL). Optionally pin a daemon socket. */
export function buildPrimeRpcArgs(input: {
  args?: string[];
  envArgs?: string;
  daemonSocket?: string;
}): string[] {
  const fromEnv = (input.envArgs ?? "").split(/\s+/).filter(Boolean);
  const args = [...(input.args ?? (fromEnv.length ? fromEnv : ["--mode", "rpc"]))];
  if (!args.includes("--mode") && !args.includes("rpc")) {
    args.unshift("--mode", "rpc");
  }
  const sock = input.daemonSocket;
  if (sock && !args.some((a) => a.includes("daemon-socket"))) {
    args.push("--daemon-socket", sock);
  }
  return args;
}

export function parseRlmSpawns(toolName: string, args: Record<string, unknown> | undefined): { name: string; task: string }[] {
  const code = String(args?.code ?? args?.command ?? "");
  const named = [...code.matchAll(/rlm\s*\(\s*(['"`])([\s\S]*?)\1[\s\S]*?name\s*=\s*(['"`])([^'"`]+)\3/g)];
  const kids = named.map((m) => ({ task: m[2] ?? "rlm child", name: m[4] ?? "child" }));
  if (!kids.length && (/rlm\s*\(/.test(code) || toolName === "rlm")) {
    kids.push({ name: "child-1", task: "rlm spawn" });
  }
  return kids;
}
