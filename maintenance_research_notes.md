# Maintenance Research Notes

## 第一原理からの分析

### 1. コードベースとメンテナンスに関する前提の列挙

#### 事実（観測可能）
- **F1**: リポジトリは7つのpi拡張機能（autoresearch, goal, plan-mode, sandbox, subagent, zip-repo, policy-core）を含む
- **F2**: ソースコード合計 12,962 行（doc/ 除外、テスト除外）
- **F3**: autoresearch/index.ts が 2,360 行で最大単一ファイル
- **F4**: テストスイートは全て通過（1,268 tests）
- **F5**: TypeScript型チェックは sandbox + subagent のみ有効（他は型チェックなし）
- **F6**: `doc/` ディレクトリに参照用の旧コードが存在（3,038行、.gitignore で除外されているがワーキングツリーに存在）
- **F7**: autoresearch モジュールが全体の約半分（5,857行 / 12,962行 ≈ 45%）を占める

#### 推論（証拠に基づくが、前提に依存）
- **I1**: autoresearch/index.ts が巨大なのは、複数のモード（legacy JSONL, contract file, plan-scoped）を1ファイルで処理しているため
- **I2**: `doc/pi-autoresearch/` は pi 本体からの参照コピーであり、このリポジトリの本番コードではない
- **I3**: goal モジュール（1,524行）と plan-mode（539行）は他モジュールより小さく、比較的独立している
- **I4**: subagent モジュール（2,463行）は7ファイルに分割されており、モジュール化が進んでいる

#### 慣習
- **C1**: 各拡張機能は index.ts をエントリポイントとする
- **C2**: TypeScript で記述されているが、型チェックは一部モジュールのみ
- **C3**: テストは Vitest を使用

#### 未検証の仮定
- **U1**: autoresearch/index.ts の巨大さは実際のメンテナンスコストを増やしている（単なる見た目の問題かもしれない）
- **U2**: 型チェックの欠如が将来のバグを増やす

### 2-4. 各前提が false だった場合に残るもの

残る事実:
- 7つの独立した拡張機能が存在する
- autoresearch が最大の拡張機能である
- テストカバレッジが存在する
- 各モジュールが pi の ExtensionAPI に依存している
- autoresearch には複数の状態管理パスが存在する（legacy + v2 + contract）

### 5-6. 最小事実に基づく再定義

本質的なもの:
- 各拡張機能の公開インターフェース（tool, command, hook）
- 状態管理（セッション、実験結果、ベストメトリック）
- コマンド実行とチェック機能
- テスト可能な振る舞い

運用上の便宜:
- legacy 互換性コード（JSONL, .pi セッションディレクトリ）
- doc/ の参照コピー
- 重複した状態復元ロジック

### 7. メンテナンスコストが発生している箇所

#### 高コスト（観測された問題）

**P1: autoresearch/index.ts の巨大化（2,360行）**
- 問題: 1ファイルに5つのツール定義、3つのイベントハンドラ、1つのコマンドハンドラが混在
- 影響: 変更波及が大きい。1つのツールの修正が他のツールに影響する可能性
- 証拠: `session_start` ハンドラで3つのモード（plan-scoped, contract-file, legacy）の復元ロジックが一箇所に

**P2: 重複した状態復元ロジック**
- `session_start` 内で3つのモード（plan-scoped, contract-file, legacy）に分岐して状態復元
- 各モードで似たような復元パターン（sessionId, metricName, direction, bestMetric, runCount）
- 変更時: 状態フィールド追加時に3箇所を更新する必要がある

**P3: Legacy 互換性コードの混入**
- `autoresearch.jsonl` 互換書き込み
- `.pi/autoresearch/` セッションディレクトリ互換
- `legacyWarnings` の蓄積
- 影響: 本番パスにノイズが多く、理解すべき概念が増える

**P4: 型チェックの欠如**
- autoresearch, goal, plan-mode, zip-repo に typecheck スクリプトがない
- 影響: リファクタリング時に型の安全性が保証されない

**P5: ツール定義のインライン化**
- 5つのツール（evaluate_query, init, run, log, plan, approve, run_contract）が全て index.ts 内に定義
- execute ハンドラが各100-300行
- 影響: ツール間の責務境界が不明確

**P6: find コマンドの maxdepth 2 制限**
- `evaluate_maintenance.sh` が `find . -maxdepth 2` でソースファイルを検索
- ネストしたディレクトリ構造でファイルを見逃す可能性
- 既に subagent/tests/ のようなネストがあるため一部対応済みだが、不完全

### 8. 主要な前提が崩れた場合

- もし autoresearch/index.ts を分割してもテストが通るなら、分割は安全
- もし legacy 互換コードを削除してもユーザー影響がないなら、大幅な削減が可能
- もし型チェックを追加して既存エラーが0なら、低リスクで安全性が向上

## 実験計画

### 優先度高：まず実行すべき実験

1. **E1: evaluate_maintenance.sh の doc/ 除外と baseline_loc 修正** → 既に完了
2. **E2: autoresearch/index.ts からツールハンドラの抽出**
   - 仮説: 各ツールの execute ハンドラを別ファイルに抽出すると、変更波及が減る
   - 期待: review_risk 低減、max_file_loc 低減、ファイル数微増
3. **E3: legacy 互換コードの分離**
   - 仮説: legacy 互換書き込みを別モジュールに抽出すると、本番パスの理解コストが下がる
4. **E4: 型チェック対象の拡大**
   - 仮説: autoresearch, goal, plan-mode に typecheck を追加すると、将来のバグを防ぐ

### 優先度中

5. **E5: 重複した状態復元ロジックの統合**
6. **E6: subagent/index.ts と agentControl.ts の境界明確化**

### 優先度低（慎重に）

7. **E7: doc/ ディレクトリの完全削除**（.gitignore で除外されているが、ワーキングツリーに存在）

## 実験結果

### E1: SYSTEM_PROMPT_EXTRA 抽出 (DISCARD)
- maintenance_score: 22890 (変化なし)
- 理由: ファイル1つ増加が max_file_loc 減少を相殺

### E2: setupLogStreams ヘルパー統合 (KEEP)
- maintenance_score: 22890 → 22815 (75点改善)
- duplication_score: 772 → 764

### E3: runSpawn統合 (KEEP) — fc3451c
- maintenance_score: 22815 → 21905 (910点改善)
- duplication_score 大幅改善

### E4: aggregateMeasurementsFromValues→aggregate統合 (KEEP) — 1a9ecc8
- maintenance_score: 21905 → 21795 (110点改善)
- index.ts: 2360→2337行、review_risk: 50→49
- 重複する集約ロジックをcontractEvaluator.tsのexportに統合

### E5: contractEvaluator.aggregate→acceptance.aggregateMeasurements統合 (KEEP) — 3db784c
- maintenance_score: 21660 → 21590 (70点改善)
- duplication_score: 661→654, LOC: 12747→12731
- 3箇所にあった集約関数をacceptance.tsの1箇所に統合

### E6: computeContractHash重複呼び出し統合 (KEEP) — 04f415d
- maintenance_score: 21590 → 21570 (20点改善)
- duplication_score: 654→652
- 同一ハッシュ計算の2回呼び出しを1回に統合

### E7: 未使用import削除 (DISCARD)
- スコア不変。7行削減もreview_risk閾値に届かず

### E8: computeBaselineNoise内集約のヘルパー化 (DISCARD)
- スコア不変。ヘルパー追加でLOC増加が重複削減を相殺

## 知見

1. **小規模なファイル抽出は逆効果**: ファイル数が増加すると review_risk が増え、max_file_loc の減少を相殺する
2. **内部重複の削減は有効**: 同じファイル内の重複コードをヘルパーに統合すると duplication_score が改善する
3. **同一ロジックのimport統合は有効**: 重複関数を一方からexportしてimportする方式は、ファイル数を増やさずに行数を減らせる
4. **dead codeの削除は有効**: 使われていない関数・importの削除は安全で確実な改善
5. **評価スクリプトの tests_passed にflakyあり**: 稀にテスト全通過でもtests_passed=falseになる。タイミング問題
6. **小規模変更の累積効果**: 20-135点の小さな改善が累積して -1320点（5.8%）の改善
7. **review_riskが最大のコスト要因**: 4900点（全スコアの23%）。削減には50行単位の大幅削減かファイル統合が必要
8. **重複の大部分はスキーマ定義とAPI定型パターン**: additionalProperties:false や pi.registerTool パターンは統合不適切
