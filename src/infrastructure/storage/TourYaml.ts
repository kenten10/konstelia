import { parse, stringify } from "yaml";
import type { TourDocument } from "../../domain/tour/TourDocument";
import {
  validateTourDocument,
  type TourValidationIssue,
} from "../../domain/tour/TourValidation";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function serializeTour(tour: TourDocument): Uint8Array {
  return encoder.encode(stringify(tour, { lineWidth: 0 }));
}

export function deserializeTour(content: Uint8Array): TourDocument {
  const value: unknown = parse(decoder.decode(content));
  const issues = validateTourDocument(value);
  if (issues.length > 0) {
    throw new TourDocumentValidationError(issues);
  }
  return value as TourDocument;
}

export class TourDocumentValidationError extends Error {
  public constructor(public readonly issues: readonly TourValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "TourDocumentValidationError";
  }
}
