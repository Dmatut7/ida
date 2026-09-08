import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { BackendHandlers } from "./backends/types.js";

export class ShellSession {
  private cwd: string;
  private handlers: BackendHandlers;
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(cwd: string, handlers: BackendHandlers) {
    this.cwd = cwd;
    this.handlers = handlers;
  }

  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  write(data: string): void {
    if (this.child?.stdin.writable) {
      this.child.stdin.write(data);
      return;
    }
    const line = data.replace(/\r/g, "").trimEnd();
    if (!line) return;
    this.run(line);
  }

  run(command: string): void {
    this.handlers.onLog("info", "terminal", `$ ${command}`);
    this.child?.kill();
    this.child = spawn("/bin/bash", ["-lc", command], {
      cwd: this.cwd,
      env: process.env,
    });
    const pump = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.handlers.onLog("debug", "terminal", text);
      this.onOut?.(text);
    };
    this.child.stdout.on("data", pump);
    this.child.stderr.on("data", pump);
    this.child.on("exit", (code) => {
      this.onOut?.(`\n[exit ${code}]\n`);
      this.child = null;
    });
  }

  onOut: ((data: string) => void) | null = null;
}
