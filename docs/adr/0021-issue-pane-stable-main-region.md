# Issue pane management keeps a stable Main Pi region

`/issue` が Kitty split で Issue Pi を開く際、分割元が常にフォーカスウィンドウ（= Main Pi）になっており、2回目以降の `/issue` で Main Pi が繰り返し半減していく問題があった。これを解決するため、Main Pi を分割元として使うのは最初の1回目のみとし、2回目以降は既存の Issue Pi ペインを分割元にする。Issue Pi ペインはウィンドウタイトルのプレフィックス `Issue #<number>` でステートレスに識別し、複数ある場合は最も広いもの（maximin）を分割元に選ぶ。Main Pi の領域は最初の split 比率で安定する。Extends ADR-0017.

## Status

Accepted

## Context

ADR-0017 は `/issue` を「Kitty 2段階 split で Issue Pi を開く」方式に定めた。しかし `launchPiSessionInKittySplit`（`utils/terminal/pi-session.ts`）は `--source-window-id` を渡さず、kitty はアクティブウィンドウを分割するため、ユーザーが Main Pi にフォーカスを戻して再び `/issue` を呼ぶたびに **Main Pi が再分割され、半分 → 4分の1 → 8分の1… と縮んでいく**。

これは ADR-0017 の「2段階 split」設計の意図外の副作用であり、ユーザーにとっての作業画面（Main Pi）が安定しないという UX 上の問題だった。Pi の cwd はセッション固定で変更できないため、Main Pi と Issue Pi は別プロセスの Kitty split で並存する必要があり（ADR-0017 を参照）、Main Pi の領域安定性はその並存モデルの成立条件である。

kitty の `--location vsplit` は `splits` レイアウトでソースウィンドウのセルを二分割するだけで、レイアウト全体を自動で再配分しない（検証済み）。よって「どのペインを分割元にするか」を Mekann 側で制御しない限り、Main Pi の縮小は避けられない。

## Decisions

- **Main Pi を分割元にするのは最初の1回目のみ**: 既存の Issue Pi ペインが1つもない場合（=1回目）のみ、Main Pi（フォーカスウィンドウ）を分割する。これにより Main Pi の領域は最初の split 比率で確定し、以後不変となる。
- **2回目以降は既存の Issue Pi ペインを分割元にする**: `kitten @ ls` で全ウィンドウを取得し、ウィンドウタイトルが `Issue #<number>` に一致するペインを抜き出す。1つでもあれば、その中から分割元を選び `--source-window-id` で指定する。
- **Issue Pi ペインはタイトルプレフィックスでステートレスに識別**: window id の状態ファイルは持たず、毎回 `kitten @ ls` の実際のウィンドウ状態から再計算する。ユーザーがペインを手動で閉じても次回 `/issue` 時に即座に追従する。Pi 本体はターミナルタイトルを上書きしない（`process.title = APP_NAME` は `ps` 表示用で OSC 0/2 タイトル変更ではない）ため、起動時に渡した `Issue #<number>` タイトルは持続する。
- **複数の Issue Pi ペインがある場合は最も広いものを分割元に選ぶ（maximin）**: 細分化を分散させ、単一ペインが極端に狭くなるのを防ぐ。候補ペインのうち `columns` が最大のものを選ぶ。
- **Issue ペインの均等配置（equalization）は本 ADR の対象外**: 「ひとまず Main Pi が小さくならないようにする」ことを最優先とし、Issue 側の幅の均等化（`kitten @ resize-window` による再平準化）は明示的に棚上げする。Issue 側は kitty の二分木仕様で細分化されるが、Main Pi の安定は保たれる。均等化が必要になれば本 ADR のアンカー選択の上に resize ロジックを追加する形で拡張できる。

## Considered Options

- **シングル Issue モデル（同時に1つだけ）**: 状態管理は最もシンプルだが、ユーザーが「レビュー待ちの Issue と新規 Issue を並行」などの運用を望み、並行モデルが要件となったため却下。
- **window id の状態ファイル（ステートフル識別）**: ユーザーがペインを閉じた / Pi が落ちた / kitty 再起動 のたびにゴミが溜まり、結局 `kitten @ ls` で生存確認が必要になり、タイトルプレフィックス識別と同じことを余分なファイル付きでやるだけのため却下。
- **Issue 専用の別タブ**: Main と Issue を並べて見られなくなり、`/issue` の split の存在意義が消えるため却下。
- **Issue ペインの均等配置を最初から含める**: 「Main Pi が小さくならない」ことのみを最優先とする要件に対して過剰であり、均等化は N 回の `kitten @` 呼び出しと収束ループを伴う複雑度増のため棚上げ。
- **最も新しい / 最も古い Issue ペインを分割元にする**: 直近作業のペインが最も狭くなる矛盾、または非決定的な順序依存を生むため、maximin（最も広いもの）を採用。

## Consequences

- Main Pi は最初の `/issue` で一度だけ分割され、以後二度と分割元にならない。Main Pi の領域は最初の split 比率（通常ほぼ半分）で安定する。
- `/issue` の起動処理は `kitten @ ls` でウィンドウ一覧を取得し、Issue Pi ペインを探索する処理を挟むため、1回あたりの起動が僅かに重くなる（目安 50-200ms 程度のリモコン呼び出し1回増）。
- Issue 側のペイン幅は本 ADR では保護しない。同時に3枚以上の Issue Pi を開くと、kitty の二分木仕様により一部のペインが狭くなる。均等化は別途拡張として追加可能。
- Issue Pi ペインのタイトル `Issue #<number>` は識別の契約になる。Pi 本体が将来ターミルタイトルを動的上書きするようになった場合は、本識別方式から window id 状態ファイル方式へ差し替える必要がある（本 ADR の Considered Options 参照）。
- ユーザーが Issue ペインの幅を手動で調整しても、次回 `/issue` 時のアンカー選択（最も広いもの）と kitty の細分化により上書きされうる。手動調整を維持したい場合は別タブ・別 OS window など Mekann 管理外へ出す必要がある。
- ADR-0017 の「2段階 split」は維持される。本 ADR はその2段階目（リスト → Issue Pi）の split 元選択ポリシーを追加するもので、0017 を置き換えない。
