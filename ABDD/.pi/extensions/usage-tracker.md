---
title: Usage Tracker Extension
category: reference
audience: daily-user
last_updated: 2026-02-18
tags: [extension, usage, cost, analytics, heatmap]
related: [agent-usage-tracker.md]
---

# Usage Tracker Extension

LLMモデルのコストと日次使用量ヒートマップを表示する拡張機能。ファイル単位キャッシュで最適化済み。

## 概要

この拡張機能は、piのセッションログから使用量データを収集し、以下を表示する：

- 総コスト
- モデル別コスト
- 日次アクティビティヒートマップ

## スラッシュコマンド

### /usage

```bash
/usage
```

インタラクティブな使用量ダッシュボードを表示。

## インターフェース

### キーバインド

| キー | アクション |
|------|-----------|
| `1` | 1週間表示に切り替え |
| `2` | 12週間表示に切り替え |
| `r` | データを再読み込み |
| `q` / `Escape` | ダッシュボードを閉じる |

### 表示内容

#### 総コスト

```
Total Cost  $12.34
Models      5
```

#### モデル別コスト（上位8件）

```
#  model                 cost        share   bar
 1 claude-3-5-sonnet       $5.67     46.0%  ##########--------
 2 gpt-4o                  $3.21     26.0%  ######------------
 ...
```

#### 日次アクティビティヒートマップ

```
Sun ░ ▒ ▓ █ ░ ▒ ▓ █ ░ ▒ ▓
Mon ░ ▒ ▓ █ ░ ▒ ▓ █ ░ ▒ ▓
Tue ░ ▒ ▓ █ ░ ▒ ▓ █ ░ ▒ ▓
Wed ░ ▒ ▓ █ ░ ▒ ▓ █ ░ ▒ ▓
Thu ░ ▒ ▓ █ ░ ▒ ▓ █ ░ ▒ ▓
Fri ░ ▒ ▓ █ ░ ▒ ▓ █ ░ ▒ ▓
Sat ░ ▒ ▓ █ ░ ▒ ▓ █ ░ ▒ ▓
```

凡例:
- `-` : $0（使用なし）
- `░` : 低使用（閾値1以下）
- `▒` : 中使用（閾値2以下）
- `▓` : 高使用（閾値3以下）
- `█` : ピーク（閾値3超過）

## 型定義

### FileStats

```typescript
interface FileStats {
  mtimeMs: number;                              // 最終更新時刻（ミリ秒）
  byModel: Record<string, number>;              // モデル別コスト
  byDate: Record<string, number>;               // 日別コスト
  byDateModel: Record<string, Record<string, number>>;  // 日別・モデル別コスト
}
```

### CacheData

```typescript
interface CacheData {
  files: Record<string, FileStats>;  // ファイルパス -> 統計
}
```

## 主要な関数

### collectData

```typescript
function collectData(): {
  byModel: Map<string, number>;
  byDate: Map<string, number>;
  byDateModel: Map<string, Map<string, number>>;
}
```

セッションディレクトリから使用量データを収集。

**処理フロー**:
1. キャッシュ読み込み
2. セッションディレクトリ一覧取得
3. 各JSONLファイルのmtimeチェック
4. 変更があるファイルのみパース
5. キャッシュ更新・保存

### parseUsageFile

```typescript
function parseUsageFile(filePath: string): {
  byModel: Record<string, number>;
  byDate: Record<string, number>;
  byDateModel: Record<string, Record<string, number>>;
}
```

単一のJSONLファイルをパース。

**処理**:
- 最終1000行のみ処理（パフォーマンス最適化）
- `type: "message"`のエントリからコスト抽出
- `data.message.usage.cost.total`を使用

### loadCache

```typescript
function loadCache(): CacheData | null
```

キャッシュファイルからデータを読み込み。

**キャッシュファイル**: `~/.pi/extensions/usage-cache.json`

### saveCache

```typescript
function saveCache(data: CacheData): void
```

キャッシュデータをファイルに保存。

### summarizeRange

```typescript
function summarizeRange(
  byDate: Map<string, number>,
  byDateModel: Map<string, Map<string, number>>,
  weeksCount: number,
): { total: number; byModel: Map<string, number> }
```

指定期間のサマリーを計算。

### drawHeatmap

```typescript
function drawHeatmap(
  byDate: Map<string, number>,
  weeksCount: number,
  theme: any,
): { lines: string[]; rangeLine: string; legendLine: string }
```

日次ヒートマップを描画。

**閾値計算**:
- `t1` = maxCost * 0.1
- `t2` = maxCost * 0.35
- `t3` = maxCost * 0.7

### formatCost

```typescript
function formatCost(n: number): string
```

コストを適切な精度でフォーマット。

- `$1`以上: `$X.XX`
- `$0.01`以上: `$X.XXXX`
- それ以外: `$X.XXXXXX`

### getRangeKeys

```typescript
function getRangeKeys(byDate: Map<string, number>, weeksCount: number): string[]
```

表示範囲の日付キー配列を生成。

## ディレクトリ構造

```
~/.pi/
├── extensions/
│   └── usage-cache.json      # キャッシュファイル
└── agent/
    └── sessions/             # セッションログディレクトリ
        ├── session-xxx/
        │   ├── messages.jsonl
        │   └── ...
        └── ...
```

## エクスポート

```typescript
export default function (pi: ExtensionAPI): void
```

拡張機能の登録関数。`/usage`コマンドを登録。

## 依存関係

- `node:fs` - ファイルシステム操作
- `node:os` - ホームディレクトリ取得
- `node:path` - パス操作
- `@mariozechner/pi-coding-agent` - ExtensionAPI
- `../lib/comprehensive-logger` - ログ出力

## エラーハンドリング

- キャッシュディレクトリ作成エラー: 無視して継続
- キャッシュ読み込みエラー: 新規キャッシュ作成
- キャッシュ保存エラー: パフォーマンス低下のみで機能に影響なし
- ファイル読み込みエラー: 空の統計で返す
- 不正なJSON行: スキップして継続

## パフォーマンス最適化

### ファイル単位キャッシュ

各JSONLファイルの`mtimeMs`を記録し、変更がない場合はキャッシュを使用。これにより、2回目以降の表示が高速化される。

### 行数制限

`parseUsageFile`で最終1000行のみ処理。大容量ファイルでも高速に動作。

## ログ出力

`comprehensive-logger`を使用して操作をログ記録。

```typescript
const operationId = logger.startOperation("direct" as OperationType, "usage_command", {
  task: "LLM使用量統計の表示",
  params: {},
});
```
