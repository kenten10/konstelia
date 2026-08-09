import {
  Disposable,
  ViewColumn,
  window,
  type ExtensionContext,
  type WebviewPanel,
} from "vscode";
import type { TourDraft } from "../../application/tours/LoadTourDraft";
import { buildTourFlowDiagram } from "../../domain/tour/TourFlowDiagram";
import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourValidationIssue } from "../../domain/tour/TourValidation";
import type { TourEditorHost } from "../commands/EditTourCommand";
import { diagramColumns } from "../flow/TourFlowDiagramView";
import { layoutTourFlowDiagram } from "../flow/TourFlowLayout";
import { renderTourFlowSvg } from "../flow/TourFlowSvg";
import { renderTourEditorHtml, type RenderedDraft } from "./TourEditorHtml";
import { isTourDocumentShape } from "./TourEditorState";

interface EditorMessage {
  readonly type?: string;
  readonly tour?: unknown;
  readonly requestId?: unknown;
  readonly target?: unknown;
}

export const tourEditorViewType = "konstelia.tourEditor";

/**
 * The dedicated tour editing screen. The webview owns the form, while the extension host owns
 * validation, persistence, and the flow diagram that is regenerated from every edit.
 */
export class TourEditorPanel {
  private static readonly open = new Map<string, TourEditorPanel>();

  /** Closes every editing screen when the extension shuts down, without leaking per-panel entries. */
  public static register(context: ExtensionContext): void {
    context.subscriptions.push({
      dispose: () => {
        for (const editor of [...TourEditorPanel.open.values()]) {
          editor.panel.dispose();
        }
      },
    });
  }

  public static show(draft: TourDraft, host: TourEditorHost): void {
    const existing = TourEditorPanel.open.get(panelKey(draft));
    if (existing) {
      // Anchors or linkable steps may have been added since the panel was opened.
      existing.reload(draft);
      existing.panel.reveal(existing.panel.viewColumn ?? ViewColumn.Active);
      return;
    }
    TourEditorPanel.adopt(
      window.createWebviewPanel(
        tourEditorViewType,
        `Konstelia: ${draft.tour.title}`,
        ViewColumn.Active,
        editorPanelOptions,
      ),
      draft,
      host,
    );
  }

  /**
   * Takes over a panel VS Code restored after a reload. `unsavedTour` is the document the
   * author was editing when the window went away; it replaces the one read from disk.
   */
  public static adopt(
    panel: WebviewPanel,
    draft: TourDraft,
    host: TourEditorHost,
    unsavedTour?: TourDocument,
  ): void {
    const key = panelKey(draft);
    const existing = TourEditorPanel.open.get(key);
    if (existing) {
      panel.dispose();
      existing.reload(draft);
      existing.panel.reveal(existing.panel.viewColumn ?? ViewColumn.Active);
      return;
    }
    panel.webview.options = editorPanelOptions;
    const restored = unsavedTour && unsavedTour.id === draft.tour.id
      ? { ...draft, tour: unsavedTour, restored: true }
      : draft;
    const editor = new TourEditorPanel(panel, restored, host, key);
    if (restored !== draft) {
      editor.setTitle(restored.tour.title, true);
    }
    TourEditorPanel.open.set(key, editor);
  }

  private disposed = false;
  private unsaved = false;
  private latestRequestId = 0;

  private constructor(
    private readonly panel: WebviewPanel,
    draft: RenderedDraft,
    private readonly host: TourEditorHost,
    key: string,
  ) {
    panel.webview.html = renderTourEditorHtml(draft);
    const subscriptions = [
      panel.webview.onDidReceiveMessage((message: EditorMessage) => {
        void this.handle(message);
      }),
      panel.onDidDispose(() => {
        this.disposed = true;
        TourEditorPanel.open.delete(key);
        Disposable.from(...subscriptions).dispose();
      }),
    ];
  }

  /** Picks up anchors and link targets added since the panel was opened. */
  private reload(draft: TourDraft): void {
    if (this.unsaved) {
      // Replacing the page would throw away edits the author has not saved yet.
      return;
    }
    this.panel.webview.html = renderTourEditorHtml(draft);
  }

  private async handle(message: EditorMessage): Promise<void> {
    if (message.type === "createAnchor") {
      await this.createAnchor(message.target);
      return;
    }
    const tour = message.tour;
    if (!isTourDocumentShape(tour) || (message.type !== "change" && message.type !== "save")) {
      return;
    }
    const requestId = typeof message.requestId === "number" ? message.requestId : 0;
    this.latestRequestId = Math.max(this.latestRequestId, requestId);
    this.postDiagram(tour, requestId);
    if (message.type === "change" && requestId > 0) {
      // The tab is the only place an author sees that the panel holds unsaved edits.
      this.setTitle(tour.title, true);
    }
    try {
      const issues = message.type === "save"
        ? await this.host.save(tour)
        : await this.host.validate(tour);
      // A slower validation started earlier must not overwrite a newer answer.
      if (message.type === "change" && requestId < this.latestRequestId) {
        return;
      }
      await this.post({ type: "issues", issues, requestId });
      if (message.type === "save" && issues.length === 0) {
        // What was written is the document as it stood when save was pressed. Edits made while
        // the write was in flight are still unsaved and must not be reported as saved.
        const superseded = requestId < this.latestRequestId;
        this.setTitle(tour.title, superseded);
        await this.post({ type: "saved", superseded });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "An unexpected error occurred.";
      const issues: TourValidationIssue[] = [{ path: "$", message: reason }];
      await this.post({ type: "issues", issues, requestId });
      if (message.type === "save" && !this.disposed) {
        void window.showErrorMessage(`Could not save tour: ${reason}`);
      }
    }
  }

  private postDiagram(tour: TourDocument, requestId: number): void {
    try {
      const layout = layoutTourFlowDiagram(buildTourFlowDiagram(tour), { columns: diagramColumns() });
      void this.post({ type: "diagram", svg: renderTourFlowSvg(layout), requestId });
    } catch {
      // A half-edited document is not worth a diagram; the next edit re-renders it.
    }
  }

  /** Creates an anchor from the author's current source selection and reports it back. */
  private async createAnchor(target: unknown): Promise<void> {
    try {
      const created = await this.host.createAnchor();
      if (created) {
        await this.post({ type: "anchorCreated", target, id: created.id, anchors: created.anchors });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "An unexpected error occurred.";
      if (!this.disposed) {
        void window.showErrorMessage(`Could not create anchor: ${reason}`);
      }
    }
  }

  private setTitle(title: string, unsaved: boolean): void {
    this.unsaved = unsaved;
    if (this.disposed) {
      return;
    }
    this.panel.title = `${unsaved ? "● " : ""}Konstelia: ${title}`;
  }

  /** The panel may be closed while a save is in flight; a disposed webview throws on use. */
  private async post(message: Record<string, unknown>): Promise<void> {
    if (this.disposed) {
      return;
    }
    await this.panel.webview.postMessage(message);
  }
}

const editorPanelOptions = {
  enableScripts: true,
  retainContextWhenHidden: true,
  localResourceRoots: [],
} as const;

function panelKey(draft: TourDraft): string {
  return `${draft.scope}:${draft.tour.id}`;
}

