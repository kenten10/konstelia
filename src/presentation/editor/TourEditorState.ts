import type { TourDocument } from "../../domain/tour/TourDocument";
import { TourScope } from "../../domain/tour/TourScope";

export interface TourEditorRestoreTarget {
  readonly scope: TourScope;
  readonly tourId: string;
  /** Present only when the page was holding edits that had not been written yet. */
  readonly unsavedTour?: TourDocument;
}

/**
 * The webview is a separate, untrusted process. Only documents whose shape the form and the
 * diagram can handle are accepted; the values themselves are checked by `UpdateTour`.
 */
export function isTourDocumentShape(value: unknown): value is TourDocument {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const tour = value as Partial<TourDocument>;
  return typeof tour.id === "string"
    && typeof tour.title === "string"
    && Array.isArray(tour.steps)
    && tour.steps.every((step) =>
      typeof step === "object" && step !== null
      && Array.isArray(step.hops)
      && step.hops.every((hop) =>
        typeof hop === "object" && hop !== null && Array.isArray(hop.anchors)));
}

/**
 * Reads the state VS Code kept for a tour editor across a window reload. Unsaved work is
 * usually mid-edit and therefore invalid, which the editor is built to display, so only the
 * shape of the document has to hold for it to be restored.
 */
export function parseTourEditorState(state: unknown): TourEditorRestoreTarget | undefined {
  if (typeof state !== "object" || state === null) {
    return undefined;
  }
  const { scope, tourId, tour, dirty } = state as {
    scope?: unknown;
    tourId?: unknown;
    tour?: unknown;
    dirty?: unknown;
  };
  const scopes: readonly string[] = Object.values(TourScope);
  if (typeof scope !== "string" || !scopes.includes(scope) || typeof tourId !== "string" || !tourId) {
    return undefined;
  }
  const unsavedTour = dirty === true && isTourDocumentShape(tour) && tour.id === tourId
    ? tour
    : undefined;
  return { scope: scope as TourScope, tourId, ...(unsavedTour ? { unsavedTour } : {}) };
}
