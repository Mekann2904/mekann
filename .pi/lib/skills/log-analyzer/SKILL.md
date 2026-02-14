---
name: log-analyzer
description: ログファイル解析スキル。エラーパターン抽出、タイムスタンプ相関分析、ログレベル分類、異常検知を実行。アプリケーションログ、システムログ、アクセスログの分析に使用。
---

# Log Analyzer

ログファイルを解析し、エラーパターン、異常、問題の根本原因を特定するためのスキル。大規模なログファイルから重要な情報を抽出・分析する。

## 基本的なログ検索

### エラー検出

```bash
# ERRORレベルのログを抽出
grep -E "ERROR|error|Error" /var/log/app.log

# クリティカルなエラー
grep -E "CRITICAL|FATAL|critical|fatal" /var/log/app.log

# 例外スタックトレース
grep -A 20 "Exception\|Error" /var/log/app.log
```

### タイムスタンプ範囲指定

```bash
# 特定日時のログ
grep "2024-01-15" /var/log/app.log

# 時間範囲（awk使用）
awk '/2024-01-15 10:00/,/2024-01-15 11:00/' /var/log/app.log

# 直近N分（journalctl使用）
journalctl -u app --since "10 minutes ago"
```

## ログレベル分析

### レベル別集計

```bash
# 各レベルの出現回数
grep -oE "DEBUG|INFO|WARN|ERROR|FATAL" /var/log/app.log | sort | uniq -c

# ERROR比率を計算
total=$(wc -l < /var/log/app.log)
errors=$(grep -c "ERROR" /var/log/app.log)
echo "Error rate: $(echo "scale=2; $errors * 100 / $total" | bc)%"
```

### ワーニング以上の抽出

```bash
grep -E "WARN|ERROR|FATAL" /var/log/app.log
```

## パターン分析

### エラーパターンのグループ化

```bash
# 類似エラーをグループ化
grep "ERROR" /var/log/app.log | \
  sed 's/\[.*\]//' | \
  sort | \
  uniq -c | \
  sort -rn | \
  head -20
```

### リクエストID追跡

```bash
# 特定リクエストIDの全ログ
grep "req-12345" /var/log/app.log

# ユーザーIDで追跡
grep "userId=abc123" /var/log/app.log
```

### IPアドレス分析

```bash
# アクセス元IP集計
grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' /var/log/access.log | \
  sort | \
  uniq -c | \
  sort -rn | \
  head -10
```

## パフォーマンス分析

### レスポンスタイム分析

```bash
# 遅いリクエスト（1秒以上）
grep -E "[0-9]{4,}ms" /var/log/app.log

# 平均レスポンスタイム計算
grep -oE '[0-9]+ms' /var/log/app.log | \
  sed 's/ms//' | \
  awk '{sum+=$1; count++} END {print "Average:", sum/count, "ms"}'
```

### エラー率の時系列変化

```bash
# 1時間ごとのエラー数
awk '{print substr($0, 1, 13)}' /var/log/app.log | \
  grep "ERROR" | \
  sort | \
  uniq -c
```

## JSON ログ解析

### jqを使用した解析

```bash
# ERRORレベル抽出
jq 'select(.level == "ERROR")' /var/log/app.json

# 特定フィールド抽出
jq -r 'select(.level == "ERROR") | "\(.timestamp) \(.message)"' /var/log/app.json

# エラータイプ別集計
jq -r 'select(.level == "ERROR") | .errorType' /var/log/app.json | \
  sort | \
  uniq -c | \
  sort -rn
```

### 構造化ログのフィルタリング

```bash
# 特定サービスのログ
jq 'select(.service == "api-gateway")' /var/log/app.json

# 期間指定
jq 'select(.timestamp >= "2024-01-15T00:00:00" and .timestamp < "2024-01-16T00:00:00")' /var/log/app.json
```

## 異常検知パターン

### 急激なエラー増加

```bash
# 直近100行のエラー率
tail -100 /var/log/app.log | grep -c "ERROR"

# 前後比較
head -1000 /var/log/app.log | grep -c "ERROR"
tail -1000 /var/log/app.log | grep -c "ERROR"
```

### OutOfMemoryError検出

```bash
grep -E "OutOfMemory|OOM|memory" /var/log/app.log
```

### 接続エラーパターン

```bash
grep -E "Connection refused|timeout|ECONNREFUSED|ETIMEDOUT" /var/log/app.log
```

## よく使用する解析テンプレート

### 総合レポート生成

```bash
#!/bin/bash
LOG_FILE="/var/log/app.log"

echo "=== Log Analysis Report ==="
echo "Total lines: $(wc -l < $LOG_FILE)"
echo ""
echo "=== By Level ==="
grep -oE "DEBUG|INFO|WARN|ERROR|FATAL" $LOG_FILE | sort | uniq -c
echo ""
echo "=== Top 10 Errors ==="
grep "ERROR" $LOG_FILE | sed 's/\[.*\]//' | sort | uniq -c | sort -rn | head -10
echo ""
echo "=== Slow Requests (>1000ms) ==="
grep -E "[0-9]{4,}ms" $LOG_FILE | head -10
```

## 参考ツール

- `grep` - パターン検索
- `awk` - 列処理・集計
- `sed` - テキスト変換
- `jq` - JSON処理
- `journalctl` - systemdログ
- `lnav` - Log Navigator（対話的ログビューア）
