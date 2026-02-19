# 重複実装カタログ (Duplicate Implementation Catalog)

**作成日:** 2026-02-13
**作成者:** Implementer (build) - Core Delivery Team
**バージョン:** 1.0

---

## 概要

本ドキュメントは、`.pi/extensions/` 以下の7ファイルにおいて特定された重複実装の包括的カタログです。Phase 1の調査結果に基づき、完全一致重複11種類、類似実装5種類、合計37の重複インスタンスを特定しました。

### 影響範囲のサマリー

| カテゴリ | 重複種類数 | インスタンス数 | 予想削減行数 |
|---------|-----------|---------------|--------------|
| 完全一致重複 | 11 | 31 | 約240行 |
| 類似実装 | 5 | 6 | 約50行 |
| 合計 | 16 | 37 | 約290行 |

### 対象ファイル

- `.pi/extensions/loop.ts`
- `.pi/extensions/rsa.ts`
- `.pi/extensions/agent-teams.ts`
- `.pi/extensions/subagents.ts`
- `.pi/extensions/agent-usage-tracker.ts`
- `.pi/extensions/context-usage-dashboard.ts`
- `.pi/lib/retry-with-backoff.ts`

---

## 1. 完全一致重複 (Exact Duplicates)

### 1.1 toErrorMessage (4箇所)

**重要度:** 高
**影響:** ユーティリティ関数、エラーハンドリングに広く使用

#### コード定義

```typescript
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

#### 重複箇所

| ファイル | 行番号 | 使用箇所数 |
|---------|--------|-----------|
| `.pi/extensions/loop.ts` | ~2472 | 4回 |
| `.pi/extensions/rsa.ts` | ~775 | 3回 |
| `.pi/extensions/agent-teams.ts` | ~1350 | 5回以上 |
| `.pi/extensions/subagents.ts` | ~1240 | 5回以上 |

#### 影響分析

- 呼び出し元の推定合計: 20箇所以上
- 変更が必要な場合: 一箇所の修正で全てのエラーメッセージ処理に影響

#### 統合計画

1. `.pi/lib/common-utils.ts` を新規作成
2. `toErrorMessage` を共通化して配置
3. 各ファイルから重複実装を削除し、importを使用
4. テストケースを追加

---

### 1.2 toBoundedInteger (2箇所)

**重要度:** 中
**影響:** 設定バリデーションに使用

#### コード定義

```typescript
function toBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    return { ok: false, error: `${field} must be an integer.` };
  }
  if (resolved < min || resolved > max) {
    return { ok: false, error: `${field} must be in [${min}, ${max}].` };
  }
  return { ok: true, value: resolved };
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/loop.ts` | ~2438 |
| `.pi/extensions/rsa.ts` | ~678 |

#### 統合計画

1. `.pi/lib/validation-utils.ts` を新規作成
2. `toBoundedInteger` を移動
3. ユニットテスト（境界値テストを含む）を追加

---

### 1.3 looksLikeMarkdown (2箇所)

**重要度:** 中
**影響:** ライブモニターのプレビュー表示

#### コード定義

```typescript
function looksLikeMarkdown(input: string): boolean {
  const text = input.trim();
  if (!text) return false;
  if (/^#{1,6}\s+/m.test(text)) return true;
  if (/^\s*[-*+]\s+/m.test(text)) return true;
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  if (/```/.test(text)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  if (/^\s*>\s+/m.test(text)) return true;
  if (/^\s*\|.+\|\s*$/m.test(text)) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/`[^`]+`/.test(text)) return true;
  return false;
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/agent-teams.ts` | ~284 |
| `.pi/extensions/subagents.ts` | ~220 |

#### 統合計画

1. `.pi/lib/markdown-utils.ts` を新規作成
2. `looksLikeMarkdown` を移動
3. `renderPreviewWithMarkdown` と共に配置

---

### 1.4 renderPreviewWithMarkdown (2箇所)

**重要度:** 中
**影響:** ライブモニターの出力表示

#### コード定義

```typescript
function renderPreviewWithMarkdown(
  text: string,
  width: number,
  maxLines: number,
): { lines: string[]; renderedAsMarkdown: boolean } {
  if (!text.trim()) {
    return { lines: [], renderedAsMarkdown: false };
  }

  if (!looksLikeMarkdown(text)) {
    return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
  }

  try {
    const markdown = new Markdown(text, 0, 0, getMarkdownTheme());
    const rendered = markdown.render(Math.max(LIVE_MARKDOWN_PREVIEW_MIN_WIDTH, width));
    if (rendered.length === 0) {
      return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
    }
    if (rendered.length <= maxLines) {
      return { lines: rendered, renderedAsMarkdown: true };
    }
    return { lines: rendered.slice(rendered.length - maxLines), renderedAsMarkdown: true };
  } catch {
    return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
  }
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/agent-teams.ts` | ~298 |
| `.pi/extensions/subagents.ts` | ~234 |

#### 統合計画

1. `.pi/lib/markdown-utils.ts` に配置
2. `looksLikeMarkdown`, `toTailLines`, `estimateLineCount` と共に統合

---

### 1.5 appendTail (2箇所)

**重要度:** 中
**影響:** ライブモニターのテール表示

#### コード定義

```typescript
function appendTail(current: string, chunk: string, maxLength = LIVE_TAIL_LIMIT): string {
  if (!chunk) return current;
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
}
```

#### 重複箇所

| ファイル | 行番号 | デフォルトmaxLength |
|---------|--------|-------------------|
| `.pi/extensions/agent-teams.ts` | ~264 | 40,000 |
| `.pi/extensions/subagents.ts` | ~200 | 40,000 |

#### 統合計画

1. `.pi/lib/preview-utils.ts` を新規作成
2. `appendTail` を移動
3. 定数 `LIVE_TAIL_LIMIT` も共通化

---

### 1.6 countOccurrences (2箇所)

**重要度:** 低
**影響:** 改行カウント

#### コード定義

```typescript
function countOccurrences(input: string, target: string): number {
  if (!input || !target) return 0;
  let count = 0;
  let index = 0;
  while (index < input.length) {
    const found = input.indexOf(target, index);
    if (found < 0) break;
    count += 1;
    index = found + target.length;
  }
  return count;
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/agent-teams.ts` | ~272 |
| `.pi/extensions/subagents.ts` | ~208 |

#### 統合計画

1. `.pi/lib/string-utils.ts` を新規作成
2. `countOccurrences` を移動

---

### 1.7 estimateLineCount (2箇所)

**重要度:** 低
**影響:** 行数推定

#### コード定義

```typescript
function estimateLineCount(bytes: number, newlineCount: number, endsWithNewline: boolean): number {
  if (bytes <= 0) return 0;
  return newlineCount + (endsWithNewline ? 0 : 1);
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/agent-teams.ts` | ~292 |
| `.pi/extensions/subagents.ts` | ~228 |

#### 統合計画

1. `.pi/lib/preview-utils.ts` に配置
2. `appendTail`, `toTailLines` と共に統合

---

### 1.8 ensureDir (3箇所)

**重要度:** 高
**影響:** ディレクトリ作成の基本処理

#### コード定義

```typescript
function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/agent-teams.ts` | ~1736 |
| `.pi/extensions/agent-usage-tracker.ts` | ~84 |
| `.pi/extensions/subagents.ts` | ~1432 |

#### 統合計画

1. `.pi/lib/fs-utils.ts` を新規作成
2. `ensureDir` を配置
3. Node.jsの`mkdirSync`は`recursive: true`があれば存在チェックは不要だが、既存の動作を維持

---

### 1.9 formatDuration (2箇所)

**重要度:** 中
**影響:** 時間表示フォーマット

#### コード定義

```typescript
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/loop.ts` | ~2464 |
| `.pi/extensions/rsa.ts` | ~755 |

#### 統合計画

1. `.pi/lib/format-utils.ts` を新規作成
2. `formatDuration`, `formatDurationMs` を配置

---

### 1.10 formatDurationMs (2箇所)

**重要度:** 中
**影響:** 時間表示フォーマット

#### コード定義

```typescript
function formatDurationMs(item: SubagentLiveItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  const seconds = durationMs / 1000;
  return `${seconds.toFixed(1)}s`;
}
```

#### 重複箇所

| ファイル | 行番号 | 型 |
|---------|--------|-----|
| `.pi/extensions/agent-teams.ts` | ~338 | `TeamLiveItem` |
| `.pi/extensions/subagents.ts` | ~274 | `SubagentLiveItem` |

**注意:** 型が異なるが実装ロジックは同一

#### 統合計画

1. ジェネリック関数として実装
2. `.pi/lib/format-utils.ts` に配置

---

### 1.11 toFiniteNumber (3箇所)

**重要度:** 高 [WARNING]
**影響:** 型不一致による潜在的なバグ

#### コード定義（3種類の実装）

**パターンA (agent-usage-tracker.ts, retry-with-backoff.ts):**
```typescript
function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}
```

**パターンB (context-usage-dashboard.ts):**
```typescript
function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}
```

#### 重複箇所

| ファイル | 行番号 | 戻り値型 | 失敗時挙動 |
|---------|--------|----------|-----------|
| `.pi/extensions/agent-usage-tracker.ts` | ~189 | `number \| undefined` | `undefined` |
| `.pi/extensions/context-usage-dashboard.ts` | ~73 | `number` | `0` |
| `.pi/lib/retry-with-backoff.ts` | ~46 | `number \| undefined` | `undefined` |

**[WARNING]重要:** 戻り値型と失敗時挙動が不一致

#### 統合計画

1. 両パターンを提供するユーティリティ関数を作成
2. `toFiniteNumber(value: unknown): number | undefined` - 失敗時undefined
3. `toFiniteNumberOrZero(value: unknown): number` - 失敗時0
4. 既存コードを適切な関数に置き換え
5. 型チェックを強化

---

## 2. 類似実装 (Similar Implementations)

### 2.1 toTailLines (2箇所) - [WARNING]挙動差異あり

**重要度:** 高
**影響:** ライブモニターの表示挙動に差異

#### 実装比較

**agent-teams.ts (行332):**
```typescript
function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""));  // 空行を削除しない
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}
```

**subagents.ts (行268):**
```typescript
function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);  // 全ての空行を削除
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}
```

#### 挙動の違い

| 入力 | agent-teams.ts | subagents.ts |
|------|----------------|--------------|
| `"a\n\nb"` | `["a", "", "b"]` | `["a", "b"]` |
| `"a\n  \nb"` | `["a", "  ", "b"]` | `["a", "b"]` |
| `"a\n\n\nb"` | `["a", "", "", "b"]` | `["a", "b"]` |

#### リスク

- 同じ入力に対して異なる表示結果
- ライブモニターの一貫性が失われる可能性

#### 統合計画

1. どちらの挙動が正しいかを検証
   - agent-teams: 空行を残す（元のテキスト構造を維持）
   - subagents: 空行を削除（コンパクトな表示）
2. 共通の挙動を決定して統一
3. `.pi/lib/preview-utils.ts` に配置
4. 呼び出し元のテストを実施

---

### 2.2 classifyPressureError (2箇所)

**重要度:** 中
**影響:** エラー分類と再試行ポリシー

#### 実装比較

**agent-teams.ts:**
```typescript
function classifyPressureError(error: unknown): "rate_limit" | "timeout" | "capacity" | "other" {
  const message = toErrorMessage(error).toLowerCase();
  if (message.includes("runtime limit reached") || message.includes("capacity")) return "capacity";
  if (message.includes("timed out") || message.includes("timeout")) return "timeout";
  const statusCode = extractStatusCodeFromMessage(error);
  if (statusCode === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return "rate_limit";
  }
  return "other";
}
```

**subagents.ts:** （同一実装）

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/agent-teams.ts` | ~1355 |
| `.pi/extensions/subagents.ts` | ~1245 |

#### 統合計画

1. `.pi/lib/error-utils.ts` を新規作成
2. `classifyPressureError`, `extractStatusCodeFromMessage` と共に配置

---

### 2.3 extractStatusCodeFromMessage (3箇所)

**重要度:** 中
**影響:** ステータスコード抽出と再試行判断

#### 実装比較

**agent-teams.ts & subagents.ts:**
```typescript
function extractStatusCodeFromMessage(error: unknown): number | undefined {
  const message = toErrorMessage(error);
  const codeMatch = message.match(/\b(429|5\d{2})\b/);
  if (!codeMatch) return undefined;
  const code = Number(codeMatch[1]);
  return Number.isFinite(code) ? code : undefined;
}
```

**retry-with-backoff.ts (`extractRetryStatusCode`):**
```typescript
export function extractRetryStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const status = toFiniteNumber((error as { status?: unknown }).status);
    if (status !== undefined) {
      return clampInteger(status, 0, 999);
    }
    const statusCode = toFiniteNumber((error as { statusCode?: unknown }).statusCode);
    if (statusCode !== undefined) {
      return clampInteger(statusCode, 0, 999);
    }
  }
  const message = error instanceof Error ? error.message : String(error || "");
  const codeMatch = message.match(/\b(429|401|403|5\d{2})\b/);
  if (codeMatch) {
    return Number(codeMatch[1]);
  }
  if (/too many requests|rate[\s-]?limit|quota exceeded/i.test(message)) {
    return 429;
  }
  return undefined;
}
```

#### 違い

- retry-with-backoff: オブジェクトからstatus/statusCodeを抽出、401/403も検出
- agent-teams/subagents: メッセージからのみ抽出、429/5xxのみ

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/agent-teams.ts` | ~1335 |
| `.pi/extensions/subagents.ts` | ~1228 |
| `.pi/lib/retry-with-backoff.ts` | ~97 (`extractRetryStatusCode`) |

#### 統合計画

1. retry-with-backoffの`extractRetryStatusCode`をより完全な実装として採用
2. `.pi/lib/error-utils.ts` に配置
3. 既存の`extractStatusCodeFromMessage`を置き換え
4. 呼び出し元の挙動を検証

---

### 2.4 isCancelledErrorMessage (2箇所)

**重要度:** 中
**影響:** キャンセル検出

#### コード定義

```typescript
function isCancelledErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("中断") ||
    message.includes("キャンセル")
  );
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------|
| `.pi/extensions/agent-teams.ts` | ~1380 |
| `.pi/extensions/subagents.ts` | ~1270 |

#### 統合計画

1. `.pi/lib/error-utils.ts` に配置
2. 他のエラー検出関数と共に管理

---

### 2.5 isTimeoutErrorMessage (2箇所)

**重要度:** 中
**影響:** タイムアウト検出

#### コード定義

```typescript
function isTimeoutErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("time out") ||
    message.includes("時間切れ")
  );
}
```

#### 重複箇所

| ファイル | 行番号 |
|---------|--------| 
| `.pi/extensions/agent-teams.ts` | ~1390 |
| `.pi/extensions/subagents.ts` | ~1280 |

#### 統合計画

1. `.pi/lib/error-utils.ts` に配置
2. 他のエラー検出関数と共に管理

---

## 3. 統合計画の提案

### 3.1 新規共通ライブラリ構造

```
.pi/lib/
├── common-utils.ts       # toErrorMessage, その他基本ユーティリティ
├── error-utils.ts        # エラー関連関数群
├── string-utils.ts       # countOccurrences, その他文字列操作
├── validation-utils.ts   # toBoundedInteger, バリデーション
├── format-utils.ts       # formatDuration, formatDurationMs
├── preview-utils.ts      # appendTail, toTailLines, estimateLineCount
├── markdown-utils.ts     # looksLikeMarkdown, renderPreviewWithMarkdown
└── fs-utils.ts          # ensureDir
```

### 3.2 優先順位付け

| 優先度 | 重複実装 | 理由 |
|--------|----------|------|
| P0 | toTailLines | [WARNING]挙動差異による表示不整合リスク |
| P0 | toFiniteNumber | [WARNING]型不一致による潜在的なバグ |
| P1 | toErrorMessage | 呼び出し箇所が多い、変更影響が大きい |
| P1 | ensureDir | 基本的なファイル操作、頻繁に使用 |
| P2 | toBoundedInteger | バリデーション、複数箇所で使用 |
| P2 | looksLikeMarkdown, renderPreviewWithMarkdown | ライブモニター表示 |
| P2 | classifyPressureError | エラー分類、再試行ポリシー |
| P3 | appendTail | ライブモニターのテール表示 |
| P3 | countOccurrences | 簡単な実装、影響範囲小 |
| P3 | estimateLineCount | 簡単な実装、影響範囲小 |
| P3 | formatDuration, formatDurationMs | 表示フォーマット |
| P3 | isCancelledErrorMessage, isTimeoutErrorMessage | エラー検出 |

### 3.3 移行手順

#### Phase A: 共通ライブラリ作成 (P0-P1)

1. `.pi/lib/` 以下に新規ユーティリティファイルを作成
2. P0-P1の関数を移動・統合
3. 適切なエクスポート定義
4. ユニットテストを追加

#### Phase B: 既存ファイルの更新 (P0-P1)

1. 各拡張機能ファイルでimportを追加
2. 重複実装を削除
3. ビルドとテストを実行
4. 動作検証

#### Phase C: 残り機能の統合 (P2-P3)

1. P2-P3の関数を共通ライブラリに移動
2. 既存ファイルを更新
3. 全体の統合テスト
4. ドキュメント更新

### 3.4 リスク管理

| リスク | 対策 |
|--------|------|
| toTailLinesの挙動変更 | 両方の挙動をテストで検証、採用する挙動を明確化 |
| toFiniteNumberの型変更 | 両パターンの関数を提供、既存コードを適切に置換 |
| 破壊的変更の影響 | 各フェーズでテストを徹底、リグレッション検出 |
| 循環参照のリスク | 共通ライブラリは他のファイルをimportしない構造に |

---

## 4. テスト計画

### 4.1 ユニットテスト要件

| 関数 | 必要なテストケース |
|------|------------------|
| toErrorMessage | Errorインスタンス, 文字列, null, undefined, 数値, オブジェクト |
| toBoundedInteger | 範囲内, 範囲外, 整数以外, undefined, NaN, Infinity |
| toFiniteNumber | 有効数値, 無効数値, 文字列数値, null, undefined |
| toTailLines | 空文字, 単一行, 複数行, 末尾空行, 制限超過 |
| looksLikeMarkdown | 各種Markdown構文, プレーンテキスト |
| classifyPressureError | 各種エラーメッセージ, ステータスコード |
| ensureDir | 既存ディレクトリ, 新規ディレクトリ, ネストしたパス |

### 4.2 統合テスト要件

- ライブモニターの表示が統合前と同等であること
- エラーハンドリングの挙動が変わらないこと
- 全拡張機能の動作検証

---

## 5. 推定作業量

| フェーズ | 見積もり時間 | 説明 |
|---------|-------------|------|
| Phase A: 共通ライブラリ作成 | 2-3時間 | P0-P1の関数移動、テスト作成 |
| Phase B: 既存ファイル更新 | 1-2時間 | import追加、削除、動作検証 |
| Phase C: 残り機能統合 | 1-2時間 | P2-P3の関数移動、全体テスト |
| 予備 | 1時間 | 予期せぬ問題対応 |
| 合計 | 5-8時間 |

---

## 6. 結論

本カタログにより、以下のことが明らかになりました:

1. **16種類の重複実装**を特定、合計37のインスタンスが存在
2. 約290行のコード削減が可能
3. **toTailLinesの挙動差異**と**toFiniteNumberの型不一致**が緊急の対処が必要
4. 共通ライブラリ構造を提案、段階的な移行計画を策定

reviewerの懸念通り、toTailLinesとtoFiniteNumberは優先的に対処すべきリスクです。Implementerの観点からは、以下の追加点を考慮します:

1. **バージョン管理**: 共通ライブラリのバージョンを明確化し、破壊的変更を追跡可能にする
2. **ドキュメント化**: 各関数の使用例とベストプラクティスを記載
3. **型安全性**: TypeScriptの厳密な型チェックを維持
4. **パフォーマンス**: 文字列操作などの最適化が必要な関数のプロファイリング

次のステップは、Phase Aの共通ライブラリ作成から開始することを推奨します。

---

**文書履歴:**

| バージョン | 日付 | 作成者 | 変更内容 |
|---------|------|--------|---------|
| 1.0 | 2026-02-13 | Implementer (build) | 初版作成 |
