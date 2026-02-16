# 動的ツール生成システム - トラブルシューティングガイド

本ドキュメントでは、動的ツール生成システムで発生する問題の診断と解決方法を詳細に説明します。

## 目次

1. [エラーコード一覧](#エラーコード一覧)
2. [問題診断フローチャート](#問題診断フローチャート)
3. [シナリオ別トラブルシューティング](#シナリオ別トラブルシューティング)
4. [安全性エラーの詳細](#安全性エラーの詳細)
5. [ログ分析による問題特定](#ログ分析による問題特定)
6. [FAQ](#faq)

---

## エラーコード一覧

### エラーコード体系

動的ツール生成システムでは、以下のエラーコード体系を使用します：

| カテゴリ | コード範囲 | 説明 |
|---------|-----------|------|
| E1xx | E100-E199 | ツール名・パラメータ検証エラー |
| E2xx | E200-E299 | ツール登録・管理エラー |
| E3xx | E300-E399 | ツール実行エラー |
| E4xx | E400-E499 | 安全性検証エラー |
| E5xx | E500-E599 | システム・リソースエラー |

### E1xx: 検証エラー

| エラーコード | メッセージ | 原因 | 対処法 |
|------------|-----------|------|--------|
| E101 | ツール名は必須です | `name`パラメータが空 | ツール名を指定してください |
| E102 | ツール名は64文字以内で指定してください | 名前が長すぎる | 64文字以内に短縮 |
| E103 | ツール名は小文字の英字で始まり、小文字・数字・アンダースコアのみ使用可能です | 命名規則違反 | `^[a-z][a-z0-9_]*$`パターンに従う |
| E104 | 「xxx」は予約された名前です | 予約語を使用 | 別の名前を使用 |
| E105 | 必須パラメータが不足しています: xxx | 必須パラメータ未指定 | 不足パラメータを追加 |
| E106 | パラメータ「xxx」の型が不正です | 型不一致 | 正しい型の値を指定 |
| E107 | tool_idまたはtool_nameを指定してください | ツール特定情報なし | どちらかを指定 |

### E2xx: 登録・管理エラー

| エラーコード | メッセージ | 原因 | 対処法 |
|------------|-----------|------|--------|
| E201 | ツール名「xxx」は既に存在します（ID: dt_xxx） | 名前の重複 | 別名を使用または既存ツールを削除 |
| E202 | 最大ツール数（xxx）に達しています | 上限到達 | 不要ツールを削除 |
| E203 | ツール「xxx」が見つかりません | 存在しないツール | 正しいID/名前を指定 |
| E204 | ツール定義ファイルが破損しています | JSONパースエラー | バックアップから復元または再作成 |
| E205 | 削除を確認するには confirm: true を指定してください | 削除確認不足 | confirm: trueを追加 |
| E206 | 削除に失敗しました | ファイル削除エラー | 権限確認、再試行 |

### E3xx: 実行エラー

| エラーコード | メッセージ | 原因 | 対処法 |
|------------|-----------|------|--------|
| E301 | ツール実行に失敗しました: xxx | ランタイムエラー | エラー詳細を確認しコード修正 |
| E302 | 実行タイムアウト | 処理時間超過 | timeout_msを増やすまたはコード最適化 |
| E303 | 安全性チェック失敗: xxx | 実行時の危険パターン検出 | コードの危険パターンを修正 |
| E304 | メモリ不足エラー | メモリ枯渇 | データ量を削減または処理を分割 |
| E305 | 非同期処理エラー | Promise拒否 | try-catchでエラーハンドリング |

### E4xx: 安全性検証エラー

| エラーコード | メッセージ | 原因 | 対処法 |
|------------|-----------|------|--------|
| E401 | 重大なセキュリティリスクが検出されました | criticalレベルの危険パターン | 危険パターンを削除または許可リスト調整 |
| E402 | 安全性スコアが低すぎます | 高リスクコード | SAFETY.mdの推奨事項に従う |
| E403 | 許可されていない操作: xxx | 許可リスト違反 | 許可リストに追加または操作を変更 |
| E404 | コードインジェクションの可能性 | 動的コード実行 | 静的なコード解析を使用 |

### E5xx: システム・リソースエラー

| エラーコード | メッセージ | 原因 | 対処法 |
|------------|-----------|------|--------|
| E501 | ディスク容量不足 | ストレージ枯渇 | 不要ファイル削除、ログアーカイブ |
| E502 | 監査ログの書き込みに失敗しました | ログ書き込みエラー | ディスク容量、権限確認 |
| E503 | ツール定義ディレクトリにアクセスできません | 権限またはパス問題 | ディレクトリ権限確認 |
| E504 | システムリソースが不足しています | CPU/メモリ枯渇 | 処理の分割、リソース増強 |

---

## 問題診断フローチャート

### フロー1: ツール作成エラー

```
ツール作成エラー
    │
    ├─ エラーメッセージを確認
    │
    ├─「ツール名は必須です」/「命名規則違反」
    │   │
    │   └─> E1xx: 名前の検証エラー
    │       ├─ 名前が空 → 名前を指定
    │       ├─ 64文字超過 → 短縮
    │       ├─ 英字で始まらない → 先頭を英字に変更
    │       └─ 予約語 → 別名を使用
    │
    ├─「ツール名は既に存在します」
    │   │
    │   └─> E201: 重複エラー
    │       ├─ list_dynamic_tools({}) で確認
    │       ├─ 既存ツールを削除して再作成
    │       └─ 別名で作成
    │
    ├─「最大ツール数に達しています」
    │   │
    │   └─> E202: 上限エラー
    │       ├─ list_dynamic_tools({}) で全ツール確認
    │       ├─ 使用頻度の低いツールを特定
    │       └─ 不要ツールを削除
    │
    └─「重大なセキュリティリスクが検出されました」
        │
        └─> E401: 安全性エラー
            ├─ 検出されたパターンを確認
            ├─ SAFETY.mdの危険パターン一覧を参照
            └─ 該当コードを修正
```

### フロー2: ツール実行エラー

```
ツール実行エラー
    │
    ├─ エラーメッセージを確認
    │
    ├─「ツールが見つかりません」
    │   │
    │   └─> E203: 存在しないツール
    │       ├─ ID/名前のタイプミス確認
    │       ├─ list_dynamic_tools({}) で存在確認
    │       └─ ツールが削除されている場合は再作成
    │
    ├─「必須パラメータが不足しています」
    │   │
    │   └─> E105: パラメータ不足
    │       ├─ list_dynamic_tools({ name: "..." }) で定義確認
    │       ├─ required: trueのパラメータを特定
    │       └─ 不足パラメータを追加
    │
    ├─「実行タイムアウト」
    │   │
    │   └─> E302: タイムアウト
    │       ├─ timeout_msを増やす（最大60000ms）
    │       ├─ 処理が重い場合はコードを最適化
    │       └─ データ量を削減
    │
    ├─「安全性チェック失敗」
    │   │
    │   └─> E303/E401: 実行時検出
    │       ├─ 実行時に動的に生成されたコードを確認
    │       └─ 危険パターンを修正
    │
    └─「ツール実行に失敗しました」
        │
        └─> E301: ランタイムエラー
            ├─ エラー詳細を確認
            ├─ デバッグモードで実行
            ├─ コードのバグを修正
            └─ エラーハンドリングを追加
```

### フロー3: システム全体の問題

```
システム異常
    │
    ├─ ツール一覧が表示されない
    │   │
    │   ├─> ディレクトリ確認
    │   │   ls -la .pi/tools/
    │   │
    │   ├─> JSON整合性確認
    │   │   for f in .pi/tools/dt_*.json; do jq . "$f" > /dev/null 2>&1 || echo "破損: $f"; done
    │   │
    │   └─> 破損ファイルの処理
    │       mv .pi/tools/dt_broken.json .pi/tools/dt_broken.json.bak
    │
    ├─ ログが記録されない
    │   │
    │   ├─> ディスク容量確認
    │   │   df -h .
    │   │
    │   ├─> ディレクトリ権限確認
    │   │   ls -la .pi/logs/
    │   │
    │   └─> ディレクトリ作成
    │       mkdir -p .pi/logs
    │
    └─ パフォーマンス低下
        │
        ├─> ツール数確認
        │   ls .pi/tools/*.json | wc -l
        │
        ├─> ログサイズ確認
        │   du -sh .pi/logs/
        │
        └─> 対処
            ├─ 不要ツール削除
            └─ ログアーカイブ
```

---

## シナリオ別トラブルシューティング

### シナリオ1: 新規ツール作成時の名前エラー

**状況**: ツールを作成しようとすると「ツール名は英字で始まり...」というエラーが表示される。

**診断手順**:

```typescript
// ステップ1: 現在の名前を確認
console.log("指定した名前:", toolName);

// ステップ2: 命名規則に合致するか確認
const validNamePattern = /^[a-z][a-z0-9_]*$/;
console.log("有効:", validNamePattern.test(toolName));
```

**解決方法**:

```typescript
// NG: 数字で始まる
"1st_tool"        // → E103

// NG: 大文字を含む
"MyTool"          // → E103

// NG: 記号を含む
"my-tool!"        // → E103

// OK: 小文字で始まり、小文字・数字・アンダースコアのみ
"my_tool"         // → OK
"data_parser_v2"  // → OK
```

### シナリオ2: ツール実行時のパラメータ不足

**状況**: ツールを実行すると「必須パラメータが不足しています」というエラーが表示される。

**診断手順**:

```typescript
// ステップ1: ツール定義を確認
list_dynamic_tools({ name: "target_tool" })

// ステップ2: 出力から required: true のパラメータを特定
// パラメータ:
// - content (string): Markdownファイルの内容  ← required: true
// - max_level (number): 抽出する見出しレベル

// ステップ3: 実行時に不足パラメータを追加
run_dynamic_tool({
  tool_name: "target_tool",
  parameters: {
    content: "# Title\n## Subtitle",  // 追加
    max_level: 3
  }
})
```

### シナリオ3: 安全性チェック失敗

**状況**: ツールを作成すると「重大なセキュリティリスクが検出されました」というエラーが表示される。

**診断手順**:

```bash
# ステップ1: 監査ログで検出されたパターンを確認
grep 'verification.fail' .pi/logs/dynamic-tools-audit.jsonl | tail -5 | jq '.details'

# ステップ2: SAFETY.mdの危険パターン一覧を参照
```

**よくある原因と解決方法**:

| 検出パターン | よくある原因 | 解決方法 |
|-------------|-------------|---------|
| file-system-delete | `fs.rm`, `fs.unlink` | 削除せず論理削除またはアーカイブを使用 |
| process-spawn | `exec`, `spawn` | Node.js標準APIを使用 |
| eval-usage | `eval`, `new Function` | JSON.parseまたはパーサーを使用 |

```typescript
// 悪い例（ブロックされる）
async function execute(params) {
  eval(params.code);  // eval-usage
  fs.rm(params.path, { recursive: true });  // file-system-delete
}

// 良い例（安全）
async function execute(params) {
  // evalの代わりにパーサーを使用
  const data = JSON.parse(params.jsonString);
  
  // 削除の代わりにマーク
  return { marked_for_archive: params.path };
}
```

### シナリオ4: 実行タイムアウト

**状況**: ツールの実行が途中で中断され、「実行タイムアウト」と表示される。

**診断手順**:

```bash
# ステップ1: 当該ツールの過去の実行時間を確認
grep '"toolName":"slow_tool"' .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '.details.executionTimeMs' | sort -n | tail -10
```

**解決方法**:

```typescript
// 方法1: タイムアウトを延長
run_dynamic_tool({
  tool_name: "slow_tool",
  parameters: { ... },
  timeout_ms: 60000  // 60秒に延長
})

// 方法2: コードを最適化（バッチ処理）
async function execute(params) {
  const items = params.items;
  const batchSize = params.batch_size || 100;
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processBatch(batch);
    results.push(...batchResults);
  }
  
  return results;
}
```

### シナリオ5: 信頼度スコアの低下

**状況**: ツールの信頼度スコアが継続的に低下している。

**診断手順**:

```bash
# ステップ1: 失敗パターンを分析
grep '"toolName":"problem_tool"' .pi/logs/dynamic-tools-audit.jsonl | \
  grep '"success":false' | \
  jq -r '.errorMessage' | sort | uniq -c

# ステップ2: 失敗率を計算
total=$(grep -c '"toolName":"problem_tool"' .pi/logs/dynamic-tools-audit.jsonl)
fail=$(grep '"toolName":"problem_tool"' .pi/logs/dynamic-tools-audit.jsonl | grep -c '"success":false')
echo "失敗率: $(echo "scale=2; $fail * 100 / $total" | bc)%"
```

**解決方法**:

```typescript
// ステップ1: ツールを削除
delete_dynamic_tool({ tool_name: "problem_tool", confirm: true })

// ステップ2: 原因を修正して再作成
create_tool({
  name: "problem_tool",
  description: "修正版のツール",
  code: `
async function execute(params) {
  try {
    // エラーハンドリングを追加
    if (!params.input) {
      return { error: "入力が必要です" };
    }
    // 処理...
    return { success: true, result };
  } catch (error) {
    return { error: error.message };
  }
}
`,
  parameters: { /* ... */ }
})
```

### シナリオ6: ツール定義ファイルの破損

**状況**: ツール一覧に表示されない、またはJSONパースエラーが発生する。

**診断手順**:

```bash
# ステップ1: 破損したファイルを特定
for f in .pi/tools/dt_*.json; do
  jq . "$f" > /dev/null 2>&1 || echo "破損: $f"
done

# ステップ2: 破損したファイルの内容を確認
cat .pi/tools/dt_broken.json
```

**解決方法**:

```bash
# 方法1: バックアップから復元
cp .pi/tools/backup/20240115/dt_broken.json .pi/tools/

# 方法2: 破損したファイルを削除して再作成
mv .pi/tools/dt_broken.json .pi/tools/dt_broken.json.bak

# 監査ログからパラメータ定義を確認できる可能性がある
grep '"action":"tool.create"' .pi/logs/dynamic-tools-audit.jsonl | \
  grep 'dt_broken' | tail -1 | jq '.details'
```

---

## 安全性エラーの詳細

### 危険パターンの重大度と影響

| 重大度 | スコア影響 | ブロック | パターン例 |
|--------|-----------|---------|-----------|
| critical | -0.5 | Yes | ファイル削除、プロセス実行、eval |
| high | -0.25 | No（警告のみ） | ネットワーク、ファイル書き込み、機密データ |
| medium | -0.1 | No | 環境変数アクセス、長いタイムアウト |
| low | -0.05 | No | 軽微な問題 |

### 危険パターン別の詳細

#### file-system-delete（重大度: critical）

**検出パターン**:
- `fs.rm(`, `fs.rmdir(`, `fs.unlink(`
- `rmSync(`, `unlinkSync(`
- `rm -rf`, `rmdir`

**安全な代替手段**:
```typescript
// 削除の代わりにアーカイブディレクトリに移動
async function execute(params) {
  const archiveDir = ".pi/archive";
  const timestamp = Date.now();
  const archivePath = `${archiveDir}/${params.filename}.${timestamp}.bak`;
  
  // fs.renameでアーカイブ
  fs.renameSync(params.path, archivePath);
  
  return { archived_to: archivePath };
}
```

#### process-spawn（重大度: critical）

**検出パターン**:
- `child_process`, `spawn(`, `exec(`, `execSync(`

**安全な代替手段**:
```typescript
// 外部コマンドの代わりにNode.js APIを使用

// NG: exec("ls -la")
// OK: fs.readdirSync + fs.statSync
const files = fs.readdirSync(".");
const details = files.map(f => ({
  name: f,
  stats: fs.statSync(f)
}));

// NG: exec("cat file.txt")
// OK: fs.readFileSync
const content = fs.readFileSync("file.txt", "utf-8");
```

#### eval-usage（重大度: critical）

**検出パターン**:
- `eval(`, `new Function(`, `vm.runIn`

**安全な代替手段**:
```typescript
// NG: eval(codeString)
// OK: JSON.parse（JSONの場合）
const data = JSON.parse(jsonString);

// OK: 専用パーサーを使用（複雑な形式の場合）
// 例: csv-parse, marked, yaml など
```

#### network-access（重大度: high）

**検出パターン**:
- `fetch(`, `http.request`, `axios`, `WebSocket`

**安全な実装**:
```typescript
async function execute(params) {
  const url = params.url;
  
  // ドメインのバリデーション
  const allowedDomains = ["api.example.com", "cdn.example.com"];
  const urlObj = new URL(url);
  
  if (!allowedDomains.includes(urlObj.hostname)) {
    return { error: "許可されていないドメインです" };
  }
  
  // タイムアウトを設定
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

## ログ分析による問題特定

### 基本的なログ分析コマンド

#### エラー傾向の分析

```bash
# エラーの種類別集計（過去7日間）
grep '"success":false' .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '.errorMessage // .action' | \
  sort | uniq -c | sort -rn

# 特定ツールのエラー履歴
grep '"toolName":"target_tool"' .pi/logs/dynamic-tools-audit.jsonl | \
  grep '"success":false' | \
  jq -r '[.timestamp, .errorMessage] | @tsv'
```

#### パフォーマンス分析

```bash
# 実行時間の分布
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.details.executionTimeMs != null) | .details.executionTimeMs' | \
  sort -n | \
  awk '
    BEGIN { c1=0; c2=0; c3=0; c4=0; c5=0 }
    $1 < 100 { c1++ }
    $1 >= 100 && $1 < 500 { c2++ }
    $1 >= 500 && $1 < 1000 { c3++ }
    $1 >= 1000 && $1 < 5000 { c4++ }
    $1 >= 5000 { c5++ }
    END {
      print "< 100ms:", c1
      print "100-500ms:", c2
      print "500ms-1s:", c3
      print "1-5s:", c4
      print "> 5s:", c5
    }
  '

# 平均実行時間が遅いツールTOP10
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.action == "tool.run" and .details.executionTimeMs != null) | [.toolName, .details.executionTimeMs] | @tsv' | \
  awk '{ sum[$1]+=$2; count[$1]++ } END { for(t in sum) printf "%s\t%.0f\n", t, sum[t]/count[t] }' | \
  sort -t$'\t' -k2 -rn | head -10
```

#### セキュリティ分析

```bash
# 検証失敗の詳細
cat .pi/logs/dynamic-tools-audit.jsonl | \
  grep 'verification.fail' | \
  jq -r '[.timestamp, .toolName, .details.issues[].type] | @tsv'

# 高リスク操作の警告
cat .pi/logs/dynamic-tools-audit.jsonl | \
  grep 'high_stakes' | \
  jq -r '[.timestamp, .toolName, .details.warning] | @tsv'
```

### ログ分析スクリプト

以下のスクリプトを`.pi/scripts/analyze-logs.sh`として保存して使用できます：

```bash
#!/bin/bash
# 動的ツール生成システム ログ分析スクリプト

LOG_FILE=".pi/logs/dynamic-tools-audit.jsonl"

echo "=== 動的ツール生成システム ログ分析 ==="
echo ""

# サマリー
total=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
errors=$(grep -c '"success":false' "$LOG_FILE" 2>/dev/null || echo 0)
success=$((total - errors))

echo "## サマリー"
echo "- 総エントリ数: $total"
echo "- 成功: $success"
echo "- 失敗: $errors"
echo ""

# エラー種別
echo "## エラー種別"
grep '"success":false' "$LOG_FILE" 2>/dev/null | \
  jq -r '.errorMessage // .action' | \
  sort | uniq -c | sort -rn | head -10
echo ""

# ツール使用ランキング
echo "## ツール使用ランキング"
cat "$LOG_FILE" 2>/dev/null | \
  jq -r 'select(.action == "tool.run") | .toolName' | \
  sort | uniq -c | sort -rn | head -10
```

---

## FAQ

### 基本操作

#### Q: ツール名に使用できる文字は？

**A**: 以下のルールに従ってください：
- 英字（小文字）で始める
- 使用可能文字: 小文字、数字、アンダースコア（_）
- 64文字以内
- 予約語は使用不可（`bash`, `read`, `write`, `edit`, `question`, `create_tool`など）

```typescript
// OK
"json_parser", "data_transformer_v2", "csv_to_json"

// NG
"1st_tool", "my-tool!", "MyTool", "bash"
```

#### Q: ツールの実行結果を確認するには？

**A**: `run_dynamic_tool`の戻り値に実行結果が含まれます：

```typescript
run_dynamic_tool({
  tool_name: "my_tool",
  parameters: { input: "test" }
})
// 出力:
// ツール「my_tool」の実行が完了しました。
// 実行時間: 15ms
// 結果:
// { "status": "success", ... }
```

#### Q: ツールを更新するには？

**A**: 直接更新はサポートされていません。以下の手順で更新してください：

```typescript
// 1. 新しいツールを別名で登録
create_tool({ name: "tool_v2", ... })

// 2. 動作確認
run_dynamic_tool({ tool_name: "tool_v2", parameters: { ... } })

// 3. 旧ツールを削除
delete_dynamic_tool({ tool_name: "old_tool", confirm: true })

// 4. 必要に応じて新ツールを旧名称で再登録
```

### エラー対応

#### Q: 「重大なセキュリティリスクが検出されました」と表示される

**A**: コードにcritical重大度の危険パターンが含まれています：

1. 検出されたパターンを監査ログで確認
2. SAFETY.mdの「危険パターン一覧」を参照
3. 該当箇所を安全な代替手段に置き換え

```typescript
// よくある危険パターンと代替手段
// eval(code) → JSON.parse() またはパーサー
// exec(cmd) → Node.js標準API
// fs.rm(path) → 論理削除またはアーカイブ
```

#### Q: 安全性スコアが低い場合でもツールを作成できますか？

**A**: はい。critical重大度のパターンがなければ作成可能です。ただし、検証状態は`unverified`になります。

#### Q: ツール実行がタイムアウトする

**A**: 以下の対策を検討してください：

1. `timeout_ms`パラメータで延長（最大60000ms）
2. 処理をバッチに分割
3. データ量を削減

```typescript
run_dynamic_tool({
  tool_name: "slow_tool",
  parameters: { batch_size: 100 },
  timeout_ms: 60000
})
```

### 運用

#### Q: 監査ログはどこに保存されますか？

**A**: `.pi/logs/dynamic-tools-audit.jsonl`にJSONL形式で保存されます。

#### Q: ツール定義のバックアップ方法は？

**A**: `.pi/tools/`ディレクトリをコピーしてください：

```bash
cp -r .pi/tools ./backup_tools_$(date +%Y%m%d)
```

詳細は[OPERATIONS.md](./OPERATIONS.md)の「バックアップとリストア」を参照してください。

#### Q: ツールの使用状況を確認したい

**A**: `list_dynamic_tools`または監査ログを使用：

```typescript
list_dynamic_tools({})
// 出力:
// - 使用回数: 15回 | 最終使用: 2024/01/15 12:00:00
```

```bash
# 監査ログからの集計
grep '"action":"tool.run"' .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r '.toolName' | sort | uniq -c | sort -rn
```

### セキュリティ

#### Q: どのようなコードがブロックされますか？

**A**: 以下のカテゴリのコードが検出されます：

| カテゴリ | 重大度 | 例 |
|---------|--------|-----|
| ファイル削除 | critical | `fs.rm`, `fs.unlink` |
| プロセス実行 | critical | `exec`, `spawn` |
| 動的コード実行 | critical | `eval`, `new Function` |
| ネットワークアクセス | high | `fetch`, `axios` |
| ファイル書き込み | high | `fs.writeFile` |
| 機密データ参照 | high | `password`, `api_key` |

#### Q: 外部APIにアクセスするツールを作成したい

**A**: ネットワークアクセスはhigh重大度で検出されます。以下に注意してください：

1. 信頼できるドメインのみにアクセス
2. タイムアウトを適切に設定
3. ドメインのバリデーションを実装

```typescript
async function execute(params) {
  const url = params.url;
  const allowedDomains = ["api.example.com"];
  const hostname = new URL(url).hostname;
  
  if (!allowedDomains.includes(hostname)) {
    return { error: "許可されていないドメインです" };
  }
  // フェッチ処理...
}
```

---

## 関連ドキュメント

- [README.md](./README.md) - システム概要、クイックスタート
- [API.md](./API.md) - APIリファレンス
- [SAFETY.md](./SAFETY.md) - 安全性ガイド、危険パターン一覧
- [OPERATIONS.md](./OPERATIONS.md) - 運用手順、リカバリ手順

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|----------|
| 2024-01-XX | 1.0.0 | 初版作成 |
