// EditorRenderer — TourPlayer 状態の投影。装飾・スクロール・エディタ配置を担う。
// スパイク検証項目: (a) ディムの可読性 (b) 遷移のチラつき (c) 2カラム配置の自然さ
const vscode = require("vscode");

// ---- スパイク用の簡易アンカーリゾルバ ----
// 本実装ではスパイク①のアダプタ(symbol-path)に差し替わる。ここでは検索文字列で解決。
function resolveAnchor(doc, anchor) {
  const text = doc.getText();
  let idx = -1;
  const occ = anchor.occurrence || 0;
  for (let i = 0; i <= occ; i++) idx = text.indexOf(anchor.search, idx + 1);
  if (idx < 0) return null; // broken(スパイクでは警告表示のみ)
  return new vscode.Range(doc.positionAt(idx), doc.positionAt(idx + anchor.search.length));
}

class EditorRenderer {
  constructor(context, workspaceRoot) {
    this.root = workspaceRoot;
    this.columnByFile = new Map(); // file → ViewColumn(交互割当、最大2)
    this.touchedEditors = new Set();

    this.decoDim = vscode.window.createTextEditorDecorationType({ opacity: "0.30" });
    this.decoPrimary = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
      border: "1px solid",
      borderColor: new vscode.ThemeColor("focusBorder"),
      borderRadius: "3px",
    });
    this.decoSecondary = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.selectionHighlightBackground"),
      borderRadius: "3px",
    });
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    context.subscriptions.push(
      this.decoDim, this.decoPrimary, this.decoSecondary, this.statusBar
    );
  }

  onPlayerEvent(kind, state) {
    if (kind === "exit") return this.clearAll();
    if (kind === "completed") {
      vscode.window.showInformationMessage("ツアー完了", { modal: true }, "終了")
        .then(() => vscode.commands.executeCommand("codeTourSpike.exit"));
      return;
    }
    this.render(state).catch((e) => vscode.window.showErrorMessage("render failed: " + e.message));
  }

  columnFor(file) {
    if (!this.columnByFile.has(file)) {
      const col = this.columnByFile.size % 2 === 0 ? vscode.ViewColumn.One : vscode.ViewColumn.Two;
      this.columnByFile.set(file, col);
    }
    return this.columnByFile.get(file);
  }

  async render(state) {
    const hop = state.hop;
    if (!hop) return;

    // ホップのアンカーをファイル別にグループ化(secondary が別ファイルにあってもよい)
    const byFile = new Map();
    for (const a of hop.anchors) {
      if (!byFile.has(a.file)) byFile.set(a.file, []);
      byFile.get(a.file).push(a);
    }
    const primary = hop.anchors.find((a) => a.emphasis === "primary");

    // 1) 関係する各ファイルを所定カラムに表示(primary のファイルにフォーカス)
    const editors = new Map();
    for (const [file, anchors] of byFile) {
      const uri = vscode.Uri.joinPath(this.root, file);
      const doc = await vscode.workspace.openTextDocument(uri);
      const isPrimaryFile = primary && file === primary.file;
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: this.columnFor(file),
        preserveFocus: !isPrimaryFile,
        preview: false,
      });
      editors.set(file, { editor, anchors });
      this.touchedEditors.add(editor);
    }

    // 2) 装飾: 各エディタでアンカー範囲を光らせ、それ以外をディム
    for (const [file, { editor, anchors }] of editors) {
      const doc = editor.document;
      const prim = [], sec = [], resolved = [];
      for (const a of anchors) {
        const range = resolveAnchor(doc, a);
        if (!range) {
          vscode.window.showWarningMessage(`anchor broken: ${a.search} @ ${file}`);
          continue;
        }
        resolved.push(range);
        (a.emphasis === "primary" ? prim : sec).push(range);
      }
      editor.setDecorations(this.decoPrimary, prim);
      editor.setDecorations(this.decoSecondary, sec);
      editor.setDecorations(this.decoDim, complement(doc, resolved));

      if (prim.length > 0) {
        editor.revealRange(prim[0], vscode.TextEditorRevealType.InCenter);
      }
    }

    // 3) ホップに関与しないが過去に触ったエディタは全面ディム(視線をホップに集める)
    for (const ed of this.touchedEditors) {
      if ([...editors.values()].some((v) => v.editor === ed)) continue;
      if (!ed.document || ed.document.isClosed) continue;
      ed.setDecorations(this.decoPrimary, []);
      ed.setDecorations(this.decoSecondary, []);
      ed.setDecorations(this.decoDim, [fullRange(ed.document)]);
    }

    // 4) ステータスバー(パンくずの代替。v1 で図が兼ねる)
    const s = state;
    this.statusBar.text = `$(compass) ${s.tour.title} · Step ${s.stepIndex + 1}/${s.tour.steps.length} 「${s.step.title}」 · Hop ${s.hopIndex + 1}/${s.step.hops.length} — ${hop.summary}`;
    this.statusBar.tooltip = hop.body || "";
    this.statusBar.show();

    // 5) 次ホップのドキュメントを裏で温める(§6.3-1 の先読み。UI 表示はしない)
    if (s.nextHop) {
      const nextPrimary = s.nextHop.anchors.find((a) => a.emphasis === "primary");
      if (nextPrimary) {
        vscode.workspace.openTextDocument(vscode.Uri.joinPath(this.root, nextPrimary.file)).then(undefined, () => {});
      }
    }

    await this.showHopDialog(s);
  }

  async showHopDialog(state) {
    const actions = [];
    if (state.stepIndex > 0 || state.hopIndex > 0) actions.push("前へ");
    actions.push(state.nextHop ? "次へ" : "完了", "終了");

    const action = await vscode.window.showInformationMessage(
      state.hop.summary,
      { modal: true, detail: state.hop.body || `${state.step.title} (${state.hopIndex + 1}/${state.step.hops.length})` },
      ...actions
    );
    if (action === "前へ") await vscode.commands.executeCommand("codeTourSpike.prev");
    if (action === "次へ" || action === "完了") await vscode.commands.executeCommand("codeTourSpike.next");
    if (action === "終了") await vscode.commands.executeCommand("codeTourSpike.exit");
  }

  clearAll() {
    for (const ed of this.touchedEditors) {
      if (!ed.document || ed.document.isClosed) continue;
      for (const d of [this.decoDim, this.decoPrimary, this.decoSecondary])
        ed.setDecorations(d, []);
    }
    this.touchedEditors.clear();
    this.columnByFile.clear();
    this.statusBar.hide();
  }
}

function fullRange(doc) {
  return new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
}

// doc 全体から highlight 範囲を除いた補集合(ディム対象)
function complement(doc, ranges) {
  const sorted = [...ranges].sort((a, b) => doc.offsetAt(a.start) - doc.offsetAt(b.start));
  const out = [];
  let cursor = 0;
  for (const r of sorted) {
    const s = doc.offsetAt(r.start), e = doc.offsetAt(r.end);
    if (s > cursor) out.push(new vscode.Range(doc.positionAt(cursor), doc.positionAt(s)));
    cursor = Math.max(cursor, e);
  }
  const end = doc.getText().length;
  if (cursor < end) out.push(new vscode.Range(doc.positionAt(cursor), doc.positionAt(end)));
  return out;
}

module.exports = { EditorRenderer };
