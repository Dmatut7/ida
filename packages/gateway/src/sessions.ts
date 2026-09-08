import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SessionSummary } from "@ida/protocol";
import { homeDir } from "./util.js";

export function defaultSessionDir(override?: string): string {
  if (override) return override;
  if (process.env.PRIME_SESSION_DIR) return process.env.PRIME_SESSION_DIR;
  return join(homeDir(), ".prime", "agent", "sessions");
}

export function scanPrimeSessions(override?: string): SessionSummary[] {
  const dir = defaultSessionDir(override);
  if (!existsSync(dir)) return [];
  const out: SessionSummary[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
  } catch {
    return [];
  }
  for (const name of entries) {
    const path = join(dir, name);
    try {
      const st = statSync(path);
      const first = readFileSync(path, "utf8").split("\n").find((line) => line.trim());
      let header: Record<string, unknown> = {};
      if (first) {
        try {
          header = JSON.parse(first) as Record<string, unknown>;
        } catch {
          header = {};
        }
      }
      const id = String(header.id ?? header.sessionId ?? name.replace(/\.jsonl$/, ""));
      out.push({
        id,
        name: String(header.name ?? header.sessionName ?? id),
        cwd: String(header.cwd ?? header.workingDirectory ?? ""),
        updatedAt: st.mtimeMs,
        messageCount: Number(header.messageCount ?? 0),
        streaming: false,
        source: "daemon",
        sessionFile: path,
      });
    } catch {
      /* skip unreadable session */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 80);
}
