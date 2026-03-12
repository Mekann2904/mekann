<!-- /Users/mekann/github/pi-plugin/mekann/plans/bug-hunt-cognigent-implementation.md -->
<!-- このファイルは、CogniGent を参考に bug-hunt を高精度化する実装計画を定義します。 -->
<!-- なぜ存在するか: 単発 prompt 依存の探索を、多段の局所化パイプラインへ置き換える判断と todo を残すためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/.pi/extensions/bug-hunt/runner.ts, /Users/mekann/github/pi-plugin/mekann/.pi/extensions/bug-hunt/reporting.ts, /Users/mekann/github/pi-plugin/mekann/.pi/extensions/search/locagent/query.ts, /Users/mekann/github/pi-plugin/mekann/.pi/extensions/repograph-localization/index.ts -->

# Goal
`bug-hunt` を、単発の推測レポート生成ループから、候補抽出、仮説生成、因果探索、observer 再評価を行う高精度な bug localization ループへ更新する。最終的には、根拠が弱い task を減らし、Web UI の task により信頼できるバグ報告を継続的に追加できる状態を作る。

# User Intent
ユーザは、停止されるまで動き続ける bug-hunt を維持したまま、報告精度を大きく上げたい。論文の CogniGent のように、症状から候補を絞り、依存関係を辿り、根拠を比較した上で task 化してほしい。評価軸は、誤検知の少なさ、根拠の明確さ、重複の少なさ、既存 UI への自然な統合である。

# Analyst Interpretation
今回は「CogniGent をそのまま再現する」より、「既存 repo にある search / locagent / repograph / call-graph を使って、同等の探索構造を組み込む」ことを目標にする。最重要なのは orchestration の追加であり、モデルや prompt の差し替えだけでは不十分である。実装は TypeScript 主導で進め、LLM には候補の要約、仮説生成、局所評価、observer 採点を担当させる。

# Non-goals
- CogniGent 論文の評価セットや MAP/MRR 実験の完全再現
- 本格的な Neo4j 導入や外部 DB 依存の追加
- 初回から完全な SBFL 実装を含めること
- bug-fix 自動生成まで一気に広げること

# Acceptance Criteria
- [ ] bug-hunt が 1-shot prompt ではなく、`retrieve -> hypothesis -> investigate -> observe -> report` の多段フローで動く
- [ ] 候補抽出で既存の `locagent` または `repograph-localization` を使い、top-K 候補を明示的に扱う
- [ ] 仮説ごとの investigation が call-chain または graph neighborhood を辿って evidence を追加できる
- [ ] observer が最終候補を再評価し、低品質レポートを task 化前に弾ける
- [ ] task 化前に evidence の file / line を検証し、重複判定が hash 依存だけでなく意味情報も使う
- [ ] 既存の `bug_hunt_start` / `bug_hunt_status` / `bug_hunt_stop` 体験を壊さない
- [ ] 主要ユニットに対するテストが追加される

# Quality Loop Strategy
- 実行ループ: 最初に最小の orchestrator を入れ、その後に state、observer、validation を順に足す
- 検証ループ: まず unit test、次に extension 単位の起動テスト、最後に lint と型検査を回す
- 継続ループ: live todo を常に更新し、重要判断はこの計画書に追記する
- Stop rule: graph 関連のノイズで同じ失敗を 2 回繰り返したら、探索深さか候補数を下げて再計画する

# Constraints
- 新規依存は原則追加しない
- 既存の task storage 互換性は維持する
- 既存の `bug-hunt` の start / stop / status 契約は維持する
- graph 検索は既存の `search` extension の能力を優先して再利用する
- context 肥大化を避けるため、1 仮説ごとに局所 state を分ける

# Research Inputs
- 外部調査で確認した事項:
  - CogniGent は restructuring、retrieval、filtering、hypothesis、investigation、observer の分業で精度を上げている
  - 精度寄与が大きいのは hypothesis と investigation である
  - context 管理と call-chain ベース探索が重要である
- その知見を plan にどう反映するか:
  - `bug-hunt` に multi-stage pipeline を追加する
  - graph traversal と observer rerank を優先して実装する
  - 1-shot prompt を主経路から外し、LLM を局所役割へ絞る
- ローカル実装から確認した事項:
  - `bug-hunt` は今 `pi --no-extensions` の 1 回呼び出しで動いている
  - `locagent`、`repograph-localization`、`call-graph` は再利用可能
  - `fault_localize.ts` は placeholder であり、初期段階の主軸には使えない

# File/Module Impact
- `.pi/extensions/bug-hunt/types.ts`: multi-stage state、candidate、hypothesis、investigation result の型を追加
- `.pi/extensions/bug-hunt/storage.ts`: state 保存、意味的 dedupe、探索履歴保存を追加
- `.pi/extensions/bug-hunt/reporting.ts`: prompt を役割別に分離し、observer 用 schema と report validation を追加
- `.pi/extensions/bug-hunt/runner.ts`: orchestrator 本体を多段化し、候補抽出、調査、observer、task 化前 validation を追加
- `.pi/extensions/bug-hunt/index.ts`: 新しい設定項目や status 表示を追加
- `.pi/extensions/search/locagent/query.ts`: 必要なら bug-hunt 向け query helper を追加
- `.pi/extensions/repograph-localization/index.ts`: 必要なら bug-hunt から使いやすい API へ薄く拡張する
- `tests/unit/extensions/bug-hunt*.test.ts`: 新 pipeline と validation の単体テストを追加

# Implementation Order
1. 計画書と live todo を作る
2. `bug-hunt` state と DTO を multi-stage 用に拡張する
3. 候補抽出 adapter を作る
4. hypothesis / investigation / observer の prompt と JSON schema を分離する
5. runner を multi-stage orchestrator に置き換える
6. task 化前 validation と dedupe を強化する
7. status 表示と設定値を整える
8. テストを追加する
9. lint / test / typecheck を回す

# Detailed Todo
- [ ] 既存 `bug-hunt` 反復の責務を分解し、stage ごとの入出力を型に落とす
- [ ] `BugHuntState` に `seenFiles`、`rejectedHypotheses`、`lastCandidates`、`lastObserverDecision` を追加する
- [ ] 候補抽出 adapter を作り、`locagent` と `repograph-localization` の結果を共通候補形式へ正規化する
- [ ] 候補の merge / rank ルールを定義する
- [ ] restructuring prompt を追加し、探索クエリをノイズ除去した形へ整形する
- [ ] hypothesis prompt を追加し、候補ごとに root-cause 仮説を複数生成する
- [ ] investigation prompt を追加し、候補の近傍 call-chain / graph neighborhood を評価する
- [ ] observer prompt を追加し、仮説と evidence を再採点する
- [ ] investigation 用の scratch state を runner 側で管理する
- [ ] `call-graph` または `locagent traverse` を使った DFS 風の局所探索を実装する
- [ ] `evidence.file` と `evidence.line` の実在確認を task 化前に追加する
- [ ] dedupe を hash だけでなく `title + symbol/file + why/evidence summary` ベースで補強する
- [ ] `no_bug` を単なる素通しにせず、探索不十分と確信なしを区別する
- [ ] status 出力に stage、last decision、queue 風の概要を追加する
- [ ] 正常系、空候補、重複、observer reject、invalid evidence のテストを追加する
- [ ] 必要なら docs または help text を更新する

# Test & Verification
- 自動テスト:
  - `npx vitest run tests/unit/extensions/bug-hunt.test.ts tests/unit/extensions/bug-hunt-reporting.test.ts`
  - 追加した新規 bug-hunt 系テスト
- 手動確認:
  - `bug_hunt_start` 後の status に新 stage 情報が出ること
  - task が evidence 検証を通ったものだけ保存されること
- 回帰確認:
  - 既存の start / stop / status 契約を壊していないこと
- Proof artifacts:
  - テスト結果
  - status 出力
  - task 保存結果
- Verified reality の判定条件:
  - multi-stage で動作し、少なくとも単体テストと lint が通る
- 未検証の残り:
  - 実 repo 全体での長時間ランの品質比較
  - SBFL 統合時の追加効果

# Observe & Repair Notes
- 失敗または観測結果:
  - `call-graph` の精度が低く、探索ノイズが多い可能性がある
- 原因仮説:
  - regex ベース解析が common name に弱い
- 次の修復:
  - 探索深さを絞る
  - `locagent` 近傍の優先度を上げる
  - observer threshold を強める

# Continuity Notes
- 現在の in_progress:
  - 長い計画書と todo の固定
- 次にやること:
  - 型設計と orchestrator の責務分解
- 作業中ファイル:
  - `plans/bug-hunt-cognigent-implementation.md`
  - `.pi/extensions/bug-hunt/types.ts`
  - `.pi/extensions/bug-hunt/runner.ts`
- 保留判断:
  - SBFL は phase 2 以降に回す

# Risks / Rollback
- 主なリスク:
  - orchestrator が重くなり、loop の throughput が落ちる
  - graph ノイズで false positive が増える
  - prompt 数が増え、タイムアウトやコストが増える
- 戻し方:
  - stage ごとに feature flag を設け、候補抽出のみ / observer のみでも戻せる形にする

# Progress Log
- 2026-03-12 planner: 初版作成
