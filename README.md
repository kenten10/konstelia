# Konstelia

[English](README.en.md) | 日本語

Konsteliaは、ソースコード上の意味のある場所を順番にたどる「コードツアー」を作成・再生するVS Code拡張です。ファイルの行番号ではなく、言語ごとのsymbol-pathと構造的なrefinementを使ってコードを特定します。そのため、コードの移動や軽微な編集があっても、アンカーを再解決したり修復候補を探したりできます。

[VS Code Marketplaceで見る](https://marketplace.visualstudio.com/items?itemName=kenten10.konstelia) · [GitHub](https://github.com/kenten10/konstelia) · [不具合・改善要望](https://github.com/kenten10/konstelia/issues)

## 30秒デモ

![Konsteliaでサンプル認証APIのコードツアーを再生する30秒デモ](media/konstelia-demo.gif)

`Alt+Right` / `Alt+Left`でホップを移動すると、関連するファイルが開き、対象コードと説明が同じ画面に表示されます。

## 何が嬉しいか

- **コードが動いてもツアーが長持ちする** — 行番号ではなくsymbol-pathと構造で場所を特定し、ずれたアンカーには修復候補を提示します。
- **「どこ」だけでなく「なぜ」も共有できる** — 複数ファイルをまたぐ処理の順序と、各地点で読むべき説明をコードのそばに表示します。
- **用途に合った範囲で保存できる** — 個人用、現在のワークスペース用、Gitでチーム共有するRepository用を選べます。
- **壊れた案内に早く気づける** — ツアーを`healthy`、`drifted`、`broken`で評価し、RepositoryツアーはCLIでも検証できます。

## 3分で試せる Quick Start

必要なのはVS Code 1.96以降だけです。

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=kenten10.konstelia)からKonsteliaをインストールします。
2. VS Codeを再読み込みし、コマンドパレット（`Cmd+Shift+P` / `Ctrl+Shift+P`）を開きます。
3. **Konstelia: Play Sample Tour**を実行します。
4. `Alt+Right`で次へ、`Alt+Left`で前へ進み、ポップオーバーの**終了**でツアーを閉じます。

Marketplaceを利用できない場合は、[最新のGitHub Release](https://github.com/kenten10/konstelia/releases/latest)から`konstelia.vsix`を入手し、Extensionsビューの「Views and More Actions (`...`)」→「Install from VSIX...」でインストールできます。

## 実際のスクリーンショット

![Konsteliaが認証APIの関連コードを2つのエディターで強調し、説明ポップオーバーを表示している画面](media/konstelia-tour.png)

primaryアンカーを中央に、補助的なsecondaryアンカーを隣のエディターに表示した例です。説明、現在のホップ、前後移動と終了の操作をコードから目を離さず確認できます。

現在はMVPです。TypeScript/TSX、JavaScript/JSX、Python、Ruby、Rust、Go、Swift、Java、C#、C、C++、Kotlin、単一ルートのワークスペース、YAMLと専用編集画面によるツアー編集、ツアーから自動生成するフロー図、Personal・Workspace・Repositoryの3スコープに対応しています。同期、AI機能、遷移アニメーションにはまだ対応していません。

## リポジトリ構成

```text
.konstelia/  Repository tourとsemantic anchor
docs/        仕様と実装計画
examples/    ツアーが参照する多言語サンプル
experiments/ 初期設計を検証したスパイク
samples/     各保存スコープへ導入するツアーテンプレート
scripts/     公開前の安全性検査とGit hook設定
src/         拡張機能とCLIの製品コード
test/        Node.jsで実行するunit test
```

## インストール

### VS Code Marketplaceからインストールする

[KonsteliaのMarketplaceページ](https://marketplace.visualstudio.com/items?itemName=kenten10.konstelia)で**Install**を選びます。インストール後にVS Codeを再読み込みし、コマンドパレットから**Konstelia: Play Sample Tour**を実行してください。

### GitHub Releaseからインストールする

必要な環境はVS Code 1.96以降です。[最新のRelease](https://github.com/kenten10/konstelia/releases/latest)から`konstelia.vsix`と`konstelia.vsix.sha256`をダウンロードするか、macOS・Linuxでは次を実行します。

```bash
curl -LO https://github.com/kenten10/konstelia/releases/latest/download/konstelia.vsix
curl -LO https://github.com/kenten10/konstelia/releases/latest/download/konstelia.vsix.sha256
shasum -a 256 -c konstelia.vsix.sha256
code --install-extension konstelia.vsix --force
```

Windows PowerShellでは、次の値が`konstelia.vsix.sha256`の先頭の値と一致することを確認してからインストールします。

```powershell
(Get-FileHash .\konstelia.vsix -Algorithm SHA256).Hash.ToLower()
code --install-extension .\konstelia.vsix --force
```

VS CodeのExtensionsビューにある「Views and More Actions (`...`)」→「Install from VSIX...」から`konstelia.vsix`を選択することもできます。インストール後にVS Codeを再読み込みし、このリポジトリを開いてコマンドパレットから`Konstelia: Play Sample Tour`を実行してください。

現在のMVPは単一ルートのワークスペースを対象とします。`Konstelia: Install Sample Tours`は参照ソースを保証するため、同梱Konstelia workspaceでのみインストールを続行します。

アンインストールする場合はExtensionsビューからKonsteliaを削除するか、次を実行します。

```bash
code --uninstall-extension kenten10.konstelia
```

### ソースからインストールする

必要な環境はNode.js 20以降、npm、VS Code 1.96以降です。リポジトリのルートで次を実行すると、配布可能な`konstelia.vsix`を作成して現在のVS Codeへインストールします。

```bash
npm install
npm run extension:install
```

VSIXの作成だけを行う場合は次を実行します。

```bash
npm run extension:package
```

Release用のVSIXとSHA-256 checksumをまとめて作成する場合は次を実行します。

```bash
npm run extension:release
```

## ソースから試す

必要な環境はNode.js 20以降、npm、VS Code 1.96以降です。

```bash
npm install
npm run validate
```

1. VS Codeでこのリポジトリのルートを開きます。
2. `F5`を押してExtension Development Hostを起動します。
3. 新しく開いたウィンドウで`Cmd+Shift+P`または`Ctrl+Shift+P`を押します。
4. **Konstelia: Play Sample Tour**を実行します。

このコマンドは拡張に同梱されたRepositoryサンプルを直接再生します。サンプルを各スコープへコピーして通常の一覧から試す場合は、**Konstelia: Install Sample Tours**を一度実行し、その後に**Konstelia: Play Tour**からPersonal、Workspace、Repositoryのいずれかを選択してください。インストールは冪等で、内容が異なる既存のツアーやアンカーを上書きしません。

Install Sample Toursは参照先ソースが必ず存在するよう、同梱Konstelia workspaceでのみ実行します。別のworkspaceから実行した場合は、確認後に同梱workspaceを開いてインストールを継続します。

対応言語のサンプルを試すには、**Konstelia: Play Tour**を実行して**Repository**を選び、言語名が付いたツアーを選択します。

| 言語 | ツアー | 対象ソース |
| --- | --- | --- |
| TypeScript | サンプル認証APIの流れ | `examples/authentication/` |
| JavaScript | JavaScript注文処理の流れ | `examples/languages/javascript/` |
| Python | Python注文処理の流れ | `examples/python/` |
| Ruby | Ruby注文処理の流れ | `examples/languages/ruby/` |
| Rust | Rust注文処理の流れ | `examples/languages/rust/` |
| Go | Go注文処理の流れ | `examples/languages/go/` |
| Swift | Swift注文処理の流れ | `examples/languages/swift/` |
| Java | Java注文処理の流れ | `examples/languages/java/` |
| C# | C#注文処理の流れ | `examples/languages/csharp/` |
| C | C注文処理の流れ | `examples/languages/c/` |
| C++ | C++注文処理の流れ | `examples/languages/cpp/` |
| Kotlin | Kotlin注文処理の流れ | `examples/languages/kotlin/` |

注文処理ツアーは商品検索、存在確認、注文保存、返却という共通の流れを使っており、各言語の型、interface、protocol、traitなどの表現を比較できます。TSX/JSXはTypeScript/JavaScriptと同じアダプターで対応します。

## ツアーを再生する

**Konstelia: Play Tour**を実行すると、最初にスコープ、次にツアーを選択します。

- RepositoryとWorkspaceでは、一覧に`healthy`、`drifted`、`broken`の状態が表示されます。
- Personalでは、ツアー選択後に現在のワークスペースとのsource bindingを確認してからhealthを評価します。
- primaryアンカーがbrokenの場合は再生を開始しません。
- secondaryアンカーがbrokenの場合は警告し、そのアンカーをスキップして続行します。
- driftedアンカーはフォールバック位置を表示し、作者が後で修復できるよう警告します。

再生中は対象コードが強調表示され、その近くに説明ポップオーバーが表示されます。

- `Alt+Right`: 次のホップへ進む
- `Alt+Left`: 前のホップへ戻る
- **終了**: ツアーを終了してハイライトとポップオーバーを閉じる

先頭では前へ進めず、最後のホップには「次へ」を表示しません。最後も**終了**を選ぶまで表示を維持します。

## ツアーを作成する

### 1. 保存スコープを決める

**Konstelia: Create Tour**を実行し、スコープとタイトルを入力します。安全なIDと一意なファイル名を生成し、最小のYAMLを開きます。

```yaml
id: authentication-overview
title: Authentication Overview
steps: []
```

Create Tourはツアーの入れ物だけを作ります。実際に再生するには、次の手順でアンカーを作成し、YAMLのホップから参照してください。

### 2. コードからアンカーを作成する

1. ワークスペース内の対応言語ファイルを開きます。現在はTypeScript/TSX、JavaScript/JSX、Python、Ruby、Rust、Go、Swift、Java、C#、C、C++、Kotlinに対応しています。
2. ツアーで示したい関数、メソッド、プロパティ、条件分岐、return、関数呼び出しなどを選択します。
3. **Konstelia: Create Anchor from Selection**を実行します。
4. ツアーと同じスコープを選択します。
5. 提案されたアンカーIDを確認し、必要なら編集して確定します。

選択範囲を直接表現できず、近くの型や関数全体へスナップする場合は、保存前に解決先を示す確認ダイアログが表示されます。意図した対象と異なる場合はキャンセルしてください。field/propertyの直接symbol化は言語アダプターによって対応範囲が異なります。

Konsteliaは選択範囲からsymbol-path、refinement、正規化snapshot、SHA-256 hashを生成し、そのスコープの`anchors.yaml`へ保存します。ツアーYAMLとアンカーレジストリは別ファイルです。ホップの`ref`には作成したアンカーIDを指定します。

### 3. ツアーYAMLを編集する

```yaml
id: authentication-overview
title: Authentication Overview
description: ログイン要求からセッション発行までをたどる
steps:
  - id: login
    title: Login flow
    hops:
      - summary: Controller receives the login request
        body: |
          入力を取り出し、認証サービスへ処理を委譲します。
        anchors:
          - ref: auth.controller.login
            emphasis: primary
          - ref: auth.service.authenticate-call
            emphasis: secondary
```

各ホップには次の制約があります。

- `summary`は必須で、1行にします。
- `anchors`には1件以上の参照が必要です。
- `emphasis: primary`はちょうど1件必要です。
- 補助的に同時表示するアンカーは`secondary`にします。
- `ref`は同じスコープの`anchors.yaml`に存在するIDを指定します。
- step IDは同一ツアー内で一意にします。

`prerequisites`と`links`もスキーマ検証されます。`links`はフロー図に表示しますが、リンクを使った対話的なstep移動は未実装です。現在はホップを記述順に再生します。

YAMLを直接書く代わりに、**Konstelia: Edit Tour**の編集画面から同じ内容を編集することもできます。

### 4. YAMLとhealthを確認する

Repositoryスコープでは、保存時の診断に加えてCLIでも確認できます。

```bash
npm run tour -- validate
npm run --silent tour -- validate --format json
```

無効なYAML、重複ID、存在しないアンカー、壊れたリンク、循環したprerequisite、brokenアンカーを報告します。brokenがある場合は終了コードが非0になります。driftedは報告しますが、終了コードを失敗にはしません。

## アンカーを修復する

コードの移動や編集でアンカーがdriftedまたはbrokenになった場合は、stable IDを維持したまま参照先を更新できます。ツアーYAMLの`ref`を書き換える必要はありません。

### 選択範囲を修復先にする

1. 新しい対象コードを選択します。
2. **Konstelia: Repair Anchor from Selection**を実行します。
3. スコープと修復するアンカーを選択します。
4. 保存済みsnapshotと新しい対象の差分を確認します。
5. **Rebind**を選択します。

### ワークスペースから候補を探す

1. **Konstelia: Repair Anchor Automatically**を実行します。
2. スコープと修復するアンカーを選択します。
3. 進捗通知を確認し、類似度順の候補から対象を選びます。
4. 差分を確認して**Rebind**を選択します。

自動探索は先頭のワークスペースルートにある対応言語のソースファイルを対象にします。`node_modules`、`.git`、`dist`、`out`、`build`、`.konstelia`、`.d.ts`は除外します。読み取れなかったファイルやキャンセルによる部分結果がある場合は通知します。

TypeScript/JavaScriptはTypeScript Compiler API、Python/Go/Rust/Java/C/C++はLezerの構文木を使ってアンカーを生成・解決します。公式Lezer文法がないRuby/Swift/C#/Kotlinは、コメント・文字列・ブロック境界を認識する言語別構造スキャナーを使います。いずれもUIやツアーサービスからは共通のsemantic anchor interfaceとして扱われます。

確認中に対象ファイルが編集、削除、移動された場合は保存直前の再検証で修復を中止します。もう一度候補を選び直してください。

Personalアンカーは、参照している全Personal tourが現在のsource workspaceにbindingされている場合だけ修復できます。未bindingのtour、別workspaceにbindingされたtour、複数workspaceのtourから共有されているアンカーは安全のため修復を拒否します。

## 3つの保存スコープ

| スコープ | 用途 | 保存場所 | ソースワークスペース |
| --- | --- | --- | --- |
| Personal | VS Codeユーザー個人だけで使う | `ExtensionContext.globalStorageUri`配下 | tourごとにローカルmetadataでbinding |
| Workspace | 現在のworkspaceだけで使う | `ExtensionContext.storageUri`配下 | 現在のworkspace |
| Repository | Gitでチーム共有する | `<workspace>/.konstelia/` | 現在の先頭workspace root |

PersonalとWorkspaceのファイルはリポジトリへ書き込みません。Repositoryでは次のファイルを共有します。

```text
.konstelia/
  anchors.yaml
  tours/
    *.tour.yaml
```

Personal tourのbindingは絶対パスをYAMLへ保存せず、VS Codeのユーザーmetadataに保持します。別workspaceで再生しようとすると、ツアー選択後に明示的な再binding確認を表示します。

Workspaceスコープはフォルダーまたはworkspaceを開いている場合だけ利用できます。現在の実装は単一ルートを対象とし、multi-rootの明示的なrepository選択にはまだ対応していません。

## 編集画面でツアーを編集する

**Konstelia: Edit Tour**を実行し、スコープとツアーを選ぶと、専用の編集画面が開きます。YAMLを直接書かずに次の操作ができます。

- タイトル、説明、`prerequisites`の編集
- ステップとホップの追加、削除、並べ替え
- ホップの`summary`と`body`の編集
- アンカー参照の追加と削除（同じスコープの`anchors.yaml`にあるIDを補完します）
- `emphasis`の切り替え（`primary`を選ぶと同じホップの他のアンカーは自動で`secondary`になります）
- クロスリンク（`tourId#stepId`）の編集

編集内容はYAML保存前に検証します。スキーマ違反、存在しないアンカーID、壊れたリンク、重複したstep ID、循環したprerequisiteがある場合は保存せず、画面下部の検証結果に理由を表示します。検証を通ると元のツアーファイルへ上書き保存し、診断を更新します。ファイル名は変わりません。ツアーidはファイル名と対応するため、編集画面では変更できません。

未保存の変更があるとタブ名の先頭に`●`が付き、保存ボタンの横に状態を表示します。`Cmd+S` / `Ctrl+S`でも保存できます。

保存するとKonsteliaがYAMLを生成し直すため、**ファイル内のコメント、空行、スキーマ外のキーは失われます**。それらを保ちたいツアーはYAMLを直接編集してください。

右側にはフロー図を自動生成して表示し、編集のたびに更新します。ノードを選ぶと該当ホップの入力欄へ移動します。

## フロー図を見る

**Konstelia: Show Flow Diagram**を実行すると、パネル領域のKonsteliaビューにツアーのフロー図を表示します。一覧では**Konstelia: Play Tour**と同じようにhealthを表示し、修復が必要なツアーには⚠を付けます。図はツアーから自動生成します。

- ステップごとにレーンを作り、ホップを順番に並べます。
- 同じステップ内の遷移は実線、ステップをまたぐ遷移は破線で結びます。
- クロスリンクはステップの下にチップとして表示します（表示のみで、選んでも移動しません）。
- アンカーのhealthをノードの色で示します。driftedは警告色、brokenとレジストリ未定義はエラー色です。判定は一覧表示やCLIと同じ検証経路を使います。
- ノードを選ぶと、そのホップのsummary、body、アンカーを図の下に表示します。

ツアー再生中は、このビューが`TourPlayer`の状態を購読して現在のホップを強調します。再生中にノードを選ぶとそのホップへ移動し、エディター側の表示も追従します。図はビューであり、状態を持ちません。

## ツアーファイルを開く

**Konstelia: Browse Tours**を使うと、スコープを選んで保存済みツアーYAMLを開けます。UIコードは保存パスを組み立てず、選択した`TourScope`をstorage resolverへ渡します。

## コマンド一覧

| コマンド | 用途 |
| --- | --- |
| **Konstelia: Create Tour** | 最小のツアーYAMLを作成する |
| **Konstelia: Create Anchor from Selection** | 対応言語の選択範囲からアンカーを作成する |
| **Konstelia: Repair Anchor from Selection** | 選択範囲へ既存アンカーを再bindingする |
| **Konstelia: Repair Anchor Automatically** | ワークスペースから修復候補を探索する |
| **Konstelia: Browse Tours** | 保存済みツアーYAMLを開く |
| **Konstelia: Edit Tour** | 専用の編集画面でツアーを編集する |
| **Konstelia: Show Flow Diagram** | ツアーのフロー図をパネルに表示する |
| **Konstelia: Play Tour** | スコープとツアーを選んで再生する |
| **Konstelia: Play Sample Tour** | 同梱Repositoryサンプルを直接再生する |
| **Konstelia: Install Sample Tours** | 3スコープへサンプルを冪等に導入する |

## FAQ

### 行の追加や移動でツアーは壊れませんか？

行番号だけには依存していません。Konsteliaは言語ごとのsymbol-path、構造的なrefinement、snapshotを使って対象を再解決します。完全に追従できない場合も`drifted`または`broken`として検出し、選択範囲または自動探索からアンカーを修復できます。

### 対応言語は何ですか？

TypeScript/TSX、JavaScript/JSX、Python、Ruby、Rust、Go、Swift、Java、C#、C、C++、Kotlinに対応しています。field/propertyなど、選択範囲を直接symbol化できる粒度は言語アダプターによって異なります。

### ツアーをチームで共有できますか？

はい。Repositoryスコープを選ぶと`.konstelia/`配下へYAMLとして保存され、ソースコードと一緒にGitで共有できます。PersonalとWorkspaceスコープはリポジトリへ書き込みません。

### ツアーの作成に専用エディターはありますか？

あります。**Konstelia: Edit Tour**でステップ、ホップ、アンカー参照、クロスリンクをフォームから編集でき、フロー図も同時に確認できます。YAMLを直接編集することもでき、どちらの場合も同じ検証ルールが適用されます。保存時の診断に加え、Repositoryスコープは`npm run tour -- validate`でも検証できます。

### multi-root workspaceに対応していますか？

現在は単一ルートのワークスペースが対象です。multi-rootでの明示的なrepository選択にはまだ対応していません。

### Personal tourが別workspaceでbrokenに見える

**Play Tour**からPersonal tourを選び、表示される**Rebind and Play**を確認してください。Konsteliaは再binding後に現在のworkspaceでhealthを評価します。

### 自動修復候補が見つからない

対象が対応言語のファイルであること、先頭のworkspace root内にあること、アンカーにsnapshotが保存されていることを確認してください。候補が得られない場合は、対象コードを選択して**Repair Anchor from Selection**を使えます。

### RepositoryまたはWorkspaceスコープが使えない

VS Codeで対象フォルダーを開いてください。ファイル単体のウィンドウではworkspace storageとrepository rootを解決できません。

### YAMLを直しても一覧へ出ない

ProblemsビューのKonstelia診断を確認してください。無効なツアーファイルは通常の一覧から除外されます。Repositoryスコープなら`npm run tour -- validate`でも詳細を確認できます。

## 開発と検証

```bash
npm run compile   # 型検査し、dist/へVS Code拡張とCLIをバンドル
npm run lint      # src/とtest/へESLintを実行
npm test          # テスト用にコンパイルしNode.jsのunit testを実行
npm run check:public # 公開不可ファイルと秘密情報をGit履歴まで検査
npm run validate  # compile、lint、test、公開前検査をまとめて実行
```

通常のunit testはVS Codeウィンドウを必要としません。`F5`用のデバッグ構成は他のインストール済み拡張を無効にして起動するため、Konstelia以外のログやネットワークエラーを分離できます。

`npm install`はリポジトリの`.githooks/pre-push`を有効にします。push前には、環境ファイル、
秘密鍵、主要サービスのtoken形式、生成物、5 MiBを超えるファイルを現在のtreeとGit履歴の
両方で検査します。同じ検査はGitHub Actionsでも実行されます。

実装計画は`docs/implementation-plan.md`、semantic anchorとYAML形式の仕様は`docs/code-tour-spec-v0.md`を参照してください。

## ライセンス

Konsteliaは[MIT License](LICENSE)で公開しています。実行時依存のライセンスと
配布時の通知については[Third-Party Notices](THIRD_PARTY_NOTICES.md)を参照してください。
