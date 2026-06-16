# Issue autopilot: label-gated parallel automation to PR creation

`/issue-autopilot` を新設し、リポジトリ全体の `ready-for-agent` ラベル付き open issue を、並列上限（`issue.autopilot.maxParallel`、デフォルト2）の範囲で自動処理する。各 Work Pi は実装 → review_fixer → PR 作成まで自走したのち自動で close して枠を解放し、マージは人間が行う。手動選択の `/issue`・親指定の `/issue <parent>` と共存する上位自動化であり、supervisor は Main Pi 上の extension（ADR-0022 のポーリングパターン再利用）が担う。行き詰まり（F3）は PR を作らず `ready-for-human` に降格して issue コメントを残し、フリーズ・一時失敗（F1/F2/F4/F5）は自動回復せず人間任せとする。

## Status

Accepted

## Context

既存の `/issue <parent>` orchestration（ADR-0017 / 0019 / 0023）は「PR 作成までの自動化」を直列・merge-gated で実現していたが、対象が「1つの親PRDの子issue群」に限られ、並列起動しなかった。ユーザーから「スラッシュコマンド issue の全体的な自動化。PR を作成するところまで自動化して、終わったら pi を閉じる。並列数を設定でき順次取り掛かる」という要望があり、これは寝ている間に `ready-for-agent` issue をまとめて処理し、起きた後に人間がレビュー・マージするユースケースであった。

いくつかの設計分岐を grilling で解決した:

- **閉じるタイミング**: Work Pi は「PR 作成直後」に自動 close する（マージ後でない）。マージは人間。これにより並列 worker slot が即解放され、レビュー待ち中に次の独立 issue へ取りかめる。
- **並列ゲート**: 依存（`blocked_by`）解決済みの startable のみ並列許可。独立 issue は並列、依存 issue は依存先 PR マージ後に startable に昇格。merge-gate（逐次）は「並列数設定」を無意味にするため却下。
- **supervisor の配置**: Main Pi は常に開かれるという前提から、独立デーモンは導入せず Main Pi 上の extension とする。ADR-0022 の `classifyStatus` + bounded backoff ポーリングを再利用する。
- **対象範囲とゲート**: リポジトリ全体の open issue のうち `ready-for-agent` ラベル付与済みのみ（ホワイトリスト）。`ready-for-agent` は triage / to-prd / to-issues skill が付与する既存の状態ロールであり、autopilot の対象ゲートにすることで既存ワークフローと一本化される。
- **F3（行き詰まり）ハンドリング**: 仕様不明・判断に迷って質問したくなった場合、ユーザーは「意図しない処理の PR はレビュー負荷を上げる」と明確に拒否した。よって仮定で進める（Autonomous assumption 流）のでなく、PR を作らず `ready-for-agent` → `ready-for-human` に降格し、triage ノート風のコメント（AI 生成免責付き）を行き詰まり内容とともに残して停止する。
- **合意形成フェーズ**: `ready-for-human` を通常 `/issue` で開いたとき、別プロンプトではなく Issue Pi 上で人間とエージェントが対話して合意形成する。人間が合意を示したらエージェントが `issue_workflow` の新アクションで `ready-for-human` → `ready-for-agent` に切り替え、同じセッションで実装フェーズへ連続移行する。合意内容は issue コメント（triage ノート風）に追記して永続化し、F3 で戻ったときは前回合意を引き継いだ上で新疑問だけを追加合意する。
- **失敗・フリーズ**: F1（フリーズ・無限ループ）・F2（review_fixer errored）・F4（create_pr 失敗）・F5（クラッシュ）はすべて自動回復なし・人間任せ。フリーズした Work Pi は Kitty ペインが開きっぱなしになるため視覚的に気づき、人間が手動で対応できる。被害は「止まること」だけで他 issue への波及はないため、タイムアウト・再挑戦・status コマンド・footer 統合は導入しない。
- **停止条件**: 「全 `ready-for-agent` が PR 作成済み or `ready-for-human` 化」で自動終了。予算上限・常駐は入れない。
- **既存 orchestration との関係**: `/issue`（手動選択）・`/issue <parent>`（親指定・直列）はそのまま残し共存。autopilot は「人間がスペースで選ぶ手間を省き、ラベルで自動判定し、並列上限の範囲で回す」上位自動化として位置づける。

副次的に既存バグを修正する: 現行 `/issue` は `labels` を取得しても UI バッジ表示にしか使わず、`ensureIssueCanStart` は `blocked_by` 依存関係しかチェックしないため、`ready-for-human` issue を開くとエージェント実装に直行していた。autopilot の label gate を `judgeChild` に拡張適用し、`/issue` 側でも `ready-for-human` を合意形成フェーズへ分岐させることでこの分類の無効化を防ぐ。

## Decisions

- **`/issue-autopilot` コマンドと CLI モード**: Pi extension command `/issue-autopilot`（引数なし＝リポジトリ全体）を登録し、`mekann-issue` CLI に `autopilot` モードを追加する。既存の `launchPiSessionInKittySplit`・worktree 管理・GitHub 真実値取得を再利用する。
- **対象ゲートは `ready-for-agent` ホワイトリスト**: supervisor は `ready-for-agent` ラベル付き open issue のみを候補とする。ラベル0件の場合は GitHub 側にラベル自体が存在するかチェックし、無ければ「`setup-matt-pocock-skills` を実行するか GitHub にラベルを作ってください」と案内して止める（ラベルの自動作成はしない）。
- **並列ゲートは依存のみ**: 現行 `judgeChild`（prMerged / active / blocked / startable）に `ready-for-agent` ラベル条件を AND で加える（label-gated startability）。独立 issue は並列許可、依存 issue は依存先 PR マージ後に startable 昇格。merge-gate（逐次）は採用しない。
- **並列数設定 `issue.autopilot.maxParallel`**: `mekann.json` の issue 設定に追加。デフォルトは 2。
- **Work Pi は PR 作成後に自動 close**: Phase 3（create_pr）完了を Work Pi の終了条件とする。supervisor は Work Pi の終了を検知して枠を解放し、空き枠へ次の startable を起動する。
- **マージは人間**: autopilot・Work Pi はマージしない。PR 作成までを自動化し、レビュー・マージは人間が行う。
- **supervisor は Main Pi 上 extension**: ADR-0022 の `setTimeout(...).unref()` bounded backoff ポーリングを再利用し、GitHub truth を再取得して startable を判定する。独立デーモン・detach プロセスは導入しない（Main Pi は常に開かれる前提）。
- **F3 は PR 作成せず `ready-for-human` 降格**: 行き詰まり時、エージェントは PR を作らず `issue_workflow` の新アクションで `ready-for-agent` → `ready-for-human` に切り替え、triage ノート風（established / 判断を仰ぎたいこと）のコメントを AI 生成免責付きで投稿して停止する。実装途中の worktree は残置し、通常 `/issue` で resume 可能にする。
- **合意形成フェーズ（通常 `/issue` のみ）**: `ready-for-human` を `/issue` で開いたとき、初期メッセージを「issue-<id>に対応するために人間との合意形成を行い、agentが実装できるように落とし込み、ready-for-agent状態にします」で送り、Issue Pi 上で対話する。人間が合意を示したらエージェントが `issue_workflow` で `ready-for-agent` に切り替え、合意内容を issue コメントに追記し、実装フェーズ（`issue-<id>に対応してください` 相当の Phase 1〜3 自走）へ連続移行する。autopilot は `ready-for-agent` ホワイトリストのみ拾うため合意形成は発生しない。
- **`issue_workflow` にラベル切替アクションを追加**: 既存の internal execFile 経路（ADR-0019）で `gh issue edit <n> --add-label/--remove-label` を呼ぶアクション（例: `promote_to_ready_for_agent`）を追加し、worktree 内で auto-approve する。
- **失敗・フリーズは自動回復なし**: タイムアウト・再挑戦・status コマンド・footer 統合・ログ集約は導入しない。フリーズ・失敗した Work Pi はペインが開きっぱなしになり人間が視覚的に気づいて手動対応する。
- **停止条件**: 「全 `ready-for-agent` が PR 作成済み or `ready-for-human` 化」で supervisor が自動終了する。
- **既存機能との共存**: `/issue`（手動選択・インタラクティブ）と `/issue <parent>`（親指定・直列・merge-gated orchestration）は変更せず残す。autopilot は上位自動化として併存する。

## Considered Options

- **独立デーモン（detached process）**: 「寝ている間に回す」を Main Pi 非依存で実現する選択肢。Main Pi が常に開かれる前提で不要と判断。PID 管理・孤児プロセス・認証引継ぎの運用負荷が大きい。
- **Work Pi が自分の PR のマージを待ってから close（案X 拡張）**: supervisor 不要で現行 orchestration を直接拡張できるが、レビュー待ちの間 worker slot とペインが占有され並列の旨みが消えるため却下。
- **merge-gate（逐次）維持**: 並列数を上げても全員が前のマージ待ちになり並列設定が無意味になるため却下。
- **リポジトリ全体ではなく親1つ限定**: 最もシンプルだが「全体的な自動化」の要請を満たさないため却下。
- **複数 issue リスト指定可**: 依存グラフが親を跨ぐときの判定が複雑になり、allowlist/denylist 機構まで必要になるため初版スコープとして却下。
- **ブラックリスト方式（除外ラベル指定）**: ラベル付け忘れの issue が勝手に実装されるリスクがあり、ホワイトリスト（`ready-for-agent` のみ）を安全側として採用。
- **質問禁止・仮定で進める（Autonomous assumption 流）**: ユーザーが「意図しない処理の PR はレビュー負荷を上げ、メリットよりデメリットが大きい」と明確に拒否したため却下。
- **質問で止まったら `needs-info` に戻す**: `needs-info` は reporter 待ちのニュアンスが強く、F3 の「保守者に方向性を求める」とズレる。F3 は「人間の実装・判断が必要」なので `ready-for-human` が定義に一致する。
- **合意内容を agent brief の新規作成/更新で記録**: 元の triage 判断（「人間向けだった理由」）を上書きする危険があるため、issue コメント追記を採用。
- **F3 復帰時ゼロから合意形成**: 同じ議論を反復するため却下。前回合意を引き継ぎ新疑問だけを追加合意する。
- **タイムアウト・再挑戦・status コマンドの導入**: フリーズ・失敗は「止まるだけで他 issue への被害がなく、人間が手で対応できる」ため、自動回復・観測機構は導入せず人間任せとする。
- **`ready-for-human` を警告なしで実装に直行（現状維持）**: triage 分類を無効化するバグのため修正する。

## Consequences

- `/issue-autopilot` で `ready-for-agent` issue を並列上限の範囲で PR 作成まで自動化でき、寝ている間にまとめて処理して起きた後に人間がレビュー・マージできる。
- Work Pi は PR 作成後に自動 close して枠を解放するため、並列数設定が意味を持つ。
- F3 で行き詰まった issue は PR を作らず `ready-for-human` に降格するため、autopilot は二度と拾わない。人間が通常 `/issue` で合意形成フェーズを経て `ready-for-agent` に戻せば次回 resume で拾う。
- フリーズ・失敗した Work Pi は開きっぱなしのペインとして残るため、利用者は定期的にペインを確認する運用が必要になる。
- `issue_workflow` にラベル切替アクションが増える。合意形成フェーズ用の初期メッセージ分岐（`ready-for-human` 用プロンプト）と、実装フェーズ移行のプロンプト指示が新設される。
- `judgeChild` にラベル条件が加わることで、既存の `/issue <parent>` orchestration と `/issue` インタラクティブの両方で `ready-for-human` 等の非対象 issue が実装に直行しなくなる。
- supervisor は Main Pi 上 extension なので、Main Pi を閉じると autopilot も止まる。「Main Pi は常に開かれる」という前提に依存する。
- 設定項目 `issue.autopilot.maxParallel`（デフォルト2）が `mekann.json` に増える。
