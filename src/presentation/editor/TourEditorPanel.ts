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
import { layoutTourFlowDiagram } from "../flow/TourFlowLayout";
import { renderTourFlowSvg, tourFlowStyles } from "../flow/TourFlowSvg";
import { createNonce } from "../webview/WebviewSupport";

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

  /** Takes over a panel VS Code restored after a reload and gives it a fresh draft. */
  public static adopt(panel: WebviewPanel, draft: TourDraft, host: TourEditorHost): void {
    const key = panelKey(draft);
    const existing = TourEditorPanel.open.get(key);
    if (existing) {
      panel.dispose();
      existing.reload(draft);
      existing.panel.reveal(existing.panel.viewColumn ?? ViewColumn.Active);
      return;
    }
    panel.webview.options = editorPanelOptions;
    TourEditorPanel.open.set(key, new TourEditorPanel(panel, draft, host, key));
  }

  private disposed = false;
  private unsaved = false;
  private latestRequestId = 0;

  private constructor(
    private readonly panel: WebviewPanel,
    draft: TourDraft,
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
      const layout = layoutTourFlowDiagram(buildTourFlowDiagram(tour));
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

/**
 * The webview is a separate, untrusted process. Only documents whose shape the diagram and the
 * validators can handle are accepted; the values themselves are checked by `UpdateTour`.
 */
function isTourDocumentShape(value: unknown): value is TourDocument {
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

function renderTourEditorHtml(draft: TourDraft): string {
  const nonce = createNonce();
  const data = JSON.stringify(draft).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Konstelia Tour Editor</title>
<style nonce="${nonce}">${editorStyles}</style>
</head>
<body>
<div class="layout">
  <section class="pane form">
    <header class="toolbar">
      <div>
        <h1 id="heading"></h1>
        <p class="subtle" id="identity"></p>
      </div>
      <div class="toolbar-actions">
        <span class="subtle" id="status"></span>
        <button id="save" type="button">保存</button>
      </div>
    </header>
    <p class="subtle">「選択範囲から」は、コードのエディターで最後に選択した範囲からアンカーを作成します。先にコードを選択してから押してください。</p>
    <p class="subtle warning">保存するとKonsteliaがYAMLを生成し直します。ファイル内のコメント、空行、スキーマ外のキーは失われます。</p>
    <div class="card">
      <label>タイトル<input id="title" type="text" /></label>
      <label>説明<textarea id="description" rows="3"></textarea></label>
      <label>前提ツアー（ツアーidをカンマ区切り）<input id="prerequisites" type="text" list="tour-ids" /></label>
    </div>
    <div id="steps"></div>
    <button id="add-step" type="button" class="wide">ステップを追加</button>
    <section class="card issues">
      <h2>検証結果</h2>
      <ul id="issues"></ul>
    </section>
  </section>
  <aside class="pane preview">
    <h2>フロー図</h2>
    <p class="subtle">保存前の内容から自動生成します。ノードを選ぶと該当ホップへ移動します。</p>
    <div id="diagram"></div>
  </aside>
</div>
<datalist id="anchor-ids"></datalist>
<datalist id="tour-ids"></datalist>
<datalist id="step-targets"></datalist>
<script type="application/json" id="draft-data" nonce="${nonce}">${data}</script>
<script nonce="${nonce}">${editorScript}</script>
</body>
</html>`;
}

const editorStyles = `
body { margin: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
.layout { display: flex; align-items: stretch; min-height: 100vh; }
.pane { padding: 16px; box-sizing: border-box; }
.pane.form { flex: 1 1 60%; min-width: 0; }
.pane.preview { flex: 0 1 40%; min-width: 280px; border-left: 1px solid var(--vscode-panel-border); overflow: auto; }
h1 { font-size: 1.2rem; margin: 0; }
h2 { font-size: 0.95rem; margin: 0 0 8px; }
h3 { font-size: 0.9rem; margin: 0; }
.subtle { color: var(--vscode-descriptionForeground); margin: 4px 0 0; font-size: 0.85em; }
.warning { margin: 0 0 12px; color: var(--vscode-editorWarning-foreground); }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.toolbar-actions { display: flex; align-items: center; gap: 8px; }
.card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; margin-bottom: 12px; background: var(--vscode-editorWidget-background); }
.card.step { border-left: 3px solid var(--vscode-textLink-foreground); }
.card.hop { background: var(--vscode-editor-background); margin: 8px 0 0; }
label { display: block; margin-bottom: 8px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
input, textarea, select { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 4px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; font-family: inherit; font-size: 1em; }
textarea { resize: vertical; }
button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; border-radius: 3px; padding: 4px 10px; cursor: pointer; font-family: inherit; }
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
button.wide { width: 100%; margin-bottom: 12px; }
.row { display: flex; gap: 8px; align-items: flex-end; }
.row > label { flex: 1 1 auto; margin-bottom: 0; }
.row > .fixed { flex: 0 0 130px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.head .buttons { display: flex; gap: 4px; }
.issues ul { margin: 0; padding-left: 18px; }
.issues li { color: var(--vscode-editorError-foreground); font-size: 0.85em; margin-bottom: 4px; }
.issues li.ok { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
.issues code { color: var(--vscode-descriptionForeground); }
#diagram { overflow: auto; }
${tourFlowStyles}
`.trim();

const editorScript = String.raw`
(function () {
  const vscode = acquireVsCodeApi();
  const draft = JSON.parse(document.getElementById("draft-data").textContent);
  const tour = draft.tour;
  tour.steps = tour.steps || [];
  const stepsHost = document.getElementById("steps");
  const issuesHost = document.getElementById("issues");
  const statusNode = document.getElementById("status");
  const diagramHost = document.getElementById("diagram");
  let syncTimer;
  let requestId = 0;
  let saving = false;

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const child of children || []) {
      node.append(child);
    }
    return node;
  }

  function labelled(text, control) {
    return el("label", { textContent: text }, [control]);
  }

  function textField(value, onInput, options) {
    const input = el("input", { type: "text", value: value || "" });
    if (options && options.list) {
      input.setAttribute("list", options.list);
    }
    if (options && options.className) {
      input.className = options.className;
    }
    input.addEventListener("input", function () {
      onInput(input.value);
      scheduleSync();
    });
    return input;
  }

  function areaField(value, onInput) {
    const area = el("textarea", { rows: 3, value: value || "" });
    area.addEventListener("input", function () {
      onInput(area.value);
      scheduleSync();
    });
    return area;
  }

  function button(text, onClick, secondary) {
    const node = el("button", { type: "button", textContent: text });
    if (secondary) {
      node.className = "secondary";
    }
    node.addEventListener("click", onClick);
    return node;
  }

  function move(list, index, delta) {
    const target = index + delta;
    if (target < 0 || target >= list.length) {
      return;
    }
    const item = list[index];
    list.splice(index, 1);
    list.splice(target, 0, item);
    render();
    sync();
  }

  function remove(list, index) {
    list.splice(index, 1);
    render();
    sync();
  }

  function renderAnchor(hop, stepIndex, hopIndex, anchor, index) {
    const ref = textField(anchor.ref, function (value) { anchor.ref = value; }, { list: "anchor-ids" });
    const emphasis = el("select", {});
    for (const option of ["primary", "secondary"]) {
      emphasis.append(el("option", { value: option, textContent: option, selected: anchor.emphasis === option }));
    }
    emphasis.addEventListener("change", function () {
      anchor.emphasis = emphasis.value;
      if (anchor.emphasis === "primary") {
        for (const other of hop.anchors) {
          if (other !== anchor) {
            other.emphasis = "secondary";
          }
        }
        render();
      }
      sync();
    });
    return el("div", { className: "row" }, [
      labelled("アンカーid", ref),
      el("div", { className: "fixed" }, [labelled("強調", emphasis)]),
      button("選択範囲から", function () { requestAnchor(stepIndex, hopIndex, index); }, true),
      button("削除", function () { remove(hop.anchors, index); }, true),
    ]);
  }

  function renderHop(step, stepIndex, hop, hopIndex) {
    const card = el("div", { className: "card hop" }, [
      el("div", { className: "head" }, [
        el("h3", { textContent: "ホップ " + (hopIndex + 1) }),
        el("div", { className: "buttons" }, [
          button("↑", function () { move(step.hops, hopIndex, -1); }, true),
          button("↓", function () { move(step.hops, hopIndex, 1); }, true),
          button("削除", function () { remove(step.hops, hopIndex); }, true),
        ]),
      ]),
      labelled("summary（1行・必須）", textField(hop.summary, function (value) { hop.summary = value; }, { className: "hop-summary" })),
      labelled("body（Markdown・任意）", areaField(hop.body, function (value) { hop.body = value; })),
    ]);
    card.dataset.hop = stepIndex + ":" + hopIndex;
    hop.anchors = hop.anchors || [];
    for (let index = 0; index < hop.anchors.length; index += 1) {
      card.append(renderAnchor(hop, stepIndex, hopIndex, hop.anchors[index], index));
    }
    card.append(el("div", { className: "row" }, [
      button("アンカーを追加", function () {
        addAnchor(hop);
        render();
        sync();
      }, true),
      button("選択範囲からアンカーを追加", function () {
        requestAnchor(stepIndex, hopIndex, -1);
      }, true),
    ]));
    return card;
  }

  function addAnchor(hop) {
    const hasPrimary = hop.anchors.some(function (anchor) { return anchor.emphasis === "primary"; });
    hop.anchors.push({ ref: "", emphasis: hasPrimary ? "secondary" : "primary" });
    return hop.anchors.length - 1;
  }

  function requestAnchor(stepIndex, hopIndex, anchorIndex) {
    setStatus("コードの選択範囲からアンカーを作成しています…");
    vscode.postMessage({
      type: "createAnchor",
      target: { stepIndex: stepIndex, hopIndex: hopIndex, anchorIndex: anchorIndex },
    });
  }

  function applyCreatedAnchor(target, id) {
    const hop = tour.steps[target.stepIndex] && tour.steps[target.stepIndex].hops[target.hopIndex];
    if (!hop) {
      return;
    }
    hop.anchors = hop.anchors || [];
    const index = target.anchorIndex >= 0 && hop.anchors[target.anchorIndex]
      ? target.anchorIndex
      : addAnchor(hop);
    hop.anchors[index].ref = id;
    render();
    sync();
  }

  function renderLink(step, link, index) {
    return el("div", { className: "row" }, [
      labelled("リンク先（tourId#stepId）", textField(link.to, function (value) { link.to = value; }, { list: "step-targets" })),
      labelled("ラベル", textField(link.label, function (value) { link.label = value; })),
      button("削除", function () { remove(step.links, index); }, true),
    ]);
  }

  function renderStep(step, stepIndex) {
    const card = el("div", { className: "card step" }, [
      el("div", { className: "head" }, [
        el("h3", { textContent: "ステップ " + (stepIndex + 1) }),
        el("div", { className: "buttons" }, [
          button("↑", function () { move(tour.steps, stepIndex, -1); }, true),
          button("↓", function () { move(tour.steps, stepIndex, 1); }, true),
          button("削除", function () { remove(tour.steps, stepIndex); }, true),
        ]),
      ]),
      el("div", { className: "row" }, [
        labelled("id", textField(step.id, function (value) { step.id = value; })),
        labelled("タイトル", textField(step.title, function (value) { step.title = value; })),
      ]),
    ]);
    step.hops = step.hops || [];
    for (let index = 0; index < step.hops.length; index += 1) {
      card.append(renderHop(step, stepIndex, step.hops[index], index));
    }
    card.append(button("ホップを追加", function () {
      step.hops.push({ summary: "", anchors: [] });
      render();
      sync();
    }, true));
    step.links = step.links || [];
    for (let index = 0; index < step.links.length; index += 1) {
      card.append(renderLink(step, step.links[index], index));
    }
    card.append(button("クロスリンクを追加", function () {
      step.links.push({ to: "", label: "" });
      render();
      sync();
    }, true));
    return card;
  }

  function render() {
    const cards = [];
    for (let index = 0; index < tour.steps.length; index += 1) {
      cards.push(renderStep(tour.steps[index], index));
    }
    stepsHost.replaceChildren.apply(stepsHost, cards);
  }

  function renderIssues(issues) {
    if (!issues || issues.length === 0) {
      issuesHost.replaceChildren(el("li", { className: "ok", textContent: "問題は見つかりませんでした。" }));
      return;
    }
    const items = issues.map(function (issue) {
      return el("li", {}, [el("code", { textContent: issue.path }), document.createTextNode(" " + issue.message)]);
    });
    issuesHost.replaceChildren.apply(issuesHost, items);
  }

  function fillDatalist(id, values) {
    const host = document.getElementById(id);
    host.replaceChildren.apply(host, values.map(function (value) {
      return el("option", { value: value.value, label: value.label || "" });
    }));
  }

  function bindDiagram() {
    const nodes = diagramHost.querySelectorAll("[data-node-id]");
    for (const node of nodes) {
      node.addEventListener("click", function () { focusHop(node.getAttribute("data-node-id")); });
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          focusHop(node.getAttribute("data-node-id"));
        }
      });
    }
  }

  function focusHop(id) {
    const card = document.querySelector('[data-hop="' + id + '"]');
    if (!card) {
      return;
    }
    card.scrollIntoView({ block: "center" });
    const summary = card.querySelector(".hop-summary");
    if (summary) {
      summary.focus();
    }
  }

  function setStatus(text) {
    statusNode.textContent = text;
  }

  function scheduleSync() {
    markDirty();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { sync(); }, 300);
  }

  function markDirty() {
    setStatus("未保存の変更があります");
  }

  function sync(options) {
    clearTimeout(syncTimer);
    // The first sync only asks for a diagram and a validation; it is not an edit.
    if (options && options.initial) {
      vscode.postMessage({ type: "change", tour: tour, requestId: 0 });
      return;
    }
    markDirty();
    requestId += 1;
    vscode.postMessage({ type: "change", tour: tour, requestId: requestId });
  }

  function save() {
    clearTimeout(syncTimer);
    requestId += 1;
    saving = true;
    setStatus("保存中…");
    vscode.postMessage({ type: "save", tour: tour, requestId: requestId });
  }

  // VS Code restores the panel after a reload; the state tells the serializer what to reopen.
  vscode.setState({ scope: draft.scope, tourId: tour.id });
  document.getElementById("heading").textContent = tour.title;
  document.getElementById("identity").textContent = draft.scope + " / " + tour.id + "（idは変更できません）";
  const titleInput = document.getElementById("title");
  titleInput.value = tour.title;
  titleInput.addEventListener("input", function () {
    tour.title = titleInput.value;
    document.getElementById("heading").textContent = titleInput.value;
    scheduleSync();
  });
  const descriptionInput = document.getElementById("description");
  descriptionInput.value = tour.description || "";
  descriptionInput.addEventListener("input", function () {
    tour.description = descriptionInput.value;
    scheduleSync();
  });
  const prerequisitesInput = document.getElementById("prerequisites");
  prerequisitesInput.value = (tour.prerequisites || []).join(", ");
  prerequisitesInput.addEventListener("input", function () {
    tour.prerequisites = prerequisitesInput.value
      .split(",")
      .map(function (value) { return value.trim(); })
      .filter(function (value) { return value.length > 0; });
    scheduleSync();
  });
  document.getElementById("add-step").addEventListener("click", function () {
    tour.steps.push({ id: "step-" + (tour.steps.length + 1), title: "新しいステップ", hops: [] });
    render();
    sync();
  });
  document.getElementById("save").addEventListener("click", save);
  window.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      save();
    }
  });
  window.addEventListener("message", function (event) {
    const message = event.data;
    if (message.type === "diagram") {
      diagramHost.innerHTML = message.svg;
      bindDiagram();
    } else if (message.type === "issues") {
      renderIssues(message.issues);
      if (saving && message.issues.length > 0) {
        saving = false;
        setStatus("保存していません（検証エラー）");
      }
    } else if (message.type === "anchorCreated") {
      draft.anchors = message.anchors;
      fillDatalist("anchor-ids", draft.anchors.map(function (anchor) {
        return { value: anchor.id, label: anchor.file + "::" + anchor.symbol };
      }));
      applyCreatedAnchor(message.target, message.id);
    } else if (message.type === "saved") {
      saving = false;
      setStatus(message.superseded ? "保存しました（その後の変更は未保存です）" : "保存しました");
    }
  });

  fillDatalist("anchor-ids", draft.anchors.map(function (anchor) {
    return { value: anchor.id, label: anchor.file + "::" + anchor.symbol };
  }));
  fillDatalist("tour-ids", draft.tourIds.map(function (id) { return { value: id }; }));
  fillDatalist("step-targets", draft.stepTargets.map(function (target) {
    return { value: target.target, label: target.tourTitle + " / " + target.stepTitle };
  }));
  render();
  sync({ initial: true });
})();
`.trim();
