import {
  commands,
  Hover,
  languages,
  MarkdownString,
  OverviewRulerLane,
  Range,
  Selection,
  ThemeColor,
  Uri,
  ViewColumn,
  window,
  workspace,
  type ExtensionContext,
  type TextDocument,
  type TextEditor,
} from "vscode";
import { supportedLanguageIds } from "../../infrastructure/language/SupportedLanguages";
import type {
  TourPlayback,
  TourPlaybackController,
  TourPlaybackObserver,
  TourPlaybackRequest,
} from "../../application/tours/TourPlayback";
import {
  assessTourAnchors,
  type AnchorAssessment,
} from "../../application/tours/AssessTourAnchors";
import { TourPlayer, type TourPlayerPosition } from "../../application/tours/TourPlayer";
import {
  applyPlaybackAction,
  isPlayablePosition,
  type PlaybackAction,
  type PlaybackPosition,
} from "../../application/tours/TourPlaybackActions";
import { missingAnchorMessage } from "../../domain/tour/TourValidation";
import { AnchorHealth, type TourAnchor } from "../../domain/tour/TourAnchor";
import { assertSafeTourSourcePath } from "../../domain/tour/TourSourcePath";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourDocument } from "../../domain/tour/TourDocument";
import type { RepositoryRootLocator } from "../../infrastructure/storage/RepositoryRootLocator";
import { ResolveAnchor } from "../../application/anchors/ResolveAnchor";
import { DefaultSemanticAnchorAdapter } from "../../infrastructure/language/DefaultSemanticAnchorAdapter";

interface ResolvedAnchor {
  uri: Uri;
  document: TextDocument;
  range: Range;
  emphasis: "primary" | "secondary";
  health: AnchorHealth;
}

interface PreparedAnchor extends AnchorAssessment {
  target?: Omit<ResolvedAnchor, "emphasis">;
}

interface RenderedHop {
  target: PopoverTarget;
  health: AnchorHealth;
}

interface PopoverTarget {
  editor: TextEditor;
  uri: Uri;
  range: Range;
}


const previousCommand = "konstelia.playback.previous";
const blockedPreviousCommand = "konstelia.playback.blockedPrevious";
const nextCommand = "konstelia.playback.next";
const blockedNextCommand = "konstelia.playback.blockedNext";
const exitCommand = "konstelia.playback.exit";

export class VsCodeTourPlayback {
  private readonly primaryDecoration = window.createTextEditorDecorationType({
    backgroundColor: new ThemeColor("konstelia.primaryAnchorBackground"),
    fontWeight: "bold",
    overviewRulerColor: new ThemeColor("editorOverviewRuler.findMatchForeground"),
    overviewRulerLane: OverviewRulerLane.Full,
  });
  private readonly secondaryDecoration = window.createTextEditorDecorationType({
    backgroundColor: new ThemeColor("konstelia.secondaryAnchorBackground"),
  });
  private readonly touchedEditors = new Set<TextEditor>();
  private currentHover: { uri: Uri; hover: Hover } | undefined;
  private currentTarget: PopoverTarget | undefined;
  private resolveAction: ((action: PlaybackAction) => void) | undefined;
  private readonly availableActions = new Set<PlaybackAction>();
  private popoverRefresh: ReturnType<typeof setInterval> | undefined;
  private popoverRefreshGeneration = 0;
  private pendingPopoverRefresh: Promise<void> = Promise.resolve();
  private readonly anchorResolver = new ResolveAnchor(new DefaultSemanticAnchorAdapter());
  private running = false;
  private pendingGoto: PlaybackPosition | undefined;

  public constructor(
    context: ExtensionContext,
    private readonly observers: readonly TourPlaybackObserver[] = [],
  ) {
    context.subscriptions.push(
      this.primaryDecoration,
      this.secondaryDecoration,
      commands.registerCommand(previousCommand, () => this.selectAction("previous")),
      commands.registerCommand(blockedPreviousCommand, () => this.reopenPopover()),
      commands.registerCommand(nextCommand, () => this.selectAction("next")),
      commands.registerCommand(blockedNextCommand, () => this.reopenPopover()),
      commands.registerCommand(exitCommand, () => this.selectAction("exit")),
      {
        dispose: () => {
          const resolve = this.resolveAction;
          this.resolveAction = undefined;
          this.availableActions.clear();
          this.currentHover = undefined;
          this.currentTarget = undefined;
          void this.stopPopoverRefresh().then(() =>
            commands.executeCommand("editor.action.hideHover"),
          );
          resolve?.("exit");
        },
      },
      window.onDidChangeTextEditorSelection((event) => {
        const target = this.currentTarget;
        const selection = event.selections[0];
        if (
          target &&
          event.textEditor === target.editor &&
          this.availableActions.has("exit") &&
          selection &&
          // Leave range selections alone so the reader can still copy the code being toured.
          selection.isEmpty &&
          !selection.active.isEqual(target.range.start)
        ) {
          this.reopenPopover();
        }
      }),
      languages.registerHoverProvider(
        supportedLanguageIds.map((language) => ({ language })),
        {
          provideHover: (document, position) =>
            this.currentHover?.uri.toString() === document.uri.toString() &&
            this.currentTarget?.range.contains(position)
              ? this.currentHover.hover
              : undefined,
        },
      ),
    );
  }

  public forRoot(rootLocator: RepositoryRootLocator): TourPlayback {
    return { start: (request) => this.start(rootLocator, request) };
  }

  private async start(
    rootLocator: RepositoryRootLocator,
    { tour, anchors, scope, startAt }: TourPlaybackRequest,
  ): Promise<void> {
    if (this.running) {
      throw new Error("A tour is already running.");
    }
    const player = new TourPlayer(tour);
    if (startAt && isPlayablePosition(tour, startAt)) {
      player.gotoHop(startAt.stepIndex, startAt.hopIndex);
    }

    this.running = true;
    const registry = new Map(anchors.map((anchor) => [anchor.id, anchor]));
    try {
      const prepared = await this.prepareAnchors(tour, anchors, rootLocator);
      this.notifyStarted(scope, tour, player, prepared);
      await commands.executeCommand("setContext", "konstelia.tourActive", true);
      while (player.getState().status === "playing") {
        const current = player.getCurrent();
        if (!current) {
          break;
        }
        const rendered = await this.render(current, prepared, registry, rootLocator);
        player.setHealth(rendered.health);
        const action = await this.showPopover(tour, current, rendered.target, player);
        const target = this.pendingGoto;
        this.pendingGoto = undefined;
        applyPlaybackAction(player, action, target);
      }
      if (player.getState().status === "completed") {
        void window.showInformationMessage(`ツアー「${tour.title}」を完了しました。`);
      }
    } finally {
      this.pendingGoto = undefined;
      await this.selectAction("exit");
      await this.stopPopoverRefresh();
      this.currentHover = undefined;
      this.currentTarget = undefined;
      await commands.executeCommand("editor.action.hideHover");
      this.clearDecorations();
      this.running = false;
      await commands.executeCommand("setContext", "konstelia.tourActive", false);
      await commands.executeCommand("setContext", "konstelia.tourCanPrevious", false);
      await commands.executeCommand("setContext", "konstelia.tourCanNext", false);
      this.notifyStopped();
    }
  }

  private notifyStopped(): void {
    for (const observer of this.observers) {
      try {
        observer.onTourStopped();
      } catch {
        // A view must not be able to break playback cleanup.
      }
    }
  }

  private notifyStarted(
    scope: TourScope,
    tour: TourDocument,
    player: TourPlayer,
    prepared: ReadonlyMap<string, PreparedAnchor>,
  ): void {
    if (this.observers.length === 0) {
      return;
    }
    const anchorHealth = new Map(
      [...prepared].map(([id, anchor]) => [id, anchor.health] as const),
    );
    const controller: TourPlaybackController = {
      requestGoto: (stepIndex, hopIndex) => this.requestGoto(tour, { stepIndex, hopIndex }),
    };
    for (const observer of this.observers) {
      try {
        observer.onTourStarted({ scope, tour, player, anchorHealth, controller });
      } catch {
        // A view must not be able to prevent playback from starting.
      }
    }
  }

  private requestGoto(tour: TourDocument, position: PlaybackPosition): void {
    if (!this.running || !isPlayablePosition(tour, position)) {
      return;
    }
    if (!this.availableActions.has("goto")) {
      // The hop is still being rendered; a jump requested now would be dropped silently.
      return;
    }
    this.pendingGoto = position;
    void this.selectAction("goto");
  }

  private async prepareAnchors(
    tour: TourDocument,
    anchors: readonly TourAnchor[],
    rootLocator: RepositoryRootLocator,
  ): Promise<ReadonlyMap<string, PreparedAnchor>> {
    const registry = new Map(anchors.map((anchor) => [anchor.id, anchor]));
    const referencedIds = new Set(
      tour.steps.flatMap((step) =>
        step.hops.flatMap((hop) => hop.anchors.map((reference) => reference.ref)),
      ),
    );
    const prepared = new Map<string, PreparedAnchor>();
    for (const id of referencedIds) {
      const anchor = registry.get(id);
      if (!anchor) {
        prepared.set(id, {
          health: AnchorHealth.Broken,
          reason: missingAnchorMessage(id),
        });
        continue;
      }
      prepared.set(id, await this.resolveAnchor(anchor, rootLocator));
    }

    const assessment = assessTourAnchors(tour, prepared);
    if (assessment.blockingIssues.length > 0) {
      const details = assessment.blockingIssues
        .map((issue) => `${issue.anchorId}: ${issue.reason ?? "could not be resolved"}`)
        .join("; ");
      throw new Error(`Tour '${tour.title}' requires repair before playback. ${details}`);
    }
    if (assessment.warnings.length > 0) {
      const ids = [...new Set(assessment.warnings.map((issue) => issue.anchorId))];
      void window.showWarningMessage(
        `Konstelia skipped ${ids.length} broken secondary anchor${ids.length === 1 ? "" : "s"}: ${ids.join(", ")}`,
      );
    }
    return prepared;
  }

  private async render(
    current: TourPlayerPosition,
    prepared: ReadonlyMap<string, PreparedAnchor>,
    registry: ReadonlyMap<string, TourAnchor>,
    rootLocator: RepositoryRootLocator,
  ): Promise<RenderedHop> {
    this.clearDecorations();
    const resolved: ResolvedAnchor[] = [];
    for (const reference of current.hop.anchors) {
      // Resolve again from the document as it stands now: the reader may have edited the file
      // since the preflight, which would leave the saved offsets pointing at the wrong lines.
      const anchor = await this.refresh(reference.ref, prepared, registry, rootLocator);
      if (!anchor?.target) {
        continue;
      }
      resolved.push({ ...anchor.target, emphasis: reference.emphasis });
    }

    const groups = groupByDocument(resolved).sort((left, right) =>
      Number(hasPrimary(left)) - Number(hasPrimary(right)),
    );
    let popoverTarget: PopoverTarget | undefined;
    for (const group of groups) {
      const first = group[0];
      if (!first) {
        continue;
      }
      const primary = group.find((anchor) => anchor.emphasis === "primary");
      const editor = await window.showTextDocument(first.document, {
        preview: false,
        preserveFocus: !primary,
        viewColumn: primary ? ViewColumn.One : ViewColumn.Beside,
      });
      this.touchedEditors.add(editor);
      editor.setDecorations(
        this.primaryDecoration,
        group.filter((anchor) => anchor.emphasis === "primary").map((anchor) => anchor.range),
      );
      editor.setDecorations(
        this.secondaryDecoration,
        group.filter((anchor) => anchor.emphasis === "secondary").map((anchor) => anchor.range),
      );
      if (primary) {
        editor.revealRange(primary.range);
        popoverTarget = { editor, uri: primary.uri, range: primary.range };
      }
    }
    if (!popoverTarget) {
      throw new Error("The current hop does not have a primary anchor.");
    }
    return {
      target: popoverTarget,
      health: current.hop.anchors.some(
        (reference) => prepared.get(reference.ref)?.health !== AnchorHealth.Healthy,
      )
        ? AnchorHealth.Drifted
        : AnchorHealth.Healthy,
    };
  }

  /**
   * Re-resolves one reference for the hop about to be shown. A reference that resolved during
   * the preflight but fails now keeps its earlier result, so a mid-tour edit cannot blank a hop.
   */
  private async refresh(
    ref: string,
    prepared: ReadonlyMap<string, PreparedAnchor>,
    registry: ReadonlyMap<string, TourAnchor>,
    rootLocator: RepositoryRootLocator,
  ): Promise<PreparedAnchor | undefined> {
    const anchor = registry.get(ref);
    const preflight = prepared.get(ref);
    if (!anchor || !preflight?.target) {
      return preflight;
    }
    const refreshed = await this.resolveAnchor(anchor, rootLocator);
    return refreshed.target ? refreshed : preflight;
  }

  private async resolveAnchor(
    anchor: TourAnchor,
    rootLocator: RepositoryRootLocator,
  ): Promise<PreparedAnchor> {
    try {
      assertSafeTourSourcePath(anchor.file);
      const fileUri = Uri.joinPath(rootLocator.getRoot(), anchor.file);
      const document = await workspace.openTextDocument(fileUri);
      const resolution = this.anchorResolver.execute(anchor, document.getText());
      if (!resolution.range) {
        return { health: AnchorHealth.Broken, reason: resolution.reason };
      }
      const range = new Range(
        document.positionAt(resolution.range.start),
        document.positionAt(resolution.range.end),
      );
      return {
        health: resolution.health,
        reason: resolution.reason,
        target: { uri: fileUri, document, range, health: resolution.health },
      };
    } catch (error) {
      return {
        health: AnchorHealth.Broken,
        reason: error instanceof Error ? error.message : `Could not open ${anchor.file}.`,
      };
    }
  }

  private async showPopover(
    tour: TourDocument,
    current: TourPlayerPosition,
    target: PopoverTarget,
    player: TourPlayer,
  ): Promise<PlaybackAction> {
    const content = new MarkdownString();
    content.appendMarkdown("**");
    content.appendText(current.hop.summary);
    content.appendMarkdown("**\n\n");
    if (current.hop.body) {
      content.appendMarkdown(current.hop.body);
      content.appendMarkdown("\n\n");
    }
    content.appendText(
      `${tour.title} / ${current.step.title} (${current.ordinal + 1}/${current.total})`,
    );
    if (player.getState().health !== AnchorHealth.Healthy) {
      content.appendMarkdown("\n\n");
      content.appendText(`Anchor status: ${player.getState().health}`);
    }

    // The last hop still advances: `next` completes the tour there (specification §6.2).
    const isLastPosition = current.ordinal === current.total - 1;
    const canAdvance = player.canNext() || isLastPosition;
    const controls = new MarkdownString();
    const links: string[] = [];
    this.availableActions.clear();
    if (player.canPrevious()) {
      links.push(`[前へ](command:${previousCommand})`);
    }
    if (canAdvance) {
      links.push(`[${player.canNext() ? "次へ" : "完了"}](command:${nextCommand})`);
    }
    links.push(`[終了](command:${exitCommand})`);
    controls.isTrusted = {
      enabledCommands: [previousCommand, nextCommand, exitCommand],
    };
    controls.appendMarkdown(links.join(" | "));

    this.currentHover = {
      uri: target.uri,
      hover: new Hover([content, controls], target.range),
    };
    this.currentTarget = target;
    // The action promise must exist before any action becomes selectable. Otherwise a jump
    // requested from the flow diagram clears the available actions without resolving anything,
    // and the playback loop waits forever.
    const action = new Promise<PlaybackAction>((resolve) => {
      this.resolveAction = resolve;
    });
    if (player.canPrevious()) {
      this.availableActions.add("previous");
    }
    if (canAdvance) {
      this.availableActions.add("next");
    }
    this.availableActions.add("goto");
    this.availableActions.add("exit");
    await commands.executeCommand("setContext", "konstelia.tourCanPrevious", player.canPrevious());
    await commands.executeCommand("setContext", "konstelia.tourCanNext", canAdvance);
    target.editor.selection = new Selection(target.range.start, target.range.start);
    await commands.executeCommand("editor.action.hideHover");
    await this.showAndFocusPopover();
    this.keepPopoverVisible(target);
    return action;
  }

  private async showAndFocusPopover(): Promise<void> {
    await commands.executeCommand("editor.action.showHover");
    if (this.currentHover) {
      await commands.executeCommand("editor.action.showHover");
    }
  }

  private reopenPopover(): void {
    const target = this.currentTarget;
    if (!target) {
      return;
    }
    if (target.editor.document.isClosed) {
      // The popover cannot come back once its document is gone, and the popover is where the
      // playback controls live. End the tour instead of leaving it running with no controls.
      void this.selectAction("exit");
      return;
    }
    target.editor.selection = new Selection(target.range.start, target.range.start);
    setTimeout(() => {
      if (
        this.currentTarget === target &&
        this.currentHover &&
        this.availableActions.has("exit")
      ) {
        void this.showAndFocusPopover();
      }
    }, 0);
  }

  private async selectAction(action: PlaybackAction): Promise<void> {
    if (!this.availableActions.has(action)) {
      return;
    }
    const resolve = this.resolveAction;
    this.resolveAction = undefined;
    this.availableActions.clear();
    const refreshStopped = this.stopPopoverRefresh();
    if (action === "exit") {
      this.currentHover = undefined;
      this.currentTarget = undefined;
      await refreshStopped;
      await commands.executeCommand("editor.action.hideHover");
    } else {
      await refreshStopped;
    }
    resolve?.(action);
  }

  private clearDecorations(): void {
    for (const editor of this.touchedEditors) {
      editor.setDecorations(this.primaryDecoration, []);
      editor.setDecorations(this.secondaryDecoration, []);
    }
    this.touchedEditors.clear();
  }

  private keepPopoverVisible(target: PopoverTarget): void {
    void this.stopPopoverRefresh();
    const generation = ++this.popoverRefreshGeneration;
    this.popoverRefresh = setInterval(() => {
      this.pendingPopoverRefresh = this.pendingPopoverRefresh.then(async () => {
        if (
          generation === this.popoverRefreshGeneration &&
          this.currentTarget === target &&
          this.currentHover &&
          window.activeTextEditor === target.editor
        ) {
          await commands.executeCommand("editor.action.showHover");
        }
      }, () => undefined);
    }, 250);
  }

  private async stopPopoverRefresh(): Promise<void> {
    this.popoverRefreshGeneration += 1;
    if (this.popoverRefresh) {
      clearInterval(this.popoverRefresh);
      this.popoverRefresh = undefined;
    }
    await this.pendingPopoverRefresh.catch(() => undefined);
  }
}

function groupByDocument(anchors: readonly ResolvedAnchor[]): ResolvedAnchor[][] {
  const groups = new Map<string, ResolvedAnchor[]>();
  for (const anchor of anchors) {
    const key = anchor.uri.toString();
    const group = groups.get(key) ?? [];
    group.push(anchor);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function hasPrimary(anchors: readonly ResolvedAnchor[]): boolean {
  return anchors.some((anchor) => anchor.emphasis === "primary");
}
