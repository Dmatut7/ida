import { StringDecoder } from "node:string_decoder";
import { splitJsonl } from "@ida/protocol";
import type { Readable } from "node:stream";

export function attachJsonlReader(stream: Readable, onLine: (line: string) => void): void {
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  stream.on("data", (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    const split = splitJsonl(buffer);
    buffer = split.rest;
    for (const line of split.lines) onLine(line);
  });

  stream.on("end", () => {
    buffer += decoder.end();
    if (buffer.length > 0) {
      onLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
    }
  });
}
