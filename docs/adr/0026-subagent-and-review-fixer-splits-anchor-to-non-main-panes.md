# Subagent and review-fixer kitty splits anchor to non-Main panes

ADR-0021（`/issue` が Main Pi を繰り返し分割しないようにする）の保護範囲を、subagent 機能（`delegate_agent` / `spawn_agent`）と `review_fixer` の kitty split まで拡張する。これらの子 Pi は分割元をフォーカスウィンドウ（`KITTY_WINDOW_ID`）に頼らず、既存の非 Main pane から明示的に選んで `--source-window id:<id>` で分割する。結果として Main Pi は「非 Main pane が1つも存在しない初回」しか分割されなくなり、汎用 subagent は既存 pane に集約し、`review_fixer` の子は親 Issue Pi の隣に開く。

## Status

Accepted

## Context

ADR-0021 / 0024 は `/issue` 起動（`launchPiSessionInKittySplit`）の分割元選択を整備したが、subagent 機能の kitty split は別経路（`KittyController.launchPiSplit` → `KittyControl.launchWindow`）を使っており、`matchCurrentWindow: true`（`--match id:$KITTY_WINDOW_ID`）に依存していた。これには2つの問題があった。

1. **`review_fixer` の子が親 Issue Pi の隣に開かない**: `review_fixer` は Issue Work Pi 内で動くが、子 Pi の分割元が `KITTY_WINDOW_ID`（=起動元のフォーカスウィンドウ）一本だった。環境によってはフォーカスが親 Issue Pi を指しておらず、結果として「フォーカスのあたっている箇所」から分割される観察につながっていた。ADR-0018 は「Kitty split で表示」を決めたが、分割元 pane の選択までは規定していなかった。
2. **汎用 subagent が Main Pi を侵食しうる**: Main Pi から `delegate_agent` / `spawn_agent` を呼ぶと、非 Main pane が既にあっても `KITTY_WINDOW_ID`（= Main Pi）から分割され、Main Pi が半減する。ADR-0021 の「Main Pi は最初の1回だけ」という保護が subagent 経由の split には及んでいなかった。

ユーザー要件は「Main Pi が小さくならないようにする」ことで、加えて「`delegate_agent` / `spawn_agent` はまとまるのが理想」「`review_fixer` は Issue Pi の長い方で分割」が望ましいと示された。

## Decisions

- **分割元は非 Main pane から選ぶ（汎用 subagent）**: `delegate_agent` / `spawn_agent` の kitty split は、Issue Pi pane と subagent pane を合わせた「非 Main pane」の中で最大面積（`columns × lines`）のものを分割元にする。候補が1つも存在しない初回のみ、Main Pi（フォーカスウィンドウ）を分割する（ADR-0021 の「最初の1回だけ」と同じ）。
- **`review_fixer` は自分の Issue Pi pane を分割元にする**: 子 Pi は親となる Work Pi pane を per-issue（env 子マーカー `MEKANN_AUTOPILOT_CHILD` / `MEKANN_ORCHESTRATION_CHILD`、なければ `Issue #N` タイトル）で特定し、そこから分割する。最大面積の汎用候補を使うと、subagent pane が Issue Pi より大きい時に子が Issue Pi ではなく subagent pane から出てしまうため、review-fixer だけは per-issue で明示指定する。
- **分割方向は ADR-0024 の床付き longer side**: 両経路とも `chooseIssuePaneSplit` と同じ `decideSplitLocation`（`MIN_WIDTH` / `MIN_HEIGHT` の事後サイズ床）を再利用する。通常ケースでは長辺方向と同じ結果になり、極端な細分化時だけ床で守り、床を満たせない時は長辺にフォールバックする。「長い方で分割」という要件と最小サイズ保護を両立する。
- **`--source-window id:<id>` で明示指定、`KITTY_WINDOW_ID` 依存を廃止**: `KittyLaunchOptions` に `sourceWindowId` を追加し、anchor が解決できれば `--source-window id:<id>` を発行する（`--match` より優先）。anchor が解決できなかった初回・`kitten @ ls` 失敗時のみ `KITTY_WINDOW_ID`（`--match`）にフォールバックする。
- **subagent pane 識別は `PI_SUBAGENT_ID` を `--env` で設定**: subagent pane を `kitty @ ls` の `env` フィールドで確実に識別するため、`PI_SUBAGENT_ID` を従来の kitty 変数（`--var`、リモコンの `var:` match 式用）に加え `--env` でも設定する。`--var` は kitty 変数で `env` フィールドへの出力が保証されないため、識別信号は `--env` に一本化する。
- **anchor ポリシーは内部フィールド**: `SpawnParams.anchorPolicy`（`{ kind: "nonMain" }` 既定 / `{ kind: "issue"; issueNumber }`）は内部用で、subagent tool の公開スキーマ（`schemas.ts`）には含めない。`review_fixer` が `resolveIssueContext()` で得た issue 番号をプログラム的に設定し、汎用 subagent は既定（`nonMain`）を使う。

## Considered Options

- **汎用 subagent 全体を一律に Issue pane アンカー化（C 案）**: Main Pi から subagent を呼んで「自分の隣に split して見る」正当ユースを壊すため却下。採用案は「最大面積の非 Main pane（subagent pane 含む）」なので、Main Pi 起点でも既存 pane に集約され、Main Pi を侵食しない。
- **`review_fixer` 経路のみ修正（A 案相当）**: 汎用 subagent の Main Pi 侵食が残り、ユーザー要件「Main Pi が小さくならない」を完全に満たさないため却下。
- **subagent pane を候補に入れず Issue Pi pane のみ**: subagent が Issue Pi pane を繰り返し分割して細かくするため、subagent pane も候補に入れて集約する採用案を採用。
- **`KITTY_WINDOW_ID` の信頼性に依存し続ける**: 実環境でフォーカスがずれた時に Main Pi が侵食されるため、`--source-window` 明示指定を採用。
- **初回に別 OS window を開く（Main Pi 完全不変）**: 「まとまる」という要件から外れ、subagent が別窓に離れるため却下。ADR-0021 と同じ「最初の1回だけ Main Pi を分割」を許容する。

## Consequences

- Main Pi は、subagent / review-fixer 起点の split を含め、非 Main pane が1つもない初回しか分割されない。ADR-0021 の保護範囲が subagent / review-fixer 領域に拡張される。
- 汎用 subagent は既存の非 Main pane（他の subagent pane または Issue Pi pane）に集約して開かれ、Main Pi は安定する。
- `review_fixer` の子 Pi は親 Issue Pi pane の隣（長辺方向、最小サイズ床付き）に開かれる。
- anchor 解決のため、subagent / review-fixer の起動ごとに `kitten @ ls` リモコン呼び出しが1回増える（目安 50-200ms 程度）。
- `PI_SUBAGENT_ID` を `--var`（match 用）と `--env`（識別用）の両方で設定する。用途が異なるため冗長だが安全。
- `splitDirection`（`LaunchPiWindowParams`）は非推奨（deprecated）となった。anchor が解決した場合は anchor の方向が優先され、解決しなかった場合のみ後方互換で使われる。
- 本 ADR は ADR-0021 を置き換えず拡張する。ADR-0024 の `decideSplitLocation` / `chooseIssuePaneSplit` を再利用し、新たに `chooseNonMainPaneSplit` / `chooseIssuePaneSplitForIssue` を加える。
