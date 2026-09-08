import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pm = process.env.PW_PM || "p" + "n" + "pm";

function run(args) {
  const r = spawnSync(pm, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: process.env });
  if (r.status) process.exit(r.status ?? 1);
}

console.log("[dev] building protocol + voice…");
run(["--filter", "@prime-workbench/protocol", "--filter", "@prime-workbench/voice", "run", "build"]);

const filters = [
  "@prime-workbench/protocol",
  "@prime-workbench/voice",
  "@prime-workbench/gateway",
  "@prime-workbench/web",
];
const args = ["-r", "--parallel", ...filters.flatMap((f) => ["--filter", f]), "run", "dev"];
console.log(`[dev] ${pm} ${args.join(" ")}`);
const child = spawn(pm, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
