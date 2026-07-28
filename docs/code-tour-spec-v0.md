# Code Tour 拡張 v0 仕様書(ドラフト)

status: draft r2 / §10 の (A)(B) は決定済み、(C)〜(E) は実装時決定に先送り
scope: v0(対応言語1、フロー図なし、TourPlayer + スポットライトのみ)。ただしスキーマと意味論は最終形(v2: 図・アニメーション・ツアーモード完全版)を前提に設計する。

---

## 1. 目的と非目的

### 1.1 目的
- 新規メンバーのオンボーディングに特化した、コードベースの案内ツアーを VSCode 上で提供する。
- ツアーは複数ファイルにまたがる処理の流れを、開発者(作者)が定義した順序で見せる。
- 読者は手動送り(1ホップずつ)でツアーを進む。
- コードの変更に対して頑健であること。壊れた場合は読者に読ませず「要修復」として作者に返す。

### 1.2 非目的(v0 で扱わない/永続的に扱わない)
- オンボーディング進捗の管理・永続化(永続的に非目的)
- 自動再生・アニメーション遷移(v2)
- フロー図パネル(v1)
- 複数言語対応(v0 は 1 言語)
- 行番号ベースの位置指定(思想として排除。§4.4 参照)

---

## 2. 用語

| 用語 | 定義 |
|---|---|
| ツアー | 順序付けられたステップの列。1 ファイル = 1 ツアー |
| ステップ | 1 つの説明トピック。ホップの列を持つ |
| ホップ | 1 回の「次へ」で表示される 1 シーン。複数アンカーを同時に提示できる |
| アンカー | コード上の意味的位置。レジストリに定義され、ホップから id 参照される |
| symbol-path | 言語アダプタが定義する厳密なシンボル経路 |
| refinement | symbol-path が指すシンボル内部の構造的絞り込み |
| snapshot | アンカー作成時点の対象コード片の保存(修復用) |
| 言語アダプタ | symbol-path ⇔ tree-sitter ノードの双方向変換を担う言語別モジュール |

---

## 3. ファイル規約

```
<repo root>/
  .codetours/
    tours/
      overview.tour.yaml
      auth-api.tour.yaml
    anchors.yaml          # 共有アンカーレジストリ
```

- ツアー・アンカーともに YAML(作者が読み書きする。コメント可)。
- ツアーの順序関係はファイル名でなく `prerequisites` メタデータで表現する。
- `anchors.yaml` は将来的に分割可能(`anchors/*.yaml` をマージ)とするが、v0 は単一ファイル。

---

## 4. アンカー仕様

### 4.1 レジストリ形式

```yaml
# .codetours/anchors.yaml
anchors:
  - id: auth.service.authenticate        # ツアーからの参照名。ドット区切り推奨(規約であり構文ではない)
    file: src/auth/service.ts
    symbol: AuthService.authenticate     # symbol-path(言語アダプタが解釈)
    refinement: null                     # 任意。§4.3
    snapshot:
      hash: sha256:ab12...               # 正規化後テキストのハッシュ
      text: |                            # 原文(数行〜シンボル全体)
        async authenticate(email: string, password: string) {
          ...
```

- **アンカー id はレジストリ内で一意。** ツアーは id のみで参照し、file/symbol を直接書かない。
- 逆引き(file → 参照アンカー → 参照ツアー)を高速化するため、実装はレジストリ読込時に索引を構築する。

### 4.2 参照記法(canonical 形式)

```
anchor := <file> "::" <symbol-path> [ "@" <refinement> ]
例:      src/auth/service.ts::AuthService.authenticate@if[0]
```

- レジストリ YAML 上は file / symbol / refinement を分離フィールドで持つ。canonical 文字列はログ・診断・CLI 出力用の表示形式。
- symbol-path の文法は**言語アダプタが定義する**。コアは不透明文字列として扱い、解決結果(Range)のみ受け取る。

### 4.3 refinement

- symbol-path が指すシンボルの**内部**を構造的に絞る。シンボル相対であり、シンボルの移動では壊れない。
- v0 で許す種別(いずれも tree-sitter ノード種別に基づく構造指定):
  - `@if[n]` / `@for[n]` / `@switch[n]` … シンボル直下 n 番目(0 起点、ソース順)の該当構文
  - `@return[n]` … n 番目の return 文(`[n]` 省略時は唯一であることを要求し、複数なら解決失敗)
  - `@call(NAME)[n]` … 呼び出し式のうち callee 名が NAME のもの
- **`@lines(..)` は v0 に含めない。** 位置指定は「見かけの厳密性」を持ち込むため、仕様から排除する(将来入れる場合も fragile と明示された別階層とする)。

### 4.4 無名シンボルの扱い(原則)

> **名前のないものに座標を与えない。**

- 無名関数・クロージャ・コールバックは symbol-path で直接指せない。
- 指したい場合は、最も近い名前付き親シンボルを symbol-path とし、refinement で絞る。
- `arg:1` のような構造座標(引数位置等)は導入しない。順序変更で壊れるのに厳密に見えるため。
- **系(スパイク①より): 関数ローカルの名前はパスセグメントにしない。** `const user = ...` のようなローカル変数は名前を持つが、無名関数と同等に揮発的である。パスセグメントになれるのは module / namespace / class スコープの宣言のみ。ローカルスコープ内は refinement(`@call(...)` 等)で指す。

### 4.5 アンカーの生成

- **アンカーは原則手書きしない。** 作者はエディタで範囲選択 → 「アンカー作成」コマンド → 言語アダプタが逆変換(ノード → symbol-path [+ refinement])して `anchors.yaml` に追記する。
- 逆変換が一意な symbol-path を生成できない範囲(無名関数の内部のみ等)を選択した場合、コマンドは最近傍の名前付き親を提案し、refinement 候補を提示する。それも不可能なら生成を拒否する(§4.4 の原則をツールが強制する)。
- id は `file と symbol からの提案値` を自動生成し、作者が編集可能。

### 4.6 snapshot

- アンカー作成時、解決範囲の**正規化テキスト**(インデント・空白正規化後)とそのハッシュを保存する。
- 用途: (1) drifted 判定時の候補照合、(2) broken 時に作者へ「元は何を指していたか」を提示。
- **更新規則: healthy 解決に成功した検証イベント(§7.2)のたびに、ツールが snapshot を現状に自動更新してよい**(意味は変わらず表現だけ変わったケースで snapshot が陳腐化するのを防ぐ)。自動更新は `anchors.yaml` への書込みを伴うため、作者環境でのみ行い、読者環境・CI では行わない。

---

## 5. ツアースキーマ

```yaml
# .codetours/tours/auth-api.tour.yaml
id: auth-api
title: 認証APIの流れ
description: ログインリクエストがどう処理されるかを追う
prerequisites: [overview]        # ツアー id の列。案内のみ(決定済み)。閲覧はブロックしない
steps:
  - id: login-flow
    title: ログインリクエストの流れ
    hops:
      - summary: エントリポイント                # インライン表示用の一行(必須)
        body: |                                  # パネル表示用の本文(任意、Markdown)
          Controller は DTO 変換だけを行い、検証は Service に委譲します。
        anchors:
          - ref: auth.controller.login          # anchors.yaml の id
            emphasis: primary
      - summary: authenticate は 2 箇所から呼ばれる
        anchors:
          - ref: auth.service.authenticate
            emphasis: primary
          - ref: auth.controller.login-call
            emphasis: secondary
          - ref: auth.refresher.refresh-call
            emphasis: secondary
    links:                                       # ステップ単位のクロスリンク(任意)
      - to: auth-internals#token-verification    # tourId#stepId
        label: トークン検証を深掘りする
```

### 5.1 制約(バリデーションルール)

1. ホップの `anchors` は 1 個以上。`emphasis: primary` は**ちょうど 1 つ**。
2. `ref` は `anchors.yaml` に存在する id であること。
3. `prerequisites` / `links` の参照先ツアー・ステップが存在すること。循環 prerequisites は禁止。
4. `summary` は必須・1 行。`body` は任意。
5. ツアー id はファイル間で一意。

---

## 6. 実行時セマンティクス

### 6.1 TourPlayer(唯一の状態機械)

```
state = { tourId, stepIndex, hopIndex, health }
入力イベント: next / prev / gotoStep(i) / gotoHop(i,j) / exit
購読者: EditorRenderer(v0), FlowDiagramView(v1+)
```

- ビューは状態の投影に徹する。ビュー間の直接通信は禁止。
- v0 でも FlowDiagramView を購読者として想定したイベント設計にしておく(後付けで挿すだけにする)。

### 6.2 「次へ」の意味論

- `next`: ステップ内に残りホップがあれば `hopIndex+1`。最終ホップなら次ステップの第 1 ホップ。最終ステップの最終ホップならツアー完了表示。
- `prev`: 対称。
- キーバインド: `Alt+→` / `Alt+←`(既定。変更可能)。
- ステップ単位ナビ: パンくず UI(v0 は QuickPick / ステータスバー、v1 以降は図が兼ねる)。

### 6.3 ホップ表示の手順(1 遷移で行うこと)

1. primary アンカーのファイルを適切なエディタグループに開く(未オープン時)。次ホップのファイルは `preserveFocus` で先読みオープンしてよい。
2. primary の Range へ `revealRange`(中央寄せ)。
3. 全アンカーへ装飾適用: 対象ファイル全体をディム、primary を強ハイライト、secondary を弱ハイライト。
4. `summary` をインライン装飾(primary 行の after テキストまたは CodeLens 風)で表示。`body` はパネルに表示(v0 は Webview なしのためサイドの Markdown プレビュー相当の簡易ビュー、v1 で図と同居)。

### 6.4 ツアーモード

- ツアー開始時にレイアウトを専有する: サイドバーを畳み、(v1+)下部パネルにフロー図、エディタグループをホップ構成に合わせ構成。終了時に開始前レイアウトを復元する。
- 根拠: ツアー中はコードリーディングの時間であり、コーディングの時間ではない。共存より専有が体験・実装ともに単純。
- ツアーモード中の編集は禁止しない(read-only 化しない)が、保存が発生したら §7.2 の検証が走る。

---

## 7. 健全性と修復

### 7.1 アンカー健全性の 3 状態

| 状態 | 定義 | 読者体験 |
|---|---|---|
| healthy | symbol-path(+refinement)が一意に解決 | 通常表示 |
| drifted | (a) symbol-path 解決成功だが refinement 失敗 → シンボル全体をハイライトして続行 (b) symbol-path 失敗だが snapshot 照合で候補が一意 → 追従して続行 | 続行(作者へは警告) |
| broken | 上記いずれも不成立(候補なし or 複数曖昧) | §7.3 |

- **drifted の自動追従は表示上のみ**であり、`anchors.yaml` を書き換えない。書換え(再バインド)は作者の修復操作または明示コマンドによる。

### 7.2 検証イベント

1. **ツアー起動時**: 当該ツアーの全アンカーを一括解決。
2. **保存時(作者環境)**: 保存ファイルを参照するアンカーのみ逆引きして再解決。壊した瞬間に通知。
3. **CI**: `tour validate`(§8)で全ツアー検証。broken を含む状態で main に入ることを構造的に防ぐ。

### 7.3 broken 時の体験

- ホップ内 **primary が broken** → ツアーを「要修復」とする。読者はツアー一覧で ⚠ を見る。開こうとすると「メンテナンス中(作者: X)」と表示され、開けない。
- **このブロックは一律に適用する(決定済み)。** ローカルブランチが main とずれている場合も例外にしない。原則: *壊れたツアーを部分的に読ませるより、読めないと明示する方が信頼を保つ*(可用性より信頼性)。ただしブロック画面には文脈を示す: 読者のワーキングツリーで broken だが直近の検証済み状態では healthy だった場合、「あなたのブランチではこのツアーは検証できません」と表示し、責任の所在が読者のブランチ状態にあることを伝える。
- **secondary のみ broken** → 警告付きで続行可(ツアーは要修復にしない。作者へ警告のみ)。
- 作者向け修復ビュー: 壊れたアンカーごとに snapshot(旧コード片)と現在の候補を並置し、候補クリックで再バインド。

### 7.4 ツアー健全性の合成規則

```
tour.health = broken   if ∃hop: primary anchor が broken
            = drifted  else if ∃anchor: drifted or (secondary broken)
            = healthy  otherwise
```

---

## 8. CLI / CI

- `tour validate [--format json]` : 全ツアー・全アンカーを検証し、健全性レポートを返す。broken があれば非 0 終了。
- コア(スキーマ解釈・アンカー解決・言語アダプタ)は **vscode API に依存しないパッケージ**として切り出す。CLI と拡張が同一コアを共有する。
- これは制約でもある: EditorRenderer 以外のロジックに vscode 依存を持ち込まない。

## 9. v0 スコープ境界

含む: スキーマ+バリデーション / 言語アダプタ ×1(TypeScript を想定)/ アンカー生成コマンド(逆変換)/ TourPlayer / スポットライト表示 / summary インライン+body 簡易パネル / 保存時・起動時検証 / `tour validate` CLI

含まない: フロー図(v1)/ 遷移アニメーション・レイアウト自動構成の完全版(v2)/ 第 2 言語以降 / 非コードファイル(YAML キーパス)アダプタ ※思想上は §4 と整合するため将来拡張として自然

---

## 10. 書き下ろして見つかった矛盾・要決定事項

**(A) broken ブロックの一律適用 — 決定済み**
broken ツアーは状況を問わず開けない(ローカルブランチのずれ由来でも例外なし)。可用性より信頼性を優先する。ブロック画面で文脈(ブランチ由来か作者由来か)を提示することで緩和する。§7.3 に反映済み。

**(B) prerequisites は案内のみ — 決定済み**
閲覧ブロックはしない。進捗管理を持たない決定との論理的整合(既読状態が存在しないためブロックは実装不能)による。§5 に反映済み。

**(C) snapshot 自動更新と Git の相互作用**
§4.6 の自動更新は作者の保存のたびに `anchors.yaml` に diff を生む。PR ノイズになる恐れ。→ 要決定: 自動更新を「明示コマンド時のみ」に弱めるか、正規化ハッシュのみ更新して text は据え置くか。

**(D) `@return`(序数省略形)の失敗様式**
「省略時は唯一であることを要求」とした結果、return 文の追加という軽微な変更で解決失敗(→drifted)する。refinement の中でも壊れやすさに差がある。v0 ではこのままとし、生成コマンドは常に序数付きを出力する、を推奨規則とした。→ 承認要。

**(F) export default 無名クラス/関数のメンバー(スパイク①で発見)**
`export default class { run() {} }` の `run` は、親が無名のため孤児パス `run` になる(モジュール内に他の `run` が現れた瞬間に曖昧化する)。ES モジュールでは `default` は実在するバインディング名なので、擬似セグメント `default.run` を許すのは §4.4 の原則と矛盾しない、が要決定。代替案は「無名 default のメンバーは指せない(export に名前を付けよ、とツールが促す)」。

**(E) body パネルの v0 実装**
図は v1 だが body 表示にはパネルが要る。v0 で簡易 Webview を作ると v1 で作り直しになる。→ 要決定: v0 の body は Markdown プレビュー流用等の最小実装と割り切るか、v1 の Webview 骨格を v0 で前倒すか。
