# Code Tour Spike ②: ディム+スポットライト検証

依存ゼロのプレーンJS拡張。npm install 不要。

## 動かし方
1. このフォルダを VSCode で開く
2. F5(Extension Development Host が起動)
3. コマンドパレット → `Code Tour Spike: Start Sample Tour`
4. `Alt+→` 次ホップ / `Alt+←` 前ホップ / `Esc` 終了

## 検証観点(体感で判断するもの)
- [ ] ディム 0.30 は読みやすいか(editorRenderer.js の decoDim を調整)
- [ ] ホップ遷移(特にファイル跨ぎ)でチラつくか。ホップ2は controller と service の2ファイルが同時に光る
- [ ] 交互2カラム割当は自然か(columnFor を参照)
- [ ] summary/body のモーダル表示と前へ・次へ・終了の操作は自然か
- [ ] Esc 終了後、装飾が完全に消えるか

## 構成(仕様との対応)
- tourPlayer.js — 状態機械。vscode 非依存(§6.1, §8)
- editorRenderer.js — 投影のみ(装飾・reveal・カラム割当・先読み)(§6.3)
- sampleTour.js — ツアーデータ(本実装では YAML + anchors.yaml)
- アンカーは検索文字列の簡易リゾルバ。本実装ではスパイク①の symbol-path アダプタに差し替え
