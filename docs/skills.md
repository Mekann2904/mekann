# Skills Guide

Mekann の skill は、Pi coding agent が特定作業のために読む workflow 手順書です。runtime tool を提供する feature ではなく、設計、調査、issue 化、実装、保守の進め方を agent に渡すための実行可能なプロセスです。

この guide は、`mekann/skills/` 配下の skill について、何ができるか、いつ使うか、どの順序で組み合わせるかを説明します。詳細な手順は各 `SKILL.md` を正とし、この guide は入口・順序・組み合わせ・注意点に集中します。

## まずどの skill を使うか

| 状況 | 最初に使う skill | 次に使いやすい skill |
|---|---|---|
| アイデアや設計案を詰めたい | [`grill-with-docs`](../mekann/skills/grill-with-docs/SKILL.md) | `prototype`, `to-prd` |
| 触って確かめる試作品が欲しい | [`prototype`](../mekann/skills/prototype/SKILL.md) | `grill-with-docs`, `to-prd`, `to-issues` |
| PRD を作りたい | [`to-prd`](../mekann/skills/to-prd/SKILL.md) | `to-issues` |
| PRD や計画を実装 ticket に分解したい | [`to-issues`](../mekann/skills/to-issues/SKILL.md) | `triage`, `tdd` |
| issue を整理したい | [`triage`](../mekann/skills/triage/SKILL.md) | `grill-with-docs`, `diagnose`, `tdd` |
| バグや性能劣化を調べたい | [`diagnose`](../mekann/skills/diagnose/SKILL.md) | `tdd`, `improve-codebase-architecture` |
| TDD で実装したい | [`tdd`](../mekann/skills/tdd/SKILL.md) | `diagnose`, `improve-codebase-architecture`, `delegated-tdd` |
| コストを抑えて TDD 実装反復を委譲したい | [`delegated-tdd`](../mekann/skills/delegated-tdd/SKILL.md) | `tdd`, `diagnose` |
| コードベースの構造を改善したい | [`improve-codebase-architecture`](../mekann/skills/improve-codebase-architecture/SKILL.md) | `grill-with-docs`, `to-issues`, `tdd` |
| 知らないコード領域の全体像が欲しい | [`zoom-out`](../mekann/skills/zoom-out/SKILL.md) | 目的に応じて任意の skill |
| engineering skills の初期設定をしたい | [`setup-matt-pocock-skills`](../mekann/skills/setup-matt-pocock-skills/SKILL.md) | `triage`, `to-prd`, `to-issues` |
| 反復実験で最適化したい | [`autoresearch-create`](../mekann/skills/autoresearch-create/SKILL.md) | 通常は目的整理後に使う |
| Mekann の skill 自体を保守したい | [`mekann-pi-skill-dev`](../mekann/skills/mekann-pi-skill-dev/SKILL.md) | README / docs 更新 |

## 代表的な workflow

### 新機能を作る

```text
grill-with-docs → prototype（必要なら）→ to-prd → to-issues → tdd
```

- `grill-with-docs` で設計ツリーを辿り、用語・境界・制約を固める。
- UI、状態機械、データモデルなどを触って確かめたい場合は `prototype` を挟む。
- 目的地が固まったら `to-prd` で PRD にする。
- PRD を `to-issues` で tracer bullet 型の vertical slice に分解する。
- 各 issue を `tdd` で red-green-refactor しながら実装する。実装反復コストを抑えたい場合は `delegated-tdd` を使う。

### バグを直す

```text
triage（issue 起点なら）→ diagnose → tdd
```

- issue 起点なら `triage` で状態、再現情報、agent-ready かを確認する。
- `diagnose` で再現ループを作り、仮説を立て、計測し、原因を特定する。
- correct seam があるなら `tdd` で regression test を先に書いて修正する。繰り返し実装を別モデルへ任せたい場合は `delegated-tdd` を使う。
- correct seam がない場合は、修正後に `improve-codebase-architecture` を検討する。

### 大きなリファクタリングや構造改善を進める

```text
improve-codebase-architecture → grill-with-docs → to-issues → tdd
```

- `improve-codebase-architecture` で浅い module、弱い seam、テストしづらい構造を探す。
- 候補を選んだら `grill-with-docs` 的に設計を詰める。
- 実装可能な vertical slice にするため `to-issues` を使う。
- 各 slice は `tdd` で外部挙動を守りながら進める。

### 設計を触って確かめる

```text
prototype → grill-with-docs → to-prd / to-issues
```

- prototype は production code ではなく、質問に答えるための throwaway code。
- 学びだけを残し、prototype 自体は削除するか本実装に吸収する。
- 決まった用語や境界は `CONTEXT.md`、重い意思決定は必要に応じて ADR に残す。

### issue 管理を回す

```text
triage → grill-with-docs / diagnose / to-issues / tdd
```

- 曖昧な enhancement は `grill-with-docs` で詰める。
- bug は再現できるなら `diagnose` に進める。
- 大きすぎる issue は `to-issues` で分割する。
- `ready-for-agent` になった issue は `tdd` で実装しやすい。

### 高自律な最適化を走らせる

```text
grill-with-docs / to-prd で目的を固める → autoresearch-create
```

`autoresearch-create` は通常の実装 skill ではなく、高自律な反復実験ループ用です。数値指標、benchmark command、対象ファイル、禁止事項が明確なときに使います。単発の実装、仕様が曖昧な product decision、人間の判断が主な作業には向きません。

## Skill 一覧

### 日常的に使う開発 workflow skill

#### grill-with-docs

- 詳細: [`mekann/skills/grill-with-docs/SKILL.md`](../mekann/skills/grill-with-docs/SKILL.md)
- できること: 計画を徹底的に質問し、設計ツリーの枝を一つずつ解決する。既存の `CONTEXT.md` と ADR に照らして、用語のズレや設計上の矛盾を表面化する。
- 使うタイミング: 実装前に共通理解を作りたいとき。計画がまだ曖昧なとき。用語、境界、責任分担を詰めたいとき。
- 入力: 計画、メモ、仕様案、実装アイデア。
- 出力: 解像度の上がった設計、確定した用語、必要に応じた `CONTEXT.md` 更新や ADR 提案。
- 次に使う skill: `prototype`, `to-prd`, `to-issues`, `tdd`。
- 重要な注意: 質問は一問ずつ進む。コードベースで答えられることはユーザーに聞かず調査する。
- 呼び出し例:
  - 「この設計案を grill-with-docs で徹底的に詰めて」
  - 「実装前に見落としがないか質問して」
  - 「この計画を既存の `CONTEXT.md` と ADR に照らして確認して」

#### prototype

- 詳細: [`mekann/skills/prototype/SKILL.md`](../mekann/skills/prototype/SKILL.md)
- できること: production に入れる前に、throwaway prototype で UI、状態機械、データモデル、business logic を試す。
- 使うタイミング: 紙の設計だけでは判断しづらいとき。UI variation を比較したいとき。状態遷移やロジックの手触りを確認したいとき。
- 入力: 確かめたい問い、関連コード、UI やロジックの方向性。
- 出力: 1コマンドで動く試作品、または複数 UI variation。最終的に残すべき学び。
- 次に使う skill: `grill-with-docs`, `to-prd`, `to-issues`。
- 重要な注意: prototype は最初から捨てる前提で作る。完了後は削除するか、本実装に吸収する。
- 呼び出し例:
  - 「この state machine を触って確認できる prototype を作って」
  - 「UI 案を3パターン prototype して比較したい」
  - 「このデータモデルが自然か、throwaway prototype で試して」

#### to-prd

- 詳細: [`mekann/skills/to-prd/SKILL.md`](../mekann/skills/to-prd/SKILL.md)
- できること: 会話とコードベース理解から PRD を作り、issue tracker に公開する。
- 使うタイミング: 目的地を文書化したいとき。複数 issue に分解する前に、問題、解決策、user story、testing decision をまとめたいとき。
- 入力: 既に詰めた会話、設計判断、必要なら prototype の学び。
- 出力: PRD issue。Problem Statement、Solution、User Stories、Implementation Decisions、Testing Decisions など。
- 次に使う skill: `to-issues`, `triage`。
- 重要な注意: この skill は追加インタビューではなく、既にある文脈を統合する。まだ曖昧なら先に `grill-with-docs` を使う。
- 呼び出し例:
  - 「ここまでの会話から PRD を作って」
  - 「この設計を GitHub issue の PRD にして」
  - 「prototype の学びも含めて PRD 化して」

#### to-issues

- 詳細: [`mekann/skills/to-issues/SKILL.md`](../mekann/skills/to-issues/SKILL.md)
- できること: PRD、計画、仕様を、agent が個別に掴める tracer bullet 型の issue に分解する。
- 使うタイミング: 大きな目的地はあるが、実装単位がまだ粗いとき。並列作業や依存関係整理が必要なとき。
- 入力: PRD、計画、既存 issue、仕様メモ。
- 出力: dependency を持つ vertical slice issue 群。
- 次に使う skill: `triage`, `tdd`。
- 重要な注意: schema/API/UI/tests のような水平分割ではなく、end-to-end に検証できる薄い vertical slice にする。
- 呼び出し例:
  - 「この PRD を実装 issue に分解して」
  - 「tracer bullet の vertical slice で ticket 化して」
  - 「この計画を agent-ready な issue 群にして」

#### tdd

- 詳細: [`mekann/skills/tdd/SKILL.md`](../mekann/skills/tdd/SKILL.md)
- できること: red-green-refactor のループで、外部挙動を確認するテストを書きながら実装する。
- 使うタイミング: issue を実装するとき。bug fix に regression test を追加するとき。public interface を守りながら変更したいとき。
- 入力: 実装する issue、期待される挙動、重要な interface decision。
- 出力: 振る舞いを検証するテストと、それを通す実装。
- 次に使う skill: `diagnose`, `improve-codebase-architecture`。
- 重要な注意: すべてのテストを先に書く horizontal slice は避ける。1テスト→最小実装→次のテスト、という vertical loop で進める。
- 呼び出し例:
  - 「この issue を TDD で実装して」
  - 「red-green-refactor で進めて」
  - 「まず外部挙動のテストを書いてから修正して」

#### delegated-tdd

- 詳細: [`mekann/skills/delegated-tdd/SKILL.md`](../mekann/skills/delegated-tdd/SKILL.md)
- できること: 現在の親モデルが問題把握・設計・spec patch・レビューを担当し、設定済み implementation model に implementation patch proposal の反復を委譲する。
- 使うタイミング: TDD の実装反復コストを抑えたいとき。機能追加、bug fix、複数ファイル変更など、テスト駆動の反復が見込まれるとき。
- 入力: 実装する issue、期待される挙動、`delegatedTdd.implementationModel` 設定、cheap checks / acceptance checks の候補。
- 出力: spec patch、implementation patch、checks 結果、親モデルによる最終レビュー。
- 次に使う skill: `tdd`, `diagnose`。
- 重要な注意: implementation model はテストを編集しない。`delegatedTdd.implementationModel` が未設定なら fail-closed し、親モデルを暗黙継承しない。
- 呼び出し例:
  - 「この issue を delegated-tdd で実装して」
  - 「gpt-5.5 で設計とレビュー、glm で実装反復する形で TDD して」
  - 「コストを抑えるため実装だけ subagent に委譲して」

#### diagnose

- 詳細: [`mekann/skills/diagnose/SKILL.md`](../mekann/skills/diagnose/SKILL.md)
- できること: hard bug や performance regression を、再現ループ、最小化、仮説、計測、修正、regression test の順に診断する。
- 使うタイミング: 「壊れている」「遅くなった」「再現しづらい」「原因が分からない」問題に直面したとき。
- 入力: bug report、再現手順、ログ、症状、期待値。
- 出力: 再現可能な feedback loop、原因仮説、計測結果、修正、regression test または test seam 不足の報告。
- 次に使う skill: `tdd`, `improve-codebase-architecture`。
- 重要な注意: まず feedback loop を作る。再現できないまま雰囲気で修正しない。
- 呼び出し例:
  - 「このバグを diagnose して」
  - 「この performance regression の原因を調べて」
  - 「再現ループを作ってから修正して」

#### improve-codebase-architecture

- 詳細: [`mekann/skills/improve-codebase-architecture/SKILL.md`](../mekann/skills/improve-codebase-architecture/SKILL.md)
- できること: shallow module、弱い seam、密結合、テストしづらさを見つけ、deep module 化の候補を提示する。
- 使うタイミング: コードベースをより testable / AI-navigable にしたいとき。リファクタリング候補を探したいとき。TDD が難しい構造に当たったとき。
- 入力: コードベース、気になっている領域、既存の domain glossary と ADR。
- 出力: 改善候補の日本語 HTML report、深掘り候補、必要に応じた issue 化の材料。
- 次に使う skill: `grill-with-docs`, `to-issues`, `tdd`。
- 重要な注意: いきなり実装しない。候補を提示し、ユーザーが選んだ候補を深掘りする。
- 呼び出し例:
  - 「このコードベースの architecture 改善候補を探して」
  - 「TDD しづらい場所を deep module 化できるか見て」
  - 「AI が迷いやすい構造を見つけて report にして」

#### zoom-out

- 詳細: [`mekann/skills/zoom-out/SKILL.md`](../mekann/skills/zoom-out/SKILL.md)
- できること: 知らないコード領域について、関係 module、caller、全体像を一段上の抽象度で説明する。
- 使うタイミング: ファイル単位の理解ではなく、周辺構造や役割が知りたいとき。
- 入力: 対象ファイル、module、機能名、issue。
- 出力: 関連 module と caller の地図、domain vocabulary に沿った説明。
- 次に使う skill: 目的に応じて `diagnose`, `tdd`, `grill-with-docs`, `improve-codebase-architecture`。
- 重要な注意: 実装や編集ではなく、理解のための zoom out に使う。
- 呼び出し例:
  - 「この領域を zoom out して説明して」
  - 「この module が全体のどこに位置するか教えて」
  - 「関連 caller と責任を地図にして」

### issue management skill

#### triage

- 詳細: [`mekann/skills/triage/SKILL.md`](../mekann/skills/triage/SKILL.md)
- できること: issue を `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` などの状態に動かし、agent が作業できる brief を整える。
- 使うタイミング: incoming issue を整理したいとき。曖昧な要望を ready 状態にしたいとき。何が agent-ready か確認したいとき。
- 入力: issue 番号、issue 一覧、triage したい条件。
- 出力: 推奨 category/state、必要なら triage notes、agent brief、label 更新。
- 次に使う skill: `grill-with-docs`, `diagnose`, `to-issues`, `tdd`。
- 重要な注意: issue tracker に投稿する triage コメントは AI 生成 disclaimer から始める。label mapping は `docs/agents/triage-labels.md` に従う。
- 呼び出し例:
  - 「triage が必要な issue を見せて」
  - 「#42 を triage して」
  - 「ready-for-agent の issue を確認して」

### 高自律・実験系 skill

#### autoresearch-create

- 詳細: [`mekann/skills/autoresearch-create/SKILL.md`](../mekann/skills/autoresearch-create/SKILL.md)
- できること: 指標と benchmark に基づき、候補を試し、測定し、記録しながら反復最適化する autoresearch loop を開始する。
- 使うタイミング: 数値指標で改善を測れるとき。複数の実験案を反復比較したいとき。benchmark と checks が agent 実行可能なとき。
- 入力: 目的、主指標、方向、benchmark command、対象ファイル、禁止事項、制約。
- 出力: `autoresearch.md`, `autoresearch.sh`, 実験ログ、採用または破棄された実験結果。
- 次に使う skill: 通常はなし。目的が曖昧なら先に `grill-with-docs` や `to-prd` を使う。
- 重要な注意: `/autoresearch on` または `/autoresearch <目的>` で autoresearch mode が有効なときだけ使う。通常の単発実装には使わない。
- 呼び出し例:
  - 「/autoresearch on」後に「この benchmark を最適化して」
  - 「この処理時間を autoresearch で改善して」
  - 「指標を決めて反復実験ループを始めて」

### 初期設定 skill

#### setup-matt-pocock-skills

- 詳細: [`mekann/skills/setup-matt-pocock-skills/SKILL.md`](../mekann/skills/setup-matt-pocock-skills/SKILL.md)
- できること: repo ごとに engineering skills が必要とする `AGENTS.md` と `docs/agents/` を整える。
- 使うタイミング: `to-issues`, `to-prd`, `triage`, `diagnose`, `tdd`, `improve-codebase-architecture`, `zoom-out` を初めて使う repo。issue tracker や domain docs の場所が未設定の repo。
- 入力: issue tracker の種類、triage label mapping、domain docs layout。
- 出力: `AGENTS.md` の `## Agent skills` block、`docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md`。
- 次に使う skill: `triage`, `to-prd`, `to-issues`, `tdd`。
- 重要な注意: 既存の repo 指示を勝手に上書きせず、発見した状態を提示してユーザー確認を挟む。
- 呼び出し例:
  - 「この repo で engineering skills を使えるように setup して」
  - 「setup-matt-pocock-skills を実行して」
  - 「issue tracker と triage labels を agent 向けに設定して」

### maintainer 向け skill

#### mekann-pi-skill-dev

- 詳細: [`mekann/skills/mekann-pi-skill-dev/SKILL.md`](../mekann/skills/mekann-pi-skill-dev/SKILL.md)
- できること: Mekann の Pi 向け skill を開発、更新、導入する。upstream mirror と Pi-maintained copy の責任分担を守る。
- 使うタイミング: `mattpocock/skills` 由来 skill を更新するとき。新しい upstream skill を取り込むとき。Mekann 独自 skill を作るとき。
- 入力: 更新対象 skill、新規導入したい upstream、Pi 向け編集方針。
- 出力: `mekann/skills/` 配下の Pi 向け skill、必要な update script / README / docs 更新。
- 次に使う skill: 変更内容に応じて docs 更新、検証。
- 重要な注意: `vendor/<upstream-name>` は mirror として直接編集しない。Pi が読むのは `mekann/skills` 側だけ。
- 呼び出し例:
  - 「新しい upstream skill を Mekann に取り込んで」
  - 「mattpocock/skills 由来 skill を更新して」
  - 「この skill を Pi 向けに修正して」

## 組み合わせの考え方

### `grill-with-docs` は設計前の圧力テスト

曖昧なまま `to-prd` や `to-issues` に進むと、PRD や issue に曖昧さが固定されます。用語、境界、責任分担、例外シナリオがまだ揺れているなら、先に `grill-with-docs` を使います。

### `prototype` は答えを得るための disposable artifact

prototype の価値は code ではなく学びです。prototype が本実装に見え始めたら危険です。学びを PRD、issue、ADR、または実装方針に移したら、prototype は削除または吸収します。

### `to-prd` は目的地、`to-issues` は道順

PRD は「何を達成するか」を固定します。issue は「どの順序で到達するか」を実装可能な vertical slice にします。大きな開発では両方使うのが基本です。

### `diagnose` と `tdd` は feedback loop を共有する

bug fix では `diagnose` が再現ループを作り、`tdd` がその学びを regression test と実装に落とします。再現できないまま `tdd` に入ると、違う問題をテストする危険があります。

### `improve-codebase-architecture` は TDD の失敗から呼び出すことが多い

良い test seam がない、変更範囲が広がりすぎる、理解に多くのファイル横断が必要、といった兆候は architecture 改善のシグナルです。ただし、bug fix の最中に大規模 refactor を混ぜず、まず問題を閉じてから構造改善を切り出します。

## アンチパターン

- 曖昧な計画をそのまま `to-prd` する。先に `grill-with-docs` で詰める。
- `to-issues` で layer 別の horizontal task を作る。thin vertical slice にする。
- `tdd` で全テストを先に書く。1テストずつ red-green-refactor する。
- 再現ループなしに `diagnose` を進める。まず feedback loop を作る。
- prototype を production code として放置する。削除または吸収する。
- `autoresearch-create` を単発実装に使う。反復測定できる最適化に限定する。
- `mekann-pi-skill-dev` で `vendor/` を直接編集する。Pi 向け編集は `mekann/skills/` 側で行う。

## maintainer 向けメモ

- Skill の一覧を変更したら、この guide と `README.md` の Skills 節を更新する。
- 新規 skill には必ず frontmatter の `name` と `description` を持たせる。
- Pi 向け skill は、Pi の tool 名、sandbox 方針、subagent 方針に合わせる。
- upstream 由来 skill は謝辞を残しつつ、runtime 中に upstream と Pi 向け指示を agent が統合しなくて済むよう、`mekann/skills/` 側だけで完結させる。
- issue tracker、triage labels、domain docs の repo 固有設定は `docs/agents/` を正とする。
