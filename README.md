# Konstelia

Konsteliaは、ソースコード上の意味のある場所を順番にたどる「コードツアー」を作成・再生するVS Code拡張です。ファイルの行番号ではなく、言語ごとのsymbol-pathと構造的なrefinementを使ってコードを特定します。そのため、コードの移動や軽微な編集があっても、アンカーを再解決したり修復候補を探したりできます。

現在はMVPです。TypeScript/TSX、JavaScript/JSX、Python、Ruby、Rust、Go、Swift、Java、C#、C、C++、Kotlin、単一ルートのワークスペース、YAMLによるツアー編集、Personal・Workspace・Repositoryの3スコープに対応しています。専用のツアー編集画面、フローダイアグラム、同期、AI機能にはまだ対応していません。

- GitHub: [kenten10/konstelia](https://github.com/kenten10/konstelia)
- 不具合・改善要望: [GitHub Issues](https://github.com/kenten10/konstelia/issues)

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

## VS Codeへインストールする

必要な環境はNode.js 20以降、npm、VS Code 1.96以降です。リポジトリのルートで次を実行すると、配布可能な`konstelia.vsix`を作成して現在のVS Codeへインストールします。

```bash
npm install
npm run extension:install
```

VSIXの作成だけを行う場合は次を実行します。

```bash
npm run extension:package
```

作成した`konstelia.vsix`は、VS CodeのExtensionsビューにある「Views and More Actions (`...`)」→「Install from VSIX...」から選択してインストールすることもできます。インストール後にVS Codeを再読み込みし、コマンドパレットから`Konstelia: Play Sample Tour`を実行してください。

## 最初に試す

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

`prerequisites`と`links`もスキーマ検証されますが、リンクを使った対話的なstep移動は未実装です。現在はホップを記述順に再生します。

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

## ツアーファイルを開く

**Konstelia: Browse Tours**を使うと、スコープを選んで保存済みツアーYAMLを開けます。UIコードは保存パスを組み立てず、選択した`TourScope`をstorage resolverへ渡します。

## コマンド一覧

| コマンド | 用途 |
| --- | --- |
| **Konstelia: Create Tour** | 最小のツアーYAMLを作成する |
| **Konstelia: Create Anchor from Selection** | TypeScript/TSX/Pythonの選択からアンカーを作成する |
| **Konstelia: Repair Anchor from Selection** | 選択範囲へ既存アンカーを再bindingする |
| **Konstelia: Repair Anchor Automatically** | ワークスペースから修復候補を探索する |
| **Konstelia: Browse Tours** | 保存済みツアーYAMLを開く |
| **Konstelia: Play Tour** | スコープとツアーを選んで再生する |
| **Konstelia: Play Sample Tour** | 同梱Repositoryサンプルを直接再生する |
| **Konstelia: Install Sample Tours** | 3スコープへサンプルを冪等に導入する |

## トラブルシュート

### Personal tourが別workspaceでbrokenに見える

**Play Tour**からPersonal tourを選び、表示される**Rebind and Play**を確認してください。Konsteliaは再binding後に現在のworkspaceでhealthを評価します。

### 自動修復候補が見つからない

対象がTypeScript/TSX/Pythonであること、先頭のworkspace root内にあること、アンカーにsnapshotが保存されていることを確認してください。候補が得られない場合は、対象コードを選択して**Repair Anchor from Selection**を使えます。

### RepositoryまたはWorkspaceスコープが使えない

VS Codeで対象フォルダーを開いてください。ファイル単体のウィンドウではworkspace storageとrepository rootを解決できません。

### YAMLを直しても一覧へ出ない

ProblemsビューのKonstelia診断を確認してください。無効なツアーファイルは通常の一覧から除外されます。Repositoryスコープなら`npm run tour -- validate`でも詳細を確認できます。

## 開発と検証

```bash
npm run compile   # dist/へTypeScriptをビルド
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
