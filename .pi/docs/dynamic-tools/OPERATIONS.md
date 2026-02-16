# 動的ツール生成システム - 運用手順書

本ドキュメントでは、動的ツール生成システムの運用・保守・監視手順について説明します。

## 目次

1. [概要](#概要)
2. [日次運用手順](#日次運用手順)
3. [週次運用手順](#週次運用手順)
4. [ツール保守・管理](#ツール保守管理)
5. [ログ管理](#ログ管理)
6. [パフォーマンス監視](#パフォーマンス監視)
7. [リカバリ手順](#リカバリ手順)
8. [トラブルシューティングフロー](#トラブルシューティングフロー)

---

## 概要

### 運用の目的

動的ツール生成システムの安定運用のため、以下の目的で定期作業を実施します：

1. **可用性の維持**: ツールが正常に動作することを保証
2. **パフォーマンスの最適化**: 実行時間・リソース使用量の監視
3. **セキュリティの維持**: 監査ログの確認・異常検出
4. **ストレージの管理**: ツール定義・ログの容量管理

### 運用スケジュール

| 作業 | 頻度 | 所要時間 | 担当 |
|------|------|----------|------|
| ヘルスチェック | 日次 | 5分 | 運用者 |
| エラーログ確認 | 日次 | 10分 | 運用者 |
| ツール使用状況確認 | 週次 | 15分 | 運用者 |
| 監査ログレビュー | 週次 | 20分 | 運用者 |
| 古いログのアーカイブ | 月次 | 10分 | 運用者 |

### ファイル構成

```
.pi/
├── tools/                          # ツール定義
│   ├── dt_abc123def456.json       # 個別ツール定義
│   └── ...
├── logs/
│   ├── dynamic-tools-audit.jsonl  # 監査ログ
│   └── dynamic-tools-metrics.json # 品質メトリクス（将来実装）
└── docs/dynamic-tools/
    ├── README.md                  # システム概要
    ├── API.md                     # APIリファレンス
    ├── SAFETY.md                  # 安全性ガイド
    └── OPERATIONS.md              # このファイル
```

---

## 日次運用手順

### 1. ヘルスチェック（所要時間: 5分）

#### 1.1 システム状態の確認

```bash
# ツール定義ディレクトリの確認
ls -la .pi/tools/

# ツール数の確認
ls .pi/tools/*.json 2>/dev/null | wc -l

# 監査ログの存在確認
ls -la .pi/logs/dynamic-tools-audit.jsonl
```

#### 1.2 ツール一覧の確認

```typescript
// pi内で実行
list_dynamic_tools({})
```

確認項目：
- [ ] ツール数が異常に増加していないか（前日比で大幅な変化がないか）
- [ ] 未知のツールが作成されていないか
- [ ] 信頼度スコアが極端に低いツールがないか

#### 1.3 ディスク容量の確認

```bash
# ツール定義の合計サイズ
du -sh .pi/tools/

# ログファイルのサイズ
du -sh .pi/logs/

# 全体のディスク使用率
df -h .
```

### 2. エラーログ確認（所要時間: 10分）

#### 2.1 直近24時間のエラー抽出

```bash
# エラーログの抽出
grep '"success":false' .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '[.timestamp, .action, .toolName // "-", .errorMessage // "-"] | @tsv' | \
  tail -50

# エラーの種類別集計
grep '"success":false' .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '.errorMessage // .action' | \
  sort | uniq -c | sort -rn
```

#### 2.2 エラー傾向の分析

```bash
# 時間帯別のエラー発生状況（直近24時間）
grep '"success":false' .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '.timestamp' | \
  cut -d'T' -f2 | \
  cut -d':' -f1 | \
  sort | uniq -c

# ツール別のエラー発生状況
grep '"success":false' .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '.toolName // "unknown"' | \
  sort | uniq -c | sort -rn | head -10
```

#### 2.3 クリティカルな問題の確認

```bash
# クリティカルレベルの問題（セキュリティ関連）を確認
grep 'verification.fail\|critical\|security' .pi/logs/dynamic-tools-audit.jsonl | \
  tail -20
```

---

## 週次運用手順

### 1. ツール使用状況確認（所要時間: 15分）

#### 1.1 使用頻度の分析

```bash
# 週間のツール使用回数ランキング
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.action == "tool.run") | .toolName' | \
  sort | uniq -c | sort -rn | head -20

# 使用回数0のツール一覧（削除候補）
# まず全ツール名を取得
ls .pi/tools/*.json | xargs -I{} basename {} .json | while read id; do
  name=$(cat .pi/tools/${id}.json | jq -r '.name')
  count=$(grep -c "\"toolName\":\"${name}\"" .pi/logs/dynamic-tools-audit.jsonl 2>/dev/null || echo "0")
  echo "${name}: ${count}回"
done | sort -t: -k2 -n | head -20
```

#### 1.2 信頼度スコアの確認

```typescript
// 低信頼度ツールの確認
list_dynamic_tools({ min_safety_score: 0.0, limit: 100 })

// 信頼度0.5未満のツールを特定して確認
```

確認項目：
- [ ] 信頼度スコアが0.5未満のツールの原因調査
- [ ] 使用回数が0のツールの削除検討
- [ ] 信頼度スコアが大幅に低下したツールの原因調査

#### 1.3 成功率の確認

```bash
# 週間成功率の計算
total=$(grep -c '"action":"tool.run"' .pi/logs/dynamic-tools-audit.jsonl)
success=$(grep '"action":"tool.run"' .pi/logs/dynamic-tools-audit.jsonl | grep -c '"success":true')
fail=$((total - success))

echo "総実行回数: ${total}"
echo "成功: ${success}"
echo "失敗: ${fail}"
echo "成功率: $(echo "scale=2; $success * 100 / $total" | bc)%"
```

### 2. 監査ログレビュー（所要時間: 20分）

#### 2.1 全操作の概要確認

```bash
# 操作種別の集計
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '.action' | \
  sort | uniq -c | sort -rn

# 週間の新規ツール作成数
cat .pi/logs/dynamic-tools-audit.jsonl | \
  grep '"action":"tool.create"' | \
  wc -l

# 週間のツール削除数
cat .pi/logs/dynamic-tools-audit.jsonl | \
  grep '"action":"tool.delete"' | \
  wc -l
```

#### 2.2 セキュリティ関連の確認

```bash
# 検証失敗の詳細確認
cat .pi/logs/dynamic-tools-audit.jsonl | \
  grep 'verification' | \
  jq -r '[.timestamp, .action, .details.reason // "-"] | @tsv' | \
  tail -50

# 高リスク操作の確認
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.details.warning != null) | [.timestamp, .toolName, .details.warning] | @tsv'
```

#### 2.3 異常パターンの検出

```bash
# 短時間に大量のツール作成（異常の可能性）
cat .pi/logs/dynamic-tools-audit.jsonl | \
  grep 'tool.create' | \
  jq -r '.timestamp' | \
  cut -d'T' -f1 | \
  sort | uniq -c | \
  awk '$1 > 10 {print "警告: " $2 " に " $1 " 件のツール作成"}'

# 同一ツールの連続失敗（問題のあるツールの可能性）
cat .pi/logs/dynamic-tools-audit.jsonl | \
  grep '"success":false' | \
  jq -r '.toolName' | \
  sort | uniq -c | \
  awk '$1 > 5 {print "警告: " $2 " が " $1 " 回失敗"}'
```

### 3. レポート作成（オプション）

週次レポートのテンプレート：

```markdown
# 動的ツール生成システム 週次レポート

## 対象期間
YYYY-MM-DD 〜 YYYY-MM-DD

## サマリー
- 登録ツール数: XX件
- 新規作成: XX件
- 削除: XX件
- 総実行回数: XX回
- 成功率: XX%

## 主な変更
- [ツール名]: 追加/削除/更新

## インシデント
- [日時] [内容] [対応]

## 次週の課題
- [課題内容]
```

---

## ツール保守・管理

### ツールの削除基準

以下の条件に該当するツールは削除を検討してください：

| 条件 | 期間 | 削除可否 |
|------|------|----------|
| 使用回数0 | 30日以上 | 推奨 |
| 信頼度スコア < 0.3 | 問わず | 検討 |
| 重大なバグあり | 問わず | 削除して再作成 |
| 同名の新バージョンあり | 問わず | 旧バージョン削除 |

### ツール削除の手順

```typescript
// ステップ1: 削除対象の確認
list_dynamic_tools({ name: "tool_name" })

// ステップ2: 削除の実行（確認付き）
delete_dynamic_tool({
  tool_name: "tool_name",
  confirm: true
})

// ステップ3: 削除の確認
list_dynamic_tools({ name: "tool_name" })
// -> "動的ツールは登録されていません。"
```

### ツールの更新手順

動的ツールは直接更新できないため、削除して再作成します：

```typescript
// ステップ1: 現在のツール定義を確認
list_dynamic_tools({ name: "old_tool" })

// ステップ2: 削除
delete_dynamic_tool({ tool_name: "old_tool", confirm: true })

// ステップ3: 新しいコードで再作成
create_tool({
  name: "old_tool",  // 同名で再作成
  description: "更新された説明",
  code: `
async function execute(params) {
  // 更新されたコード
}
`,
  parameters: { /* ... */ }
})
```

### ツールのバックアップ

```bash
# 全ツール定義のバックアップ
backup_dir=".pi/tools/backup/$(date +%Y%m%d)"
mkdir -p "$backup_dir"
cp .pi/tools/dt_*.json "$backup_dir/"

# バックアップの確認
ls -la "$backup_dir/"

# 特定ツールのバックアップ
cp .pi/tools/dt_abc123.json .pi/tools/dt_abc123.json.bak
```

---

## ログ管理

### 監査ログの構造

```json
{
  "id": "audit_abc123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "action": "tool.run",
  "toolId": "dt_xyz789",
  "toolName": "json_formatter",
  "actor": "system",
  "details": {
    "executionTimeMs": 150,
    "parameters": { "input": "..." }
  },
  "success": true,
  "errorMessage": null
}
```

### ログ分析クエリ集

#### 基本的な抽出

```bash
# 特定期間のログを抽出
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq "select(.timestamp >= \"2024-01-01\" and .timestamp < \"2024-02-01\")"

# 特定ツールの全履歴
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq "select(.toolName == \"target_tool\")"

# 特定アクションのみ
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq "select(.action == \"tool.create\" or .action == \"tool.delete\")"
```

#### 統計分析

```bash
# 1時間ごとの実行数
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '.timestamp' | \
  sed 's/T/\t/' | \
  cut -f2 | \
  cut -d: -f1 | \
  sort | uniq -c

# 平均実行時間
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.details.executionTimeMs != null) | .details.executionTimeMs' | \
  awk '{sum+=$1; count++} END {print "平均:", sum/count, "ms"}'

# 最大実行時間
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.details.executionTimeMs != null) | .details.executionTimeMs' | \
  sort -n | tail -1
```

### ログのアーカイブ

```bash
# 古いログのアーカイブ（30日以上前）
archive_date=$(date -v-30d +%Y%m%d)
archive_file=".pi/logs/dynamic-tools-audit-${archive_date}.jsonl.gz"

# アーカイブの実行
# 注意: この処理は慎重に行ってください

# 1. アーカイブ対象のエントリ数を確認
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r "select(.timestamp < \"$(date -v-30d +%Y-%m-%d)\")" | \
  wc -l

# 2. アーカイブファイルの作成
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -c "select(.timestamp < \"$(date -v-30d +%Y-%m-%d)\")" | \
  gzip > "$archive_file"

# 3. アーカイブの検証
zcat "$archive_file" | wc -l

# 4. 元ファイルから削除（慎重に！）
# cat .pi/logs/dynamic-tools-audit.jsonl | \
#   jq -c "select(.timestamp >= \"$(date -v-30d +%Y-%m-%d)\")" > \
#   .pi/logs/dynamic-tools-audit.jsonl.new
# mv .pi/logs/dynamic-tools-audit.jsonl.new .pi/logs/dynamic-tools-audit.jsonl
```

### ログの保持期間

| ログ種別 | 保持期間 | アーカイブ | 備考 |
|----------|----------|------------|------|
| 監査ログ（最新） | 30日 | なし | オンライン検索用 |
| 監査ログ（アーカイブ） | 1年 | gzip圧縮 | 法的要件に応じて延長 |
| ツール定義のバックアップ | 90日 | なし | 誤削除復旧用 |

---

## パフォーマンス監視

### 監視項目

| 項目 | 閾値（警告） | 閾値（異常） | 対応 |
|------|-------------|-------------|------|
| ツール実行時間 | > 10秒 | > 30秒 | コード最適化 |
| ツール数 | > 80件 | = 100件 | 不要ツール削除 |
| ログサイズ | > 10MB | > 50MB | アーカイブ実行 |
| 成功率 | < 95% | < 90% | 原因調査 |

### パフォーマンス確認コマンド

```bash
# 実行時間の分布
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.details.executionTimeMs != null) | .details.executionTimeMs' | \
  sort -n | \
  awk '
    BEGIN { 
      count[0]=0; count[1]=0; count[2]=0; count[3]=0; count[4]=0; count[5]=0 
    }
    $1 < 100 { count[0]++ }
    $1 >= 100 && $1 < 500 { count[1]++ }
    $1 >= 500 && $1 < 1000 { count[2]++ }
    $1 >= 1000 && $1 < 5000 { count[3]++ }
    $1 >= 5000 && $1 < 10000 { count[4]++ }
    $1 >= 10000 { count[5]++ }
    END {
      print "< 100ms:", count[0]
      print "100-500ms:", count[1]
      print "500ms-1s:", count[2]
      print "1-5s:", count[3]
      print "5-10s:", count[4]
      print "> 10s:", count[5]
    }
  '

# 遅いツールの特定（平均実行時間が5秒以上）
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.action == "tool.run" and .details.executionTimeMs != null) | [.toolName, .details.executionTimeMs] | @tsv' | \
  awk '
    {
      sum[$1] += $2
      count[$1]++
    }
    END {
      for (tool in sum) {
        avg = sum[tool] / count[tool]
        if (avg > 5000) {
          printf "%s: 平均 %.0f ms (%d 回)\n", tool, avg, count[tool]
        }
      }
    }
  '
```

### パフォーマンス改善のアプローチ

1. **実行時間が長いツール**
   - ループ処理の最適化
   - 並列処理（Promise.all）の活用
   - 不要な処理の削除

2. **メモリ使用量が多いツール**
   - 大きなデータの分割処理
   - ストリーミング処理の検討
   - 中間データの早期解放

3. **頻繁にタイムアウトするツール**
   - タイムアウト値の調整
   - 処理の分割（複数ツールに分ける）
   - 外部リソースアクセスの見直し

---

## リカバリ手順

### シナリオ1: ツール定義ファイルの破損

```bash
# 症状: ツール一覧に表示されない、JSONパースエラー

# 1. 破損したファイルの特定
for f in .pi/tools/dt_*.json; do
  jq . "$f" > /dev/null 2>&1 || echo "破損: $f"
done

# 2. バックアップからの復元（バックアップがある場合）
cp .pi/tools/backup/20240115/dt_abc123.json .pi/tools/

# 3. バックアップがない場合
# - ツールを再作成する必要があります
# - 監査ログからパラメータ定義を確認できる可能性があります
grep '"action":"tool.create"' .pi/logs/dynamic-tools-audit.jsonl | \
  grep 'dt_abc123' | tail -1 | jq '.details'
```

### シナリオ2: 監査ログの破損

```bash
# 症状: ログが読めない、jqパースエラー

# 1. 破損箇所の特定
cat .pi/logs/dynamic-tools-audit.jsonl | \
  nl -ba | \
  while read num line; do
    echo "$line" | jq . > /dev/null 2>&1 || echo "行 $num が破損"
  done

# 2. 正常な行のみを抽出
cat .pi/logs/dynamic-tools-audit.jsonl | \
  while read line; do
    echo "$line" | jq . > /dev/null 2>&1 && echo "$line"
  done > .pi/logs/dynamic-tools-audit-fixed.jsonl

# 3. 元のファイルを置き換え
mv .pi/logs/dynamic-tools-audit.jsonl .pi/logs/dynamic-tools-audit.jsonl.corrupted
mv .pi/logs/dynamic-tools-audit-fixed.jsonl .pi/logs/dynamic-tools-audit.jsonl
```

### シナリオ3: ディスク容量不足

```bash
# 症状: ファイル書き込みエラー

# 1. 容量の確認
df -h .

# 2. 不要なファイルの特定
du -sh .pi/tools/* | sort -rh | head -10
du -sh .pi/logs/* | sort -rh | head -10

# 3. 古いログのアーカイブ
# （前述のアーカイブ手順を参照）

# 4. 不要なツールの削除
list_dynamic_tools({})
# 使用頻度の低いツールを削除
```

### シナリオ4: ツール実行の連続失敗

```bash
# 症状: 特定ツールが常に失敗する

# 1. 失敗の詳細を確認
grep '"toolName":"problem_tool"' .pi/logs/dynamic-tools-audit.jsonl | \
  grep '"success":false' | \
  tail -5 | jq '.'

# 2. エラーパターンの分析
grep '"toolName":"problem_tool"' .pi/logs/dynamic-tools-audit.jsonl | \
  grep '"success":false' | \
  jq -r '.errorMessage' | sort | uniq -c

# 3. 一時的な対応
# - ツールを削除して再作成
# - 代替ツールを使用
# - パラメータの入力方法を変更
```

---

## トラブルシューティングフロー

### フロー1: ツールが実行できない

```
ツール実行エラー
    │
    ├─ エラーメッセージを確認
    │
    ├─ 「ツールが見つかりません」
    │   └─ list_dynamic_tools({}) で確認
    │       └─ ツールが存在しない → 再作成
    │       └─ 名前が間違っている → 正しい名前を指定
    │
    ├─ 「必須パラメータが不足」
    │   └─ list_dynamic_tools({ name: "..." }) でパラメータ確認
    │       └─ 不足パラメータを追加
    │
    ├─ 「実行タイムアウト」
    │   └─ timeout_ms を増やす
    │   └─ コードを最適化
    │
    └─ 「安全性チェック失敗」
        └─ SAFETY.md の危険パターン一覧を確認
            └─ 該当箇所を修正
```

### フロー2: システム全体の問題

```
システム異常
    │
    ├─ ツールが作成できない
    │   ├─ 「最大ツール数」→ 不要ツールを削除
    │   ├─ 「名前の重複」→ 別名を使用
    │   └─ 「セキュリティリスク」→ コードを修正
    │
    ├─ ツール一覧が表示されない
    │   ├─ ディレクトリ確認: ls .pi/tools/
    │   ├─ JSON整合性確認: jq . .pi/tools/dt_*.json
    │   └─ 破損ファイルの削除/復元
    │
    └─ ログが記録されない
        ├─ ディスク容量確認: df -h
        ├─ ディレクトリ権限確認: ls -la .pi/logs/
        └─ ディレクトリ作成: mkdir -p .pi/logs
```

### フロー3: パフォーマンス問題

```
パフォーマンス低下
    │
    ├─ 実行が遅い
    │   ├─ ログで実行時間を確認
    │   ├─ 遅いツールを特定
    │   └─ コード最適化またはタイムアウト調整
    │
    ├─ ディスク容量不足
    │   ├─ 使用量確認: du -sh .pi/
    │   ├─ 古いログをアーカイブ
    │   └─ 不要なツールを削除
    │
    └─ ツール数が多い
        ├─ 使用頻度の低いツールを特定
        └─ 削除候補リストを作成して削除
```

---

## 関連ドキュメント

- [README.md](./README.md) - システム概要とトラブルシューティング
- [API.md](./API.md) - APIリファレンス
- [SAFETY.md](./SAFETY.md) - 安全性ガイド
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - 詳細なトラブルシューティングガイド
- [RECOVERY.md](./RECOVERY.md) - 障害対応・リカバリ手順書
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - デプロイ・実装手順書

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|----------|
| 2024-01-XX | 1.0.0 | 初版作成 |
