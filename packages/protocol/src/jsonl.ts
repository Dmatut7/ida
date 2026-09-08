/**
 * Prime RPC framing: LF-delimited JSONL only.
 * Do not use Node readline — it also splits on U+2028 / U+2029.
 */
export function splitJsonl(buffer: string): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let rest = buffer;
  while (true) {
    const idx = rest.indexOf("\n");
    if (idx === -1) break;
    let line = rest.slice(0, idx);
    rest = rest.slice(idx + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.length > 0) lines.push(line);
  }
  return { lines, rest };
}

export function parseJsonlLine(line: string): unknown {
  return JSON.parse(line);
}

export function encodeJsonl(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
