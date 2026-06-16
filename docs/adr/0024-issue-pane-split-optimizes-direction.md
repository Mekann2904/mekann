# Issue pane split chooses the largest-area pane and optimizes direction

`/issue` で Issue Pi ペインを連続展開したとき、分割元が常に「最も広い（columns 最大）ペイン」で、かつ分割方向が常に左右（`vsplit`）に固定されていたため、右側に細い縦列が量産され、4枚程度で視認性が崩れていた。これを改善するため、分割元を選ぶ基準を **面積最大（columns × lines）** に切り替え、さらに分割元ペインの `width` / `height` に基づいて左右（`vsplit`）と上下（`hsplit`）を切り替える。結果として連続展開は概ね 2×2 に近い読みやすい配置に収束する。Extends ADR-0021.

## Status

Accepted

## Context

ADR-0021 は「Main Pi を安定させる」ために、2回目以降の `/issue` で分割元を既存の Issue Pi ペイン（columns 最大 = maximin）に切り替える決定をした。しかし分割方向は `launchPiSessionInKittySplit`（`utils/terminal/pi-session.ts`）で `--location vsplit` に固定されていた。そのため、どれだけ Issue ペインが細長くなっても常に左右分割が行われ、スペースキーで連続展開すると右側に細い縦列が積み重なるだけで 2×2 のような自然な配置にならなかった。

kitty の `vsplit` / `hsplit` はソースペインのセルを二分割するだけ（検証済み・ADR-0021 と同じ制約）で、レイアウト全体を自動で再配分しない。よって「どのペインを、どの方向に分割するか」を Mekann 側で決めない限り、細分化は避けられない。ADR-0021 のアンカー選択ポリシーは Main Pi 安定化という目的は達成していたが、Issue 側の視認性という第2の目的は放置されていた。

issue #102 はこの第2の目的を「既存レイアウトツリーに対して安全に導入できる最大ペイン分割方式」で解決することを求めている。全体を毎回グリッド再配置する方式はスコープ外（issue の非スコープに明記）。

## Decisions

- **分割元は「面積最大（columns × lines）」の Issue Pi ペインを選ぶ**: columns-only の maximin（ADR-0021）を面積へ一般化する。最も部屋のあるペインを半分にするのが最も安全。`pickLargestIssuePiPane`（`utils/terminal/kitty/control.ts`）がこの選択を担う。
- **分割方向は分割元ペインの `width` / `height` から決める**: 新設の純粋関数 `decideSplitLocation(width, height)` が次の優先順位で `vsplit` / `hsplit` を返す。
  1. `width/2 >= MIN_WIDTH` かつ `width > height * RATIO` → `vsplit`（左右）
  2. `height/2 >= MIN_HEIGHT` → `hsplit`（上下）
  3. `width/2 >= MIN_WIDTH` → `vsplit`
  4. いずれも満たさない → `undefined`（このペインは最小寸法内では分割不可）
- **分割後の最小寸法を下回る方向は選ばない**: `MIN_WIDTH=40`・`MIN_HEIGHT=15` を下回る半分寸法になる方向は候補から外れるため、細い縦列や薄い横帯が量産されない。
- **退化ケースでは Main Pi 保護を優先する（`chooseIssuePaneSplit` のポリシー）**: 既存ペインがすべて両フロアを下回る（200×50 端末で4枚開いて各ペイン 50×25 になる等、5枚目以降で頻発）場合、最小寸法内で分割できるペインが一つもなくなる。この場合 `decideSplitLocation` は `undefined` を返すが、`chooseIssuePaneSplit` は最大面積ペインを **長辺方向で分割** してアンカーし続ける。「アンカー無し」として caller にフォールバックさせると、N回目の `/issue` で caller がフォーカスウィンドウ（= Main Pi）を再分割し ADR-0021 が崩壊するためである。Main Pi 保護はこの inherently unsatisfiable なケースでフロアより優先される。
- **初期値は `MIN_WIDTH=40`・`MIN_HEIGHT=15`・`RATIO=1.3`**: issue が提示した候補範囲（RATIO 1.2〜1.5）の中央寄り。`MIN_WIDTH=40` は Issue リスト UI（`computeIssueLayout`）が依存カラムを表示し始める概ね 38〜50 カラム帯に合わせ、薄くなりすぎる前に上下分割へ切り替える。これらはエクスポート済み定数なので将来の調整が一处で済む。
- **`vsplit` = 左右、`hsplit` = 上下**: kitty の（直感と反する）命名仕様に従う。issue 本文の `vertical`（=左右）は kitty の `vsplit` に対応する。
- **`chooseIssuePaneSplit` が選択＋方向決定を統合し、`KittyControl.findIssuePaneSplitAnchor` 経由で `launchPiSessionInKittySplit` が使う**: 取得した `{ windowId, location }` を `--source-window id:<id>` と `--location <location>` に渡す。anchor が無い初回（or lookup 失敗）は従来通り `vsplit` でフォーカスウィンドウを分割し、ADR-0017 の初回挙動を保持する。
- **ADR-0021 の columns-only 選択プリミティブ（`pickWidestIssuePiPane` / `findIssuePiAnchorWindowId`）は温存する**: 本 ADR は起動パスが使う選択器を面積ベースに切り替えるが、columns-only のプリミティブ自体は下位クエリとして残し、既存テストと ADR-0021 の記述を破壊しない。両者の差異は本 ADR が説明する。

## Considered Options

- **毎回グリッドとして全体を再配置する方式**: 最適な配置を作れるが、`kitten @ resize-window` の収束ループや N 個全体のレイアウト計算を伴い複雑。issue が明示的に非スコープとしているため却下（将来拡張の余地は残す）。
- **分割方向のみを変え、選択は columns-only のまま**: columns 最大ペインが常に最適な分割元とは限らない（例: 広いが極端に背の低いペイン）。面積の方が「どこなら半分に余裕があるか」をより直接表すため、面積を採用。
- **`MIN_WIDTH` / `MIN_HEIGHT` を設定ファイル化する**: 今回は固定定数で十分であり、过早な設定化は避ける。エクスポート定数なので必要時にのみ設定化へ移行できる。
- **初回分割（anchor 無し）も方向最適化する**: Main Pi は通常十分に広く、左右配置（Issue Pi を Main Pi の隣に置く）が ADR-0017 の意図。初回挙動の変更はスコープ外のため、初回は `vsplit` 固定を維持。

## Consequences

- Issue Pi ペインをスペースキーで4つ連続展開したとき、典型的な広いターミナルでは 2×2 に近い配置（各ペインが概ね `width/2 × height/2`）に収束し、細い縦列が量産されない。acceptance criterion（4 pane で概ね 2×2）を満たす。
- 同じペインが2回連続で選ばれることは、面積が最大である限り起こり得る（maximin の性質）。これにより分割が最大ペインに集約され、極端に小さいペインの発生を遅らせる。ADR-0021 の「細分化を分散させる」意図は、面積ベースでも「最も分割に余裕のあるペインを選ぶ」形で引き継がれる。
- 分割方向が履歴に依存しないため、ユーザーが手動でペインサイズを変えても次回 `/issue` 時の方向決定は現在寸法から再計算される（手動調整の永続化は非スコープのまま）。
- ADR-0021 の Erratum（`--source-window id:<id>`）は本 ADR でも有効。本 ADR は同じフラグに加えて `--location` を動的にするだけで、起動処理の追加コストは `kitten @ ls` 1回のまま（ADR-0021 と同等）。
- `MIN_WIDTH=40` はやや高めであり、120カラム程度の狭いターミナルでは2枚目から早期に上下分割へ回る。これは「細い縦列を避ける」という本 issue の意図に沿う挙動だが、広いターミナルほど多くのペインが左右に並ぶ傾向になる。
- 5枚目以降のように既存ペインがすべて両フロアを下回ると、退化モード（長辺方向の強制分割）に入り、最小寸法を下回るペインが発生し得る。これは避けられないトレードオフであり、ADR-0021 の Main Pi 保護を優先した結果である。`decideSplitLocation` 単体は「最小内で分割可能か」の純粋判定として `undefined` を返し、ポリシーレイヤ（`chooseIssuePaneSplit`）だけが退化する設計になっている。
