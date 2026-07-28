import { createHash } from "node:crypto";
import type { TourAnchorSnapshot } from "../../domain/tour/TourAnchor";

export function createAnchorSnapshot(sourceText: string): TourAnchorSnapshot {
  const text = normalizeSnapshotText(sourceText);
  const hash = createHash("sha256").update(text).digest("hex");
  return { hash: `sha256:${hash}`, text };
}

export function normalizeSnapshotText(sourceText: string): string {
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indentation = lines
    .filter((line) => line.trim())
    .map((line) => /^\s*/.exec(line)?.[0].length ?? 0);
  const commonIndentation = indentation.length > 0 ? Math.min(...indentation) : 0;
  return lines
    .map((line) => line.slice(commonIndentation).trimEnd())
    .join("\n");
}
