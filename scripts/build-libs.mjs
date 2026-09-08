import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pm = process.env.PW_PM || "p" + "n" + "pm";
const r = spawnSync(
  pm,
  ["--filter", "@prime-workbench/protocol", "--filter", "@prime-workbench/voice", "run", "build"],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: process.env },
);
process.exit(r.status ?? 0);
