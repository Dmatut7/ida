import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pm = process.env.PW_PM || "p" + "n" + "pm";
const filters = [
  "@prime-workbench/protocol",
  "@prime-workbench/voice",
  "@prime-workbench/gateway",
  "@prime-workbench/web",
];
const args = ["-r", ...filters.flatMap((f) => ["--filter", f]), "run", "build"];
const child = spawn(pm, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
