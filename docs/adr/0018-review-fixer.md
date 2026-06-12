# Review fixer: synchronous issue-scoped review-and-fix tool

Issue worktree 上の PR 前品質ゲートとして、`thermo-nuclear-code-quality-review` に基づく review + edit を clean context の child Pi に同期的に行わせる `review_fixer` tool を `autonomy/review-fixer/` に新設する。child Pi は親と同じ branch / workspace を直接編集し、完了後に structured JSON を返す。PR 作成は行わず、既存 `/issue` workflow に委ねる。

## Status

Accepted

## Context

汎用 subagent は自由度が高くコストを浪費するため、役割を限定した代替が必要だった。既存の `thermo-nuclear-code-quality-review` skill を自動実行し、PR 前に実装品質を最善化する用途に絞ることで、単一の明確な目的にコストを投下できる。

## Decisions

- **同一 workspace 直接編集**: 一時 worktree ではなく親と同じ branch / workspace を編集する。`thermo-nuclear-code-quality-review` が current diff を review 対象とするため、worktree 分離すると前提が崩れる。
- **完全同期**: 親 Pi は child Pi 終了まで機械的に停止する。同一 workspace の同時編集を防ぐため、async や排他 lock ではなく素朴な同期待ちを選ぶ。
- **Issue context 必須**: 対応 GitHub issue を Issue worktree の branch / directory 規約から機械的に導出する。取得失敗や dependency block 時は実行しない。
- **subagent 下層を利用**: child Pi 起動・IPC・lifecycle は既存 subagent infrastructure を使う。tool surface は review + edit に必要な最小限に限定し、`delegate_agent` / `spawn_agent` 等の汎用 subagent tool は公開しない。subagent feature は default off のまま。
- **役割限定**: tool 引数なし、model / effort は settings、scope は current branch changes、skill は `thermo-nuclear-code-quality-review` に固定。汎用 subagent の「自由度が高い」という問題を、tool 設計で排除する。
- **PR 作成はしない**: Review fixer は workspace を最善化して結果を返すまで。commit / push / PR 作成は既存 `/issue` workflow が行う。
- **Kitty split で表示**: 同期処理中にユーザが child Pi の作業を見られるようにする。

## Considered Options

- **一時 worktree で編集**: current diff への fidelity が下がり、skill の前提が崩れるため却下。
- **非同期 + 排他 lock**: 同一 workspace の排他制御が複雑で、同期の方が安全かつ単純。
- **独立した child Pi 起動（subagent 非利用）**: IPC / lifecycle / display の重複実装コストが大きい。
- **Patch proposal のみ（直接編集しない）**: 同一 workspace 前提の設計で patch-only は中途半端。直接編入の UX を優先。
- **汎用 subagent のまま prompt で制御**: 役割限定の目的に反する。

## Consequences

- Review fixer は Issue worktree 以外では動かない。汎用 review tool ではない。
- 同期処理のため、child Pi が長時間動くと親 Pi も長時間停止する。verification 反復上限で抑止する。
- subagent が default off でも、Review fixer 有効時は subagent 下層が動く必要がある。有効判定の実装で考慮が必要。
