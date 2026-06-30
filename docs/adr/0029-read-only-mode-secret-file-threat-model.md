# Read-only モードにおける workspace 秘密ファイルの脅威モデル

Issue #163 (IC-167)。read-only モードが workspace 内の秘密ファイル(`.env` / `.aws/` / `.pi/mekann.json` 等)の読み取りを許してしまう挙動について、脅威モデルと対応方針を固定する。本 ADR は判断のみを固定し、UX 層での破壊的変更は行わず、実エンフォースメントは sandbox SBPL 層へ移譲する。

## Status

Accepted

## Context

`safety/policy-core/modes.ts` の `classifyCommandIntent` は read-only モード向けの **UX ガード** であり、セキュリティ境界ではない。実際の読み書き制限は sandbox 拡張の OS-level policy (Seatbelt/SBPL) が担う構造になっている(モジュール冒頭のコメントおよび `safety/modes/index.ts` の tool_call hook 参照)。

IC-167 が指摘する懸念は以下の通り。

- SAFE_PATTERNS はコマンド種別(`cat`/`grep`/`find`/...`)で許可判定を行い、**パスベースの秘密ファイル拒否を持たない**。そのため `cat .env` のような読み取りが read-only モードで許可される。
- sandbox は isolated HOME / env で強力に緩和されているが、**repo 配下の秘密ファイルは readableRoots に含まれるため読み取り可能**。重要度は 🔴→🟠 に下方修正されている(実際の漏出経路が限定されるため)。
- `classifyCommandIntent` にパスベースの拒否を追加すると `safety/modes/property.test.ts` の不変条件(Invariant 1: 既知の safe prefix + benign arg は常に safe)と衝突する。`.env` は同テストの benign arg フィルタを通過するため、拒否リストを追加すれば該当テストが破壊される。これは「機械的修正」ではなく「read-only UX セマンティクスの意図的変更」であり、プロダクト判断を要する。

## Decisions

### 脅威モデルを明文化し、UX 層での秘密ファイル拒否は導入しない

- `classifyCommandIntent` は引き続き **コマンド種別のみ** で判定し、パスベースの秘密ファイル拒否は行わない。read-only モードは調査(workflow investigation)のための姿勢であり、`.env` の読み取りも一般的な正当ユースケースである。UX 層でこれを握り潰すと、境界でもない層でユーザ体験を損ねる。
- `modes.ts` のパターン定義部に、この脅威モデルと「実エンフォースメントは sandbox 層」である旨のコメントを明示した(本 ADR を参照)。

### 実エンフォースメントは sandbox SBPL 層 (#137) へ移譲

- repo 配下秘密ファイルの読み取り制御は、UX ヒューリスティックではなく **セキュリティ境界である sandbox SBPL** で行うべきである。これは issue #137 (sandbox: SBPL injection + realpath symlink 脱出) のスコープと重なるため、#163 では実装せず #137 で取り扱う。
- #163 が対象とする「token/secret マスキング・SSRF・不完全エスケープ(redactSecrets 補強)」は、出力経路の秘匿(masking)であり、read-only モードの入力(読み取りアクセス制御)とは別問題である。本 ADR は両者を切り分けて明文化する。

### 補助的な出力マスキングは本 issue で強化済み

- 入力側のアクセス制御を sandbox に委ねる一方で、出力側の秘匿は本 issue で強化した(`codex-shared` / `codex-web-search` / `dashboard` のエラーボディを `redactSecrets` でマスク、IC-225/218/243)。これにより、たとえ秘密ファイルが読み取られても、実行結果やエラーメッセージ経由での token/accountId/Bearer 漏洩は防がれる。

## Consequences

- read-only モードで引き続き `cat .env` 等が可能(UX 変更なし)。property test の不変条件は維持される。
- repo 配下秘密ファイルの読み取り保護は #137 の sandbox SBPL 強化に依存する。#137 がマージされるまで、read-only モードでの repo 秘密の読み取り可能性は残る(重要度 🟠)。
- 出力経路の秘匿は本 issue で強化されたため、漏洩リスクは「読み取った内容がログ/UI に出る」経路に限定され、token/accountId の構造的マスクで大幅に緩和される。
