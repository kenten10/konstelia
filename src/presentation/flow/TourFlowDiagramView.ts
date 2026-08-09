import {
  commands,
  window,
  workspace,
  type ExtensionContext,
  type WebviewView,
  type WebviewViewProvider,
} from "vscode";
import type {
  TourPlaybackObserver,
  TourPlaybackSession,
} from "../../application/tours/TourPlayback";
import type { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { PlaybackPosition } from "../../application/tours/TourPlaybackActions";
import {
  buildTourFlowDiagram,
  parseTourFlowNodeId,
  tourFlowNodeId,
  type TourFlowDiagram,
} from "../../domain/tour/TourFlowDiagram";
import { createNonce } from "../webview/WebviewSupport";
import { layoutTourFlowDiagram } from "./TourFlowLayout";
import { renderTourFlowSvg, tourFlowStyles } from "./TourFlowSvg";

export const flowDiagramViewId = "konstelia.flowDiagram";

interface DiagramSource {
  readonly scope: TourScope;
  readonly tour: TourDocument;
  readonly diagram: TourFlowDiagram;
  readonly subtitle: string;
}

/** Starts a tour the way the picker does, so health and binding rules still apply. */
export type PlayFromDiagram = (
  scope: TourScope,
  tourId: string,
  startAt: PlaybackPosition,
) => Promise<void>;

interface ViewMessage {
  readonly type?: string;
  readonly nodeId?: string;
}

/**
 * Shows the flow diagram in the panel area. During playback it is a pure projection of
 * `TourPlayer` state, and a click on a node asks playback to jump to that hop.
 */
export class TourFlowDiagramView implements WebviewViewProvider, TourPlaybackObserver {
  private view: WebviewView | undefined;
  private source: DiagramSource | undefined;
  private session: TourPlaybackSession | undefined;
  private unsubscribe: (() => void) | undefined;

  public constructor(context: ExtensionContext, private readonly playFromDiagram?: PlayFromDiagram) {
    context.subscriptions.push(
      window.registerWebviewViewProvider(flowDiagramViewId, this, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
      { dispose: () => this.onTourStopped() },
    );
  }

  public resolveWebviewView(view: WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = renderFlowDiagramHtml();
    view.webview.onDidReceiveMessage((message: ViewMessage) => this.handle(message));
    // A hidden webview drops messages even with retainContextWhenHidden, so anything that
    // happened while the panel was on another tab has to be redrawn on the way back.
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.render();
      }
    });
    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = undefined;
      }
    });
    this.render();
  }

  /** Shows a tour that is not being played, for example from the browse command. */
  public async show(
    scope: TourScope,
    tour: TourDocument,
    anchorHealth?: ReadonlyMap<string, AnchorHealth>,
  ): Promise<void> {
    this.source = {
      scope,
      tour,
      diagram: buildTourFlowDiagram(tour, { anchorHealth }),
      subtitle: `${tour.steps.length} ステップ / ${countHops(tour)} ホップ`,
    };
    await commands.executeCommand(`${flowDiagramViewId}.focus`);
    this.render();
  }

  public onTourStarted(session: TourPlaybackSession): void {
    this.onTourStopped();
    this.session = session;
    this.source = {
      scope: this.source?.tour.id === session.tour.id ? this.source.scope : session.scope,
      tour: session.tour,
      diagram: buildTourFlowDiagram(session.tour, { anchorHealth: session.anchorHealth }),
      subtitle: "再生中",
    };
    this.unsubscribe = session.player.subscribe(() => this.render());
    if (workspace.getConfiguration("konstelia").get<boolean>("flowDiagram.revealOnPlayback", true)) {
      void commands.executeCommand(`${flowDiagramViewId}.focus`, { preserveFocus: true });
    }
    this.render();
  }

  public onTourStopped(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.session) {
      const showedPlayedTour = Boolean(this.playbackSessionForShownTour());
      this.session = undefined;
      if (this.source && showedPlayedTour) {
        this.source = { ...this.source, subtitle: "再生を終了しました" };
      }
      this.render();
    }
  }

  private handle(message: ViewMessage): void {
    if (message.type === "ready") {
      this.render();
      return;
    }
    if (message.type !== "goto" || !message.nodeId) {
      return;
    }
    const position = parseTourFlowNodeId(message.nodeId);
    if (!position) {
      return;
    }
    if (this.playbackSessionForShownTour()) {
      this.session?.controller.requestGoto(position.stepIndex, position.hopIndex);
      return;
    }
    const source = this.source;
    if (source && this.playFromDiagram) {
      void this.playFromDiagram(source.scope, source.tour.id, position);
    }
  }

  /**
   * Playback state may only drive the diagram while the shown tour is the tour being played.
   * Otherwise a node click would move a different tour to a coincidentally valid position.
   */
  private playbackSessionForShownTour(): TourPlaybackSession | undefined {
    return this.session && this.session.tour.id === this.source?.tour.id
      ? this.session
      : undefined;
  }

  private render(): void {
    const webview = this.view?.webview;
    if (!webview) {
      return;
    }
    if (!this.source) {
      void webview.postMessage({ type: "empty" });
      return;
    }
    const state = this.playbackSessionForShownTour()?.player.getState();
    const currentNodeId = state && state.status === "playing"
      ? tourFlowNodeId(state.stepIndex, state.hopIndex)
      : undefined;
    const layout = layoutTourFlowDiagram(this.source.diagram, { columns: diagramColumns() });
    void webview.postMessage({
      type: "render",
      title: this.source.tour.title,
      subtitle: this.source.subtitle,
      playing: Boolean(currentNodeId),
      canPlay: Boolean(this.playFromDiagram),
      svg: renderTourFlowSvg(layout, { currentNodeId }),
      details: Object.fromEntries(
        this.source.diagram.nodes.map((node) => [
          node.id,
          {
            summary: node.summary,
            body: this.source?.tour.steps[node.stepIndex]?.hops[node.hopIndex]?.body ?? "",
            anchors: node.anchors.map((anchor) => `${anchor.ref} (${anchor.emphasis})`),
            health: node.health,
          },
        ]),
      ),
    });
  }
}

/** Reads the author's preferred diagram width; the layout clamps anything unreasonable. */
export function diagramColumns(): number {
  return workspace.getConfiguration("konstelia").get<number>("flowDiagram.columns", 3);
}

function countHops(tour: TourDocument): number {
  return tour.steps.reduce((total, step) => total + step.hops.length, 0);
}

function renderFlowDiagramHtml(): string {
  const nonce = createNonce();
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Konstelia Flow Diagram</title>
<style nonce="${nonce}">${diagramStyles}</style>
</head>
<body>
<header id="header">
  <strong id="title"></strong>
  <span class="subtle" id="subtitle"></span>
</header>
<p class="subtle" id="empty">ツアーを選択するとフロー図を表示します。</p>
<div id="diagram"></div>
<section id="details" hidden>
  <strong id="details-summary"></strong>
  <p class="subtle" id="details-anchors"></p>
  <p id="details-body"></p>
  <button id="play-here" type="button" hidden>このホップから再生</button>
</section>
<script nonce="${nonce}">${diagramScript}</script>
</body>
</html>`;
}

const diagramStyles = `
body { margin: 0; padding: 8px 12px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
header[hidden] { display: none; }
.subtle { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
#diagram { overflow: auto; }
#details { border-top: 1px solid var(--vscode-panel-border); margin-top: 8px; padding-top: 8px; }
#details p { margin: 4px 0 0; white-space: pre-wrap; }
#details button { margin-top: 8px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; border-radius: 3px; padding: 4px 10px; cursor: pointer; font-family: inherit; }
#details button:hover { background: var(--vscode-button-hoverBackground); }
${tourFlowStyles}
`.trim();

const diagramScript = String.raw`
(function () {
  const vscode = acquireVsCodeApi();
  const diagramHost = document.getElementById("diagram");
  const detailsHost = document.getElementById("details");
  const emptyNode = document.getElementById("empty");
  const headerNode = document.getElementById("header");
  const playButton = document.getElementById("play-here");
  let details = {};
  let playing = false;
  let canPlay = false;
  let selected;

  playButton.addEventListener("click", function () {
    if (selected) {
      vscode.postMessage({ type: "goto", nodeId: selected });
    }
  });

  function select(nodeId) {
    const detail = details[nodeId];
    if (detail) {
      document.getElementById("details-summary").textContent = detail.summary;
      document.getElementById("details-anchors").textContent =
        detail.anchors.join(" / ") + (detail.health === "healthy" ? "" : " - " + detail.health);
      document.getElementById("details-body").textContent = detail.body || "";
      detailsHost.hidden = false;
    }
    if (playing) {
      vscode.postMessage({ type: "goto", nodeId: nodeId });
      return;
    }
    // Outside playback a click is a preview; starting a tour needs a deliberate second step.
    selected = nodeId;
    playButton.hidden = !canPlay || !detail;
  }

  function bind() {
    const nodes = diagramHost.querySelectorAll("[data-node-id]");
    for (const node of nodes) {
      const id = node.getAttribute("data-node-id");
      node.addEventListener("click", function () { select(id); });
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select(id);
        }
      });
    }
  }

  window.addEventListener("message", function (event) {
    const message = event.data;
    if (message.type === "empty") {
      diagramHost.replaceChildren();
      detailsHost.hidden = true;
      playButton.hidden = true;
      headerNode.hidden = true;
      emptyNode.hidden = false;
      return;
    }
    if (message.type !== "render") {
      return;
    }
    details = message.details || {};
    playing = Boolean(message.playing);
    canPlay = Boolean(message.canPlay);
    playButton.hidden = true;
    selected = undefined;
    document.getElementById("title").textContent = message.title;
    document.getElementById("subtitle").textContent = message.subtitle;
    headerNode.hidden = false;
    emptyNode.hidden = true;
    const focusedNodeId = document.activeElement && document.activeElement.getAttribute
      ? document.activeElement.getAttribute("data-node-id")
      : null;
    diagramHost.innerHTML = message.svg;
    bind();
    const current = diagramHost.querySelector(".flow-node.current");
    if (current && current.scrollIntoView) {
      current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    // Re-rendering replaces the SVG, so keyboard users would lose their place every hop.
    const refocus = focusedNodeId
      ? diagramHost.querySelector('[data-node-id="' + focusedNodeId + '"]')
      : null;
    if (refocus) {
      refocus.focus();
    }
  });

  vscode.postMessage({ type: "ready" });
})();
`.trim();
