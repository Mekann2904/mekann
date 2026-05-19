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
