# 設計脆弱性の明確化: スコープ分岐・registerTool patch・entry replay 順序・orchestration ゲート

Issue #173 (IC-189 / IC-197 / IC-216 / IC-246 / IC-247)。スコープ判定の組み合わせ爆発・`pi.registerTool` monkey-patch・goal entry branch の逆順 replay・orchestration の env marker 検出と継続ゲートについて、将来の拡張や pi SDK 変更で壊れやすい設計を安定化する方針を確定する。本 ADR は設計判断のみを固定し、実装は後続 issue に分割する。

## Status

Accepted

## Context

以下5点はいずれも「外部境界(pi SDK セマンティクス・環境変数・GitHub 真値)への暗黙前提」に強依存しており、SDK 変更・軸追加・シェル起動の不備で静かに誤動作する。テスト困難性と組み合わせ爆発が共通の背景。

- **IC-189** `context/context-control/scope.ts:11-23`(`matchesScope`): `mode strict/include-global` × `cwd` 有無 × `sessionId` 有無 × `projectScoped/globalScoped` の多軸分岐。将来軸(`branchId` 等)の追加で組み合わせ爆発し、意図がコードから読めずテストで網羅できない。(※ CONTEXT.md に context-control のスコープ語彙は未定義で、本件で補充を検討する。)
- **IC-197** `context/tool-registration-observer.ts:26-35`: `pi.registerTool` を monkey-patch して tool schema 計測を挟む。`decoratedApis=WeakSet` で重複装飾は防ぐが、(a) 他拡張の `registerTool` 呼び出しも全て計測される、(b) pi SDK が getter/proxy 実装だと patch が壊れる、(c) 複数拡張の patch 競合、のリスクがある。pi に公式 hook がないための workaround。
- **IC-216** `autonomy/goal/goalLifecycle.ts:74-80`: persisted goal entries の replay が `for (let i=branch.length-1; i>=0; i--)` の逆順(leaf→root を前提)。pi の `getBranch()` が返す entry branch の順序に強依存し、SDK 側で順序が変わると誤順序 replay になる。順序不変を保証する仕組みがない。
- **IC-246** `utils/issue/orchestration/extension.ts:29-34`: Work Pi 検出が env marker(`MEKANN_ORCHESTRATION_PARENT` / `MEKANN_ORCHESTRATION_CHILD`)の有無に依存する。marker は `launchPiSessionInKittySplit` で `--env` 明示伝播されるが、シェル wrapper の `export` 忘れ・`set -e` 中断で marker が付かないと「非 orchestration」と誤判定され `continueOrchestration` が発火しない。検出失敗が沈黙する。
- **IC-247** `utils/issue/orchestration/lifecycle.ts:100-144`(`continueOrchestration`): 次起動のゲートが「just-finished child's PR is merged」単一条件。PR closed(非マージ)/draft のまま `ready-for-human` 格下げ時に停止するが、現状は単一の `not-merged` メッセージ("PR is not merged; stopping orchestration of #X. Re-open with /issue X to resume.")しか出力されず、停止サブケース(closed 非 merge / draft / review rejected)の区別や、どのポリシーで止まったかがユーザに伝わらない。またゲート条件も調整不可。

## Decisions

### IC-189: スコープマッチングをルールベース + プロパティテストで安定化

- **ルールベース化**: `matchesScope` を「軸ごとの独立した述語の合成」として再構成する。各軸(`cwd`・`sessionId`・将来の `branchId` 等)を個別の matcher 関数に切り出し、`mode` は各 matcher へのパラメータとして渡す。分岐を各軸内に閉じ込め、軸追加が既存軸のロジックに影響しない構造にする。
- **プロパティテスト**: strict/include-global × 各軸の有無 × project/global scoped の全組み合わせを property-based test で網羅し、意図(「global 観測は include-global かつ当該軸未指定時のみ参加する」等)を matcher 単位で文書化する。なお CONTEXT.md に context-control のスコープ語彙は現状未定義(domain.md の指針では存在しない語彙の发明は避ける)のため、必要に応じて後続 issue から grill-with-docs で語彙補充を提案し、その際に本テストの意図記述と整合させる。
- **現行挙動の保存**: `matchesScope` には現状 **専用の unit test が存在せず**、`context/context-tracker/index.test.ts` 経由での間接網羅(「partially global samples が他軸を bypass しない」等)のみが現行挙動の防衛線。したがって #181 ではリファクタ前に専用のスコープ property/unit test を新設して回帰基準とし、リファクタ後もその新設テストおよび既存の間接テストが同じ入出力を維持することを確認する。

### IC-197: pi SDK へ `onToolRegistered` 公式 hook を要求、移行期は patch を継続

- **pi SDK 要件**: pi SDK に `pi.onToolRegistered((tool) => ...)`(tool 登録後に発火する公式 hook)を要求する。これにより monkey-patch を廃止し、(a) 他拡張呼び出しの意図せぬ計測、(b) getter/proxy 実装での破壊、(c) 複数拡張の patch 競合、をすべて解消する。
- **移行期の patch 継続**: hook 提供まで `observeToolRegistrations` の monkey-patch は継続するが、副作用を明示化する。(1) patch 適用後の `registerTool` が他拡張由来の呼び出しも計測することを doc comment で明記(現状は「intentionally observes every Mekann tool」とあるが、他拡張の tool も含む旨を補強)、(2) patch が既存関数を上書きしたことの検出可能な回帰テストを追加する。
- **hook 提供後の移行**: hook が利用可能になったら `observeToolRegistrations` を `pi.onToolRegistered` ベースに切り替え、`decoratedApis` WeakSet を廃止する。monkey-patch と hook の二重計測を避けるため、hook 利用可能判定後は patch パスを実行しない。

### IC-216: pi SDK へ entry branch 順序保証を要求、Mekann 側は順序依存をプロパティテストで明示

- **pi SDK 要件**: pi SDK の `getBranch()` が返す entry 配列の順序(leaf→root)を型/文書で固定し、順序変更時は破壊的変更として扱うことを要求する。あるいは SDK 側で root→leaf(chronological)を返す取得関数(`getBranchChronological()` 等)の提供を要請する。
- **順序不変のテスト**: Mekann 側で replay 関数を「順序に依存しない」形にできるか検討する。goal state の replay が entry の順序に依存しない(各 entry の絶対順序を示すメタデータがあれば順不同で復元できる)なら、順序前提を除去できる。依存が不可避な場合は、現行の leaf→root 前提をプロパティテストで明示し、SDK 順序変更時に即座に検知できるようにする。
- **replay 関数の SDK 提供**: replay 関数自体の SDK 提供は、SDK 側の API 設計判断に委ねる(要求は出すが実装形態は SDK 側で決める)。

### IC-246: env marker を起動後に verify し、欠落時は警告

- **hello verify 方針**: env marker の設定を起動後に verify する。子 Pi は起動直後に親(orchestration supervisor)へ marker 存在を報告する hello を送信し、親は期待する marker が届かない場合警告を出す。これにより `--env` 伝播の不備・シェル wrapper の `export` 忘れ・`set -e` 中断を起動後に検出する。
- **沈黙の廃止**: marker 欠落で orchestration 継続が発火しない場合、ユーザに「marker が検出されなかったため orchestration を継続しない」旨を明示する。現状の沈黙した誤判定を可視化する。
- **伝播経路の維持**: `launchPiSessionInKittySplit` の `--env` 明示伝播は維持する。hello verify は defense-in-depth であり、伝播経路の置き換えではない。

### IC-247: orchestration 停止ゲートを設定可能にし、停止理由を表示

- **ゲート条件の設定可能化**: `continueOrchestration` の停止ゲートを設定可能にする。デフォルトは現行の「PR merged のみ継続」だが、以下のポリシーを選択可能にする:
  - `merged`(デフォルト): PR が merged のみ次を起動。
  - `on-closed-skip`: PR が closed(非マージ含む)なら停止、それ以外(未クローズ/draft)は待機。
  - `on-draft-wait`: draft のままなら待機(merged でなくても closed でなければ継続候補)。
- **停止理由の表示**: 各停止ケース(`not-merged` / draft 待機 / closed skip)で、ユーザに停止理由と再開方法(`/issue <parent>` で resume)を明示する。現行の `not-merged` メッセージを拡張し、どのポリシーで止まったかを含める。
- **ゲート判定の純粋性維持**: `continueOrchestration` は純粋関数としての性質(I/O は注入された `launchWorkPi` のみ)を維持する。設定値は引数/設定経由で注入し、テスト可能性を損なわない。

## Considered Options

### IC-189
- **現状維持**: 将来軸追加で組み合わせ爆発・テスト困難が悪化するため却下。
- **プロパティテストのみ**: 意図網羅はできるが、コードの分岐構造自体は複雑なままで可読性が改善しないため、ルールベース化と併用する。

### IC-197
- **patch 即時廃止**: 公式 hook がない状態で廃止すると tool schema 計測が消失するため却下。移行期の継続が必要。
- **pi 内部 API の直接参照**: `as any` で内部構造に触れるのは #141 と同じ SDK 内部 API 依存リスクで却下。公式 hook 要求が正解。

### IC-216
- **順序前提の完全除去**: entry に絶対順序メタデータがなければ不可。可能なら採用、不可ならプロパティテスト明示にフォールバック(両方を決定に含めた)。
- **replay 関数の Mekann 側独自安定化**: SDK 順序に依存する限り本質解決にならず、SDK 保証要求が先決。

### IC-246
- **marker 伝播経路の増強のみ**: `--env` 明示伝播は既に行われており、それでも wrapper 不備で落ちるケースがあるため、起動後 verify が必須。
- **marker 廃止・別の識別子へ移行**: 既存の orchestration 全体の書き換えになり過大のため却下。hello verify で検出精度を上げる。

### IC-247
- **ゲート固定(現状維持)**: ユーザ調整不可で運用に困るため却下。
- **全ゲート廃止・常に継続**: 承認ゲート(案a)の意図(merged が承認の proxy)を損なうため却下。

## Consequences

- **実装は後続 issue に分割**: 本 ADR は設計判断の確定のみ。以下を実装 issue 化した:
  - IC-189: #181 — スコープマッチングのルールベース化 + プロパティテスト(context-control)。
  - IC-197(Mekann 側): #182 — `registerTool` patch の副作用テスト・doc 補強。pi SDK hook 提供後の移行は別途。
  - IC-216(Mekann 側): #183 — goal replay の順序非依存化(可能な場合)/プロパティテスト明示。
  - IC-246 + IC-247: #184 — orchestration lifecycle の env marker hello verify + 設定可能ゲート + 停止理由表示(同一 feature/ファイルのため1 issue に集約)。
- **pi SDK 要件 issue を起票**: #180 で `onToolRegistered` hook(IC-197)と entry branch 順序保証(IC-216)を pi SDK への要件として起票した。これらが提供されるまで、IC-197/IC-216 の Mekann 側は workaround/テスト明示にとどまる(#182/#183)。
- **後続 issue の依存関係**: #182 と #183 の Mekann 側完全解消は pi SDK 要件 issue #180 の解決に依存するが、workaround テスト・doc 補強自体は SDK 提供を待たず実施できる(硬い blocked-by 関係は設定しない)。
- **本 issue(#173)の完了条件**: ADR 承認 + 後続 issue 分割 + pi SDK 要件 issue 起票が完了した時点で、設計判断の確定として #173 をクローズ対象とする。実装の完了は各後続 issue(#180–#184)で判定する。
