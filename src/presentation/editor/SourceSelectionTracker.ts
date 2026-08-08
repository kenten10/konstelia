import { window, workspace, type ExtensionContext, type Selection, type TextDocument, type TextEditor } from "vscode";
import type { ProposeAnchorInput } from "../../application/anchors/CreateAnchor";
import { isSupportedLanguageId } from "../../infrastructure/language/SupportedLanguages";

/**
 * Remembers the last selection an author made in a source file. The tour editor is a webview,
 * so while it has focus there is no active text editor to read a selection from.
 */
export class SourceSelectionTracker {
  private last: { document: TextDocument; selection: Selection } | undefined;

  public constructor(context: ExtensionContext) {
    context.subscriptions.push(
      window.onDidChangeTextEditorSelection((event) => this.remember(event.textEditor)),
      window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.remember(editor);
        }
      }),
    );
    if (window.activeTextEditor) {
      this.remember(window.activeTextEditor);
    }
  }

  public capture(): Promise<ProposeAnchorInput | undefined> {
    const remembered = this.last;
    if (!remembered || remembered.document.isClosed) {
      return Promise.reject(new Error(
        "Select the code the anchor should identify in a supported source file, then try again.",
      ));
    }
    const { document, selection } = remembered;
    const folder = workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return Promise.reject(new Error(
        "Semantic anchor authoring requires the selected file to be in an open workspace.",
      ));
    }
    const file = document.uri.path.slice(folder.uri.path.replace(/\/$/, "").length + 1);
    return Promise.resolve({
      file,
      sourceText: document.getText(),
      selectionStart: document.offsetAt(selection.start),
      selectionEnd: document.offsetAt(selection.end),
    });
  }

  private remember(editor: TextEditor): void {
    if (isSupportedLanguageId(editor.document.languageId) && !editor.selection.isEmpty) {
      this.last = { document: editor.document, selection: editor.selection };
    }
  }
}
