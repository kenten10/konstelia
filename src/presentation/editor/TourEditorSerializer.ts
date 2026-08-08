import {
  window,
  type ExtensionContext,
  type WebviewPanel,
  type WebviewPanelSerializer,
} from "vscode";
import type { TourDraft } from "../../application/tours/LoadTourDraft";
import { TourScope } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";
import type { TourEditorHost } from "../commands/EditTourCommand";
import { TourEditorPanel, tourEditorViewType } from "./TourEditorPanel";

export interface RestoredTourEditor {
  readonly draft: TourDraft;
  readonly host: TourEditorHost;
}

export type TourEditorOpener = (scope: TourScope, id: string) => Promise<RestoredTourEditor>;

/**
 * Restores tour editors after a window reload. Without a serializer VS Code leaves an empty,
 * unusable tab behind, and reopening the tour would add a second tab for the same file.
 */
export class TourEditorSerializer implements WebviewPanelSerializer {
  public constructor(
    private readonly context: ExtensionContext,
    private readonly openEditor: TourEditorOpener,
    private readonly logger: Logger,
  ) {
    context.subscriptions.push(
      window.registerWebviewPanelSerializer(tourEditorViewType, this),
    );
  }

  public async deserializeWebviewPanel(panel: WebviewPanel, state: unknown): Promise<void> {
    const target = parseState(state);
    if (!target) {
      panel.dispose();
      return;
    }
    try {
      const { draft, host } = await this.openEditor(target.scope, target.tourId);
      TourEditorPanel.adopt(this.context, panel, draft, host);
    } catch (error) {
      this.logger.error(`Could not restore the editor for tour '${target.tourId}'`, error);
      panel.dispose();
    }
  }
}

function parseState(state: unknown): { scope: TourScope; tourId: string } | undefined {
  if (typeof state !== "object" || state === null) {
    return undefined;
  }
  const { scope, tourId } = state as { scope?: unknown; tourId?: unknown };
  const scopes: readonly string[] = Object.values(TourScope);
  if (typeof scope !== "string" || !scopes.includes(scope) || typeof tourId !== "string" || !tourId) {
    return undefined;
  }
  return { scope: scope as TourScope, tourId };
}
