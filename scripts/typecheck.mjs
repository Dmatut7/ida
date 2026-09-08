import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pm = process.env.PW_PM || "p" + "n" + "pm";
const child = spawn(pm, ["-r", "run", "typecheck"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
