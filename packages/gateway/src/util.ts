import { randomBytes } from "node:crypto";

export function id(prefix = "id"): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function now(): number {
  return Date.now();
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function streamText(
  text: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  delay = 16,
): Promise<void> {
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    onChunk(part);
    await sleep(delay, signal);
  }
}

export function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd();
}

export function expandHome(input: string): string {
  if (input === "~") return homeDir();
  if (input.startsWith("~/")) return `${homeDir()}/${input.slice(2)}`;
  return input;
}
