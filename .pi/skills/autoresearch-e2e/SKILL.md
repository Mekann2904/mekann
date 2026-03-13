---
name: autoresearch-e2e
description: karpathy/autoresearch の反復改善ループを mekann 向けに抽象化した skill。agent がユーザーに止められるまで e2e 改善を自律反復し、1実験1焦点、5分目安、10分打ち切り、改善時 commit、退行時 reset を守りながら mekann を最適化するときに使う。
---

# Autoresearch E2E

`mekann` を overnight で自動改善するときの skill。

目的は単純です。

`tests/e2e` を中心に、1 実験 1 アイデアで回し、改善だけを積み上げます。

## 使う場面

- ユーザーが「寝ている間に回したい」と言った
- `e2e` を主要な最適化対象にしたい
- commit / reset を含む反復実験を止めずに回したい
- 改善の keep / drop を機械的に判定したい

## Source Of Truth

最初に次を読む。

- `tests/e2e/README.md`
- `tests/e2e/STRATEGY.md`
- `docs/05-meta/08-autonomous-harness-playbook.md`
- `tests/e2e/*.test.ts`

必要なら追加で読む。

- `.pi/skills/workspace-verification/SKILL.md`
- `.pi/skills/bug-hunting/SKILL.md`

## 実験ルール

- 実験は 1 回につき 1 焦点だけ
- 先に最小の quick-and-dirty な変更を入れる
- 実験の主評価は `e2e`
- 1 回の理想時間は約 5 分
- 1 回が 10 分を超えたら kill して `timeout` として扱う
- 単純な低レベルエラーは直して再実行してよい
- 根本的に筋が悪い案は `crash` または `regressed` として捨てる
- 改善時だけ keep する
- 退行時は直近の best commit に戻す
- ユーザーには初期セットアップ後、継続可否を聞かない

## 実行ハーネス

deterministic な部分は次の script を使う。

- `node --import tsx scripts/autoresearch-e2e.ts init --tag <tag>`
- `node --import tsx scripts/autoresearch-e2e.ts baseline --label baseline`
- `node --import tsx scripts/autoresearch-e2e.ts run --label "<idea>"`
- `node --import tsx scripts/autoresearch-e2e.ts status`

`package.json` script があるならそちらを優先してよい。

## 標準ループ

1. `init` で専用 branch を作る
2. baseline を 1 回取る
3. 現在の失敗フローと未実装フローを 1 つだけ選ぶ
4. その 1 点を直す最小変更を入れる
5. 必要なら近い unit/integration test を短く回す
6. `run` で e2e 実験する
7. `improved` ならその commit を土台に次へ進む
8. `equal` `regressed` `crash` `timeout` なら切り捨てる
9. アイデアが尽きたら関連コード、既存失敗、ほぼ成功した案の組み合わせに戻る

## mekann 向けの優先順

優先度は次の順。

1. `tests/e2e` の既存 failing / weak flow
2. `describe is not defined` のような土台破損
3. `plan -> subagent -> verification` の通し経路
4. `workspace verification` と long-running のつながり
5. flaky ではない安定改善

## keep / drop の基準

まず failed test 数を見る。

次に passed test 数を見る。

同点なら total test 数。

さらに同点なら duration。

改善したときだけ commit する。

## 停滞時の扱い

同じ種類の失敗が 2 回続いたら広げず狭める。

- 対象テストを 1 本に絞る
- 変更点を 1 ファイルに寄せる
- 既存の helper / setup の破損を優先する

それでも進まないなら、次のアイデアに移る。

## 出力

各実験の証跡は `.pi/autoresearch/e2e/` に残る。

- `state.json`
- `results.tsv`
- `experiments/<timestamp>-<label>/run.log`
- `experiments/<timestamp>-<label>/vitest-report.json`

朝に見るべきものは 2 つです。

- `results.tsv`
- `status`

## 禁止

- 複数の大きい責務を 1 実験に混ぜる
- 改善していないのに commit する
- 毎回 reset を乱発する
- 10 分超えの実験を放置する
- 初期セットアップ後に「続ける？」と聞く
