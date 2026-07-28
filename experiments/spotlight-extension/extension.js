const vscode = require("vscode");
const { TourPlayer } = require("./tourPlayer");
const { EditorRenderer } = require("./editorRenderer");
const sampleTour = require("./sampleTour");

let player = null;

function activate(context) {
  const reg = (cmd, fn) => context.subscriptions.push(vscode.commands.registerCommand(cmd, fn));

  reg("codeTourSpike.start", async () => {
    const root = vscode.Uri.joinPath(context.extensionUri, "..", "..");
    const renderer = new EditorRenderer(context, root);

    player = new TourPlayer(sampleTour);
    player.subscribe((kind, state) => renderer.onPlayerEvent(kind, state));
    player.subscribe(async (kind) => {
      // ツアーモード(§6.4): 開始でサイドバーを畳み、終了で開く(完全なレイアウト復元は本実装課題)
      if (kind === "start") {
        await vscode.commands.executeCommand("workbench.action.closeSidebar");
        await vscode.commands.executeCommand("setContext", "codeTourSpike.active", true);
      }
      if (kind === "exit") {
        await vscode.commands.executeCommand("setContext", "codeTourSpike.active", false);
      }
    });

    player.start();
  });

  reg("codeTourSpike.next", () => player && player.next());
  reg("codeTourSpike.prev", () => player && player.prev());
  reg("codeTourSpike.exit", () => { if (player) { player.exit(); player = null; } });
}

function deactivate() {
  if (player) player.exit();
}

module.exports = { activate, deactivate };
