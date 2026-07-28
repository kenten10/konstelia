import { parse, stringify } from "yaml";
import type { TourAnchor } from "../../domain/tour/TourAnchor";
import { isSafeTourSourcePath } from "../../domain/tour/TourSourcePath";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function serializeAnchors(anchors: readonly TourAnchor[]): Uint8Array {
  return encoder.encode(stringify({ anchors }, { lineWidth: 0 }));
}

export function deserializeAnchors(content: Uint8Array): TourAnchor[] {
  const value: unknown = parse(decoder.decode(content));
  if (!isAnchorRegistry(value)) {
    throw new AnchorRegistryValidationError("The anchor registry is not valid.");
  }
  return value.anchors;
}

export class AnchorRegistryValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AnchorRegistryValidationError";
  }
}

function isAnchorRegistry(value: unknown): value is { anchors: TourAnchor[] } {
  if (!isRecord(value) || !Array.isArray(value.anchors)) {
    return false;
  }
  const ids = new Set<string>();
  for (const anchor of value.anchors) {
    if (!isAnchor(anchor) || ids.has(anchor.id)) {
      return false;
    }
    ids.add(anchor.id);
  }
  return true;
}

function isAnchor(value: unknown): value is TourAnchor {
  if (!isRecord(value)) {
    return false;
  }
  const refinementValid =
    value.refinement === undefined || value.refinement === null || typeof value.refinement === "string";
  const snapshotValid =
    value.snapshot === undefined ||
    (isRecord(value.snapshot) &&
      typeof value.snapshot.hash === "string" &&
      typeof value.snapshot.text === "string");
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.file === "string" &&
    isSafeTourSourcePath(value.file) &&
    typeof value.symbol === "string" &&
    value.symbol.length > 0 &&
    refinementValid &&
    snapshotValid
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
