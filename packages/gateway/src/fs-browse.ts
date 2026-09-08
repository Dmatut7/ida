import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { WorkbenchFsEntry } from "@ida/protocol";
import { expandHome, homeDir } from "./util.js";

export function browseDir(input: string | undefined): { cwd: string; parent: string | null; entries: WorkbenchFsEntry[] } {
  const root = homeDir();
  const requested = resolve(expandHome(input || root));
  if (!requested.startsWith(root)) {
    throw new Error("path escapes home directory");
  }
  if (!existsSync(requested) || !statSync(requested).isDirectory()) {
    throw new Error("not a directory");
  }
  const names = readdirSync(requested).filter((name) => !name.startsWith("."));
  const entries: WorkbenchFsEntry[] = [];
  for (const name of names.slice(0, 200)) {
    const path = resolve(requested, name);
    try {
      const st = statSync(path);
      if (st.isSymbolicLink()) continue;
      entries.push({ name, path, type: st.isDirectory() ? "dir" : "file" });
    } catch {
      /* skip */
    }
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const parent = requested === root ? null : dirname(requested);
  return { cwd: requested, parent, entries };
}
