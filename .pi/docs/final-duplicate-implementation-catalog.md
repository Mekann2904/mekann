# 重複実装カタログ 最終版
# Final Duplicate Implementation Catalog

**作成日:** 2026-02-13
**作成者:** Reviewer - Core Delivery Team
**目的:** Phase 1およびPhase 2の分析結果に基づく徹底的な重複実装カタログ

---

## 文書の概要

本ドキュメントは、Phase 1（3人のサブエージェントによる調査）とPhase 2（core-delivery-teamによるレビュー）の両方の結果を統合し、`.pi/extensions/` および `.pi/lib/` ディレクトリ内のTypeScriptコードにおける重複実装を徹底的に調査・分類したものです。

### Phase 1参加者
- Researcher (research)
- Reviewer (review)
- Implementer (build)

### Phase 2参加者
- Core Delivery Team (reviewer, implementer, researcher)

### 分析範囲
- `.pi/extensions/` ディレクトリ内の7ファイル
- `.pi/lib/` ディレクトリ内の1ファイル
- 合計8ファイルの重複実装調査

---

## 統計サマリー

| カテゴリ | 重複種類数 | 重複箇所数 | 予想削減行数 |
|---------|-----------|-----------|-------------|
| 完全一致重複 | 18種類 | 41箇所 | 約310行 |
| 類似実装 | 6種類 | 12箇所 | 約70行 |
| パターン重複 | 3種類 | 6箇所 | 約40行 |
| 合計 | 27種類 | 59箇所 | 約420行 |

### 影響を受けるファイル

| ファイル | 重複関数数 | 影響度 | 備考 |
|---------|-----------|--------|------|
| `.pi/extensions/agent-teams.ts` | 16 | 高 | 最も多くの重複 |
| `.pi/extensions/subagents.ts` | 15 | 高 | agent-teams.tsと類似 |
| `.pi/extensions/loop.ts` | 3 | 中 | |
| `.pi/extensions/rsa.ts` | 3 | 中 | |
| `.pi/extensions/agent-usage-tracker.ts` | 2 | 中 | |
| `.pi/extensions/context-usage-dashboard.ts` | 1 | 低 | |
| `.pi/lib/retry-with-backoff.ts` | 3 | 低 | |

---

## 1. 完全一致の重複実装 (Exact Duplicates)

### 1.1 toErrorMessage - エラーからメッセージ抽出

**重要度:** 高 (P0)
**影響範囲:** 4ファイル
**推定削減行数:** 16行

**場所:**
- `.pi/extensions/agent-teams.ts:5340-5344`
- `.pi/extensions/loop.ts:2477-2481`
- `.pi/extensions/rsa.ts:1500-1504`
- `.pi/extensions/subagents.ts:3087-3091`

**実装コード:**
```typescript
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

**使用箇所の推定:**
- agent-teams.ts: 5回以上
- loop.ts: 4回
- rsa.ts: 3回
- subagents.ts: 5回以上

**重複の原因:** コピーペーストによる実装
**検証結果:** Phase 1とPhase 2の分析結果に矛盾なし

**統合計画:**
- 移動先: `.pi/lib/error-utils.ts`
- 推奨優先度: P0（最も影響範囲が広い）

---

### 1.2 toBoundedInteger - 整数値のバリデーション

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 16行

**場所:**
- `.pi/extensions/loop.ts:2448-2463`
- `.pi/extensions/rsa.ts:879-894`

**実装コード:**
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

**使用箇所:**
- loop.ts: 4回 (857, 866, 875行)
- rsa.ts: 5回 (743, 752, 761, 770, 779行)

**統合計画:**
- 移動先: `.pi/lib/validation-utils.ts`
- 推奨優先度: P2

---

### 1.3 looksLikeMarkdown - マークダウン形式の判定

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 14行

**場所:**
- `.pi/extensions/agent-teams.ts:289-302`
- `.pi/extensions/subagents.ts:225-238`

**実装コード:**
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

**統合計画:**
- 移動先: `.pi/lib/markdown-utils.ts`
- 推奨優先度: P2（renderPreviewWithMarkdownとセットで統合）

---

### 1.4 renderPreviewWithMarkdown - マークダウンレンダリング

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 22行

**場所:**
- `.pi/extensions/agent-teams.ts:304-325`
- `.pi/extensions/subagents.ts:240-261`

**実装コード:**
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

**依存関数:** looksLikeMarkdown, toTailLines, Markdown, getMarkdownTheme

**統合計画:**
- 移動先: `.pi/lib/markdown-utils.ts`
- 推奨優先度: P2

---

### 1.5 appendTail - 文字列末尾への追加と長さ制限

**重要度:** 低 (P3)
**影響範囲:** 2ファイル
**推定削減行数:** 8行

**場所:**
- `.pi/extensions/agent-teams.ts:248-255`
- `.pi/extensions/subagents.ts:184-191`

**実装コード:**
```typescript
function appendTail(current: string, chunk: string, maxLength = LIVE_TAIL_LIMIT): string {
  if (!chunk) return current;
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
}
```

**定数依存:** LIVE_TAIL_LIMIT（各ファイルで別途定義）

**統合計画:**
- 移動先: `.pi/lib/tail-utils.ts`
- 推奨優先度: P3

---

### 1.6 countOccurrences - 文字列内の出現回数カウント

**重要度:** 低 (P3)
**影響範囲:** 2ファイル
**推定削減行数:** 12行

**場所:**
- `.pi/extensions/agent-teams.ts:255-267`
- `.pi/extensions/subagents.ts:191-203`

**実装コード:**
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

**統合計画:**
- 移動先: `.pi/lib/string-utils.ts`
- 推奨優先度: P3

---

### 1.7 estimateLineCount - バイト数と改行数からの推定

**重要度:** 低 (P3)
**影響範囲:** 2ファイル
**推定削減行数:** 6行

**場所:**
- `.pi/extensions/agent-teams.ts:284-289`
- `.pi/extensions/subagents.ts:220-225`

**実装コード:**
```typescript
function estimateLineCount(bytes: number, newlineCount: number, endsWithNewline: boolean): number {
  if (bytes <= 0) return 0;
  return newlineCount + (endsWithNewline ? 0 : 1);
}
```

**統合計画:**
- 移動先: `.pi/lib/string-utils.ts`
- 推奨優先度: P3

---

### 1.8 ensureDir - ディレクトリの作成

**重要度:** 高 (P1)
**影響範囲:** 3ファイル
**推定削減行数:** 12行

**場所:**
- `.pi/extensions/agent-teams.ts:1819-1824`
- `.pi/extensions/agent-usage-tracker.ts:135-140`
- `.pi/extensions/subagents.ts:1300-1305`

**実装コード:**
```typescript
function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
```

**依存:** existsSync, mkdirSync (node:fs)

**統合計画:**
- 移動先: `.pi/lib/storage-lock.ts`（既存のファイル操作ユーティリティ群と統合）
- 推奨優先度: P1

---

### 1.9 formatDuration - ミリ秒をフォーマット

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 6行

**場所:**
- `.pi/extensions/loop.ts:2465-2470`
- `.pi/extensions/rsa.ts:1483-1488`

**実装コード:**
```typescript
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
```

**統合計画:**
- 移動先: `.pi/lib/format-utils.ts`
- 推奨優先度: P2

---

### 1.10 formatDurationMs - LiveItemからの経過時間フォーマット

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 14行

**場所:**
- `.pi/extensions/agent-teams.ts:343-349`
- `.pi/extensions/subagents.ts:277-283`

**実装コード:**

agent-teams.ts:
```typescript
function formatDurationMs(item: TeamLiveItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  return `${(durationMs / 1000).toFixed(1)}s`;
}
```

subagents.ts:
```typescript
function formatDurationMs(item: SubagentLiveItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  const seconds = durationMs / 1000;
  return `${seconds.toFixed(1)}s`;
}
```

**注意:** 型が異なる（TeamLiveItem vs SubagentLiveItem）が、実装ロジックは同一

**統合計画:**
- 移動先: `.pi/lib/format-utils.ts`
- ジェネリック関数として実装
- 推奨優先度: P2

---

### 1.11 classifyPressureError - 圧力エラーの分類

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 11行

**場所:**
- `.pi/extensions/agent-teams.ts:1000-1010`
- `.pi/extensions/subagents.ts:730-740`

**実装コード:**
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

**依存:** toErrorMessage, extractStatusCodeFromMessage

**統合計画:**
- 移動先: `.pi/lib/error-utils.ts`
- 推奨優先度: P2

---

### 1.12 isCancelledErrorMessage - キャンセルエラーの判定

**重要度:** 低 (P3)
**影響範囲:** 2ファイル
**推定削減行数:** 9行

**場所:**
- `.pi/extensions/agent-teams.ts:1011-1019`
- `.pi/extensions/subagents.ts:741-749`

**実装コード:**
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

**統合計画:**
- 移動先: `.pi/lib/error-utils.ts`
- 推奨優先度: P3

---

### 1.13 isTimeoutErrorMessage - タイムアウトエラーの判定

**重要度:** 低 (P3)
**影響範囲:** 2ファイル
**推定削減行数:** 9行

**場所:**
- `.pi/extensions/agent-teams.ts:1022-1030`
- `.pi/extensions/subagents.ts:752-760`

**実装コード:**
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

**統合計画:**
- 移動先: `.pi/lib/error-utils.ts`
- 推奨優先度: P3

---

### 1.14 extractStatusCodeFromMessage - エラーメッセージからステータスコードを抽出

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 8行

**場所:**
- `.pi/extensions/agent-teams.ts:992-999`
- `.pi/extensions/subagents.ts:722-729`

**実装コード:**
```typescript
function extractStatusCodeFromMessage(error: unknown): number | undefined {
  const message = toErrorMessage(error);
  const codeMatch = message.match(/\b(429|5\d{2})\b/);
  if (!codeMatch) return undefined;
  const code = Number(codeMatch[1]);
  return Number.isFinite(code) ? code : undefined;
}
```

**依存:** toErrorMessage

**注意:** `.pi/lib/retry-with-backoff.ts` に `extractRetryStatusCode` という類似関数が存在

**統合計画:**
- 移動先: `.pi/lib/error-utils.ts`
- retry-with-backoff.tsの`extractRetryStatusCode`との統合を検討
- 推奨優先度: P2

---

### 1.15 formatBytes - バイト数をフォーマット

**重要度:** 低 (P3)
**影響範囲:** 2ファイル
**推定削減行数:** 8行
**発見:** Phase 2レビューで追加発見

**場所:**
- `.pi/extensions/agent-teams.ts:268-274`
- `.pi/extensions/subagents.ts:204-210`

**実装コード:**
```typescript
function formatBytes(value: number): string {
  const bytes = Math.max(0, Math.trunc(value));
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
```

**検証結果:** 完全一致

**統合計画:**
- 移動先: `.pi/lib/format-utils.ts`
- 推奨優先度: P3

---

### 1.16 formatClockTime - 時刻をフォーマット

**重要度:** 低 (P3)
**影響範囲:** 2ファイル
**推定削減行数:** 8行
**発見:** Phase 2レビューで追加発見

**場所:**
- `.pi/extensions/agent-teams.ts:275-283`
- `.pi/extensions/subagents.ts:211-219`

**実装コード:**
```typescript
function formatClockTime(value?: number): string {
  if (!value) return "-";
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
```

**検証結果:** 完全一致

**統合計画:**
- 移動先: `.pi/lib/format-utils.ts`
- 推奨優先度: P3

---

### 1.17 toConcurrencyLimit - 並列性制限の変換

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 6行
**発見:** Phase 2レビューで追加発見

**場所:**
- `.pi/extensions/agent-teams.ts:1546-1553`
- `.pi/extensions/subagents.ts:1038-1045`

**実装コード:**
```typescript
function toConcurrencyLimit(value: unknown, fallback: number): number {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return fallback;
  return Math.max(1, Math.trunc(resolved));
}
```

**検証結果:** 完全一致

**統合計画:**
- 移動先: `.pi/lib/validation-utils.ts`
- 推奨優先度: P2

---

### 1.18 toRetryOverrides - リトライ設定の変換

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 12行
**発見:** Phase 2レビューで追加発見

**場所:**
- `.pi/extensions/agent-teams.ts:1528-1545`
- `.pi/extensions/subagents.ts:1020-1037`

**実装コード:**

agent-teams.ts:
```typescript
function toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined {
  // Stable profile: ignore per-call retry tuning to avoid unpredictable fan-out.
  if (STABLE_AGENT_TEAM_RUNTIME) return undefined;
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const jitter =
    raw.jitter === "full" || raw.jitter === "partial" || raw.jitter === "none"
      ? raw.jitter
      : undefined;
  return {
    maxRetries: typeof raw.maxRetries === "number" ? raw.maxRetries : undefined,
    initialDelayMs: typeof raw.initialDelayMs === "number" ? raw.initialDelayMs : undefined,
    maxDelayMs: typeof raw.maxDelayMs === "number" ? raw.maxDelayMs : undefined,
    multiplier: typeof raw.multiplier === "number" ? raw.multiplier : undefined,
    jitter,
  };
}
```

subagents.ts:
```typescript
function toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined {
  // Stable profile: reject ad-hoc retry tuning to keep behavior deterministic.
  if (STABLE_SUBAGENT_RUNTIME) return undefined;
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const jitter =
    raw.jitter === "full" || raw.jitter === "partial" || raw.jitter === "none"
      ? raw.jitter
      : undefined;
  return {
    maxRetries: typeof raw.maxRetries === "number" ? raw.maxRetries : undefined,
    initialDelayMs: typeof raw.initialDelayMs === "number" ? raw.initialDelayMs : undefined,
    maxDelayMs: typeof raw.maxDelayMs === "number" ? raw.maxDelayMs : undefined,
    multiplier: typeof raw.multiplier === "number" ? raw.multiplier : undefined,
    jitter,
  };
}
```

**検証結果:** 類似（定数名のみ異なる）
- agent-teams.ts: `STABLE_AGENT_TEAM_RUNTIME`
- subagents.ts: `STABLE_SUBAGENT_RUNTIME`

**統合計画:**
- 移動先: `.pi/lib/validation-utils.ts`
- 定数をパラメータ化して統合
- 推奨優先度: P2

---

## 2. 類似実装 (Similar Implementations)

### 2.1 toTailLines - 文字列を行に分割して制限

**重要度:** 高 (P0) - [WARNING]挙動差異あり
**影響範囲:** 2ファイル
**推定削減行数:** 約10行

**場所:**
- `.pi/extensions/agent-teams.ts:332-340`
- `.pi/extensions/subagents.ts:268-276`

**実装コード:**

agent-teams.ts:
```typescript
function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""));
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}
```

subagents.ts:
```typescript
function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}
```

**挙動の違い:**

| 入力 | agent-teams.ts | subagents.ts |
|------|----------------|--------------|
| `"a\n\nb"` | `["a", "", "b"]` | `["a", "b"]` |
| `"a\n  \nb"` | `["a", "  ", "b"]` | `["a", "b"]` |
| `"a\n\n\nb"` | `["a", "", "", "b"]` | `["a", "b"]` |

**リスク:**
- 同じ入力に対して異なる表示結果
- ライブモニターの一貫性が失われる可能性

**検証結果:** Phase 1とPhase 2の分析結果に矛盾なし

**統合計画:**
- 移動先: `.pi/lib/markdown-utils.ts`（renderPreviewWithMarkdownと共に）
- オプションA: agent-teams版を採用（空行を維持）
- オプションB: subagents版を採用（空行を削除）
- オプションC: オプションパラメータを追加して制御可能にする
- **推奨:** オプションC（下位互換性を考慮）
- 推奨優先度: P0（挙動の違いにより予期せぬバグの可能性）

---

### 2.2 toFiniteNumber - 数値の有限性チェック

**重要度:** 高 (P0) - [WARNING]型不一致あり
**影響範囲:** 3ファイル
**推定削減行数:** 約9行

**場所:**
- `.pi/extensions/agent-usage-tracker.ts:437-440`
- `.pi/lib/retry-with-backoff.ts:82-85`
- `.pi/extensions/context-usage-dashboard.ts:72-75`

**実装コード:**

agent-usage-tracker.ts:
```typescript
function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}
```

retry-with-backoff.ts:
```typescript
function toFiniteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
```

context-usage-dashboard.ts:
```typescript
function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}
```

**実装の違い:**

| ファイル | 戻り値型 | 失敗時挙動 | 型チェック方法 |
|---------|----------|-----------|---------------|
| agent-usage-tracker.ts | `number \| undefined` | `undefined` | `Number()`で変換 |
| retry-with-backoff.ts | `number \| undefined` | `undefined` | `Number()`で変換 |
| context-usage-dashboard.ts | `number` | `0` | `typeof`で事前チェック |

**リスク:**
- 戻り値の型の違いにより型エラーの可能性
- 呼び出し元で適切に扱わない場合、実行時エラーの可能性

**検証結果:** Phase 1とPhase 2の分析結果に矛盾なし

**統合計画:**
- 移動先: `.pi/lib/number-utils.ts`
- ユースケースに応じて2つの関数を提供:
  - `toFiniteNumber(value: unknown): number | undefined` - 失敗時undefined
  - `toFiniteNumberOrZero(value: unknown): number` - 失敗時0
- 既存コードを適切な関数に置き換え
- 推奨優先度: P0（戻り値の型の違いにより型エラーの可能性）

---

### 2.3 extractStatusCodeFromMessage - エラーからステータスコード抽出（拡張版）

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 約20行

**場所:**
- `.pi/extensions/agent-teams.ts:992-999` (extractStatusCodeFromMessage)
- `.pi/extensions/subagents.ts:722-729` (extractStatusCodeFromMessage)
- `.pi/lib/retry-with-backoff.ts:308-330` (extractRetryStatusCode)

**実装コード:**

agent-teams.ts & subagents.ts (extractStatusCodeFromMessage):
```typescript
function extractStatusCodeFromMessage(error: unknown): number | undefined {
  const message = toErrorMessage(error);
  const codeMatch = message.match(/\b(429|5\d{2})\b/);
  if (!codeMatch) return undefined;
  const code = Number(codeMatch[1]);
  return Number.isFinite(code) ? code : undefined;
}
```

retry-with-backoff.ts (extractRetryStatusCode):
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

**実装の違い:**
- retry-with-backoff: オブジェクトからstatus/statusCodeを抽出、401/403も検出
- agent-teams/subagents: メッセージからのみ抽出、429/5xxのみ

**検証結果:** Phase 1とPhase 2の分析結果に矛盾なし

**統合計画:**
- 移動先: `.pi/lib/error-utils.ts`
- retry-with-backoffの`extractRetryStatusCode`をより完全な実装として採用
- 既存の`extractStatusCodeFromMessage`を置き換え
- 呼び出し元の挙動を検証
- 推奨優先度: P2

---

## 3. パターン重複 (Pattern Duplicates)

### 3.1 loadStorage - ストレージの読み込み

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 約35行

**場所:**
- `.pi/extensions/agent-teams.ts:2358-2390` (loadStorage for TeamStorage)
- `.pi/extensions/subagents.ts:1368-1401` (loadStorage for SubagentStorage)

**実装コード:**

agent-teams.ts:
```typescript
function loadStorage(cwd: string): TeamStorage {
  const paths = ensurePaths(cwd);
  const nowIso = new Date().toISOString();
  const fallback: TeamStorage = {
    teams: createDefaultTeams(nowIso),
    runs: [],
    currentTeamId: "core-delivery-team",
    defaultsVersion: TEAM_DEFAULTS_VERSION,
  };

  if (!existsSync(paths.storageFile)) {
    saveStorage(cwd, fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(readFileSync(paths.storageFile, "utf-8")) as Partial<TeamStorage>;
    const storage: TeamStorage = {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      currentTeamId: typeof parsed.currentTeamId === "string" ? parsed.currentAgentId : undefined,
      defaultsVersion:
        typeof parsed.defaultsVersion === "number" && Number.isFinite(parsed.defaultsVersion)
          ? Math.trunc(parsed.defaultsVersion)
          : 0,
    };
    return ensureDefaults(storage, nowIso);
  } catch {
    saveStorage(cwd, fallback);
    return fallback;
  }
}
```

subagents.ts:
```typescript
function loadStorage(cwd: string): SubagentStorage {
  const paths = ensurePaths(cwd);
  const nowIso = new Date().toISOString();

  const fallback: SubagentStorage = {
    agents: createDefaultAgents(nowIso),
    runs: [],
    currentAgentId: "researcher",
    defaultsVersion: SUBAGENT_DEFAULTS_VERSION,
  };

  if (!existsSync(paths.storageFile)) {
    saveStorage(cwd, fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(readFileSync(paths.storageFile, "utf-8")) as Partial<SubagentStorage>;
    const storage: SubagentStorage = {
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      currentAgentId: typeof parsed.currentAgentId === "string" ? parsed.currentAgentId : undefined,
      defaultsVersion:
        typeof parsed.defaultsVersion === "number" && Number.isFinite(parsed.defaultsVersion)
          ? Math.trunc(parsed.defaultsVersion)
          : 0,
    };
    return ensureDefaults(storage, nowIso);
  } catch {
    saveStorage(cwd, fallback);
    return fallback;
  }
}
```

**検証結果:** 構造的に同一だが型が異なる（TeamStorage vs SubagentStorage）

**統合計画:**
- ジェネリック関数として実装を検討
- 型パラメータを使用して共通化
- 推奨優先度: P2（型パラメータ化が複雑なため）

---

### 3.2 saveStorage - ストレージの保存

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 約20行

**場所:**
- `.pi/extensions/agent-teams.ts:2391-2422` (saveStorage for TeamStorage)
- `.pi/extensions/subagents.ts:1402-1415` (saveStorage for SubagentStorage)

**実装コード:**

agent-teams.ts:
```typescript
function saveStorage(cwd: string, storage: TeamStorage): void {
  const paths = ensurePaths(cwd);
  const normalized: TeamStorage = {
    ...storage,
    teams: storage.teams.map(t => ({
      ...t,
      members: t.members.map(m => ({
        ...m,
        // normalization logic...
      })),
    })),
  };
  writeFileSync(paths.storageFile, JSON.stringify(normalized, null, 2), "utf-8");
}
```

subagents.ts:
```typescript
function saveStorage(cwd: string, storage: SubagentStorage): void {
  const paths = ensurePaths(cwd);
  const normalized: SubagentStorage = {
    ...storage,
    agents: storage.agents.map(a => ({
      ...a,
      // normalization logic...
    })),
  };
  writeFileSync(paths.storageFile, JSON.stringify(normalized, null, 2), "utf-8");
}
```

**検証結果:** 構造的に同一だが型が異なる

**統合計画:**
- ジェネリック関数として実装を検討
- loadStorageとセットで共通化
- 推奨優先度: P2

---

### 3.3 ensureDefaults - デフォルト値の保証

**重要度:** 中 (P2)
**影響範囲:** 2ファイル
**推定削減行数:** 約30行

**場所:**
- `.pi/extensions/agent-teams.ts:2260-2357` (ensureDefaults for TeamStorage)
- `.pi/extensions/subagents.ts:1416-1418` (ensureDefaults for SubagentStorage)

**実装コード:** 型ごとに異なるデフォルト値を設定

**検証結果:** 構造的に同一だが型が異なる

**統合計画:**
- loadStorage, saveStorageとセットで共通化
- 推奨優先度: P2

---

## 4. 影響範囲の分析

### 4.1 ファイル別の重複関数使用状況

| ファイル | 重複関数数 | 重複種類 | 影響度 |
|---------|-----------|----------|--------|
| agent-teams.ts | 16 | 完全一致:13, 類似:1, パターン:2 | 高 |
| subagents.ts | 15 | 完全一致:13, 類似:1, パターン:2 | 高 |
| loop.ts | 3 | 完全一致:3 | 中 |
| rsa.ts | 3 | 完全一致:3 | 中 |
| agent-usage-tracker.ts | 2 | 類似:1 | 中 |
| context-usage-dashboard.ts | 1 | 類似:1 | 低 |
| retry-with-backoff.ts | 3 | 類似:1 | 低 |

### 4.2 機能カテゴリ別の重複

| カテゴリ | 関数数 | 重複関数 |
|---------|-------|---------|
| エラーハンドリング | 6 | toErrorMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage, toFiniteNumber(一部) |
| フォーマット | 4 | formatDuration, formatDurationMs, formatBytes, formatClockTime |
| Markdown/TUI | 3 | looksLikeMarkdown, renderPreviewWithMarkdown, toTailLines |
| 文字列操作 | 2 | appendTail, countOccurrences |
| バリデーション | 4 | toBoundedInteger, toFiniteNumber, toConcurrencyLimit, toRetryOverrides |
| ファイル操作 | 1 | ensureDir |
| その他 | 2 | estimateLineCount, formatDurationMs |
| パターン重複 | 3 | loadStorage, saveStorage, ensureDefaults |

### 4.3 関連性の分析

**密接に関連する関数グループ:**

1. **Markdown処理グループ:**
   - looksLikeMarkdown
   - renderPreviewWithMarkdown
   - toTailLines

2. **エラー処理グループ:**
   - toErrorMessage
   - classifyPressureError
   - isCancelledErrorMessage
   - isTimeoutErrorMessage
   - extractStatusCodeFromMessage
   - toFiniteNumber (一部)

3. **フォーマットグループ:**
   - formatDuration
   - formatDurationMs
   - formatBytes
   - formatClockTime
   - formatClockTime

4. **バリデーショングループ:**
   - toBoundedInteger
   - toFiniteNumber
   - toConcurrencyLimit
   - toRetryOverrides

5. **ストレージグループ（パターン重複）:**
   - loadStorage
   - saveStorage
   - ensureDefaults

---

## 5. 統合計画の提案

### 5.1 新規共有ユーティリティモジュールの構造

```
.pi/lib/
├── error-utils.ts              # エラー処理ユーティリティ (P0)
│   ├── toErrorMessage
│   ├── classifyPressureError
│   ├── isCancelledErrorMessage
│   ├── isTimeoutErrorMessage
│   ├── extractStatusCodeFromMessage (extractRetryStatusCodeを統合)
│   └── toFiniteNumber
│   └── toFiniteNumberOrZero
├── markdown-utils.ts           # Markdown処理ユーティリティ (P2)
│   ├── looksLikeMarkdown
│   ├── renderPreviewWithMarkdown
│   └── toTailLines
├── format-utils.ts             # フォーマットユーティリティ (P2)
│   ├── formatDuration
│   ├── formatDurationMs
│   ├── formatBytes
│   └── formatClockTime
├── validation-utils.ts         # バリデーションユーティリティ (P2)
│   ├── toBoundedInteger
│   ├── toFiniteNumber
│   ├── toFiniteNumberOrZero
│   ├── toConcurrencyLimit
│   └── toRetryOverrides
├── string-utils.ts             # 文字列処理ユーティリティ (P3)
│   ├── countOccurrences
│   └── estimateLineCount
├── storage-utils.ts            # ストレージユーティリティ (P2)
│   ├── ensureDir
│   └── ジェネリック版 loadStorage/saveStorage/ensureDefaults
├── tail-utils.ts               # テール処理ユーティリティ (P3)
│   └── appendTail
└── number-utils.ts             # 数値処理ユーティリティ (P0)
    ├── toFiniteNumber
    └── toFiniteNumberOrZero
```

### 5.2 優先順位の明確化

**Phase 1: 緊急・高優先度 (P0-P1)**

| 優先度 | 関数 | 理由 |
|-------|------|------|
| P0 | toTailLines | [WARNING]挙動差異による表示不整合リスク |
| P0 | toFiniteNumber | [WARNING]型不一致による潜在的なバグ |
| P1 | toErrorMessage | 4ファイルで使用される基礎ユーティリティ |
| P1 | ensureDir | 3ファイルで使用される基本処理 |

**Phase 2: 中優先度 (P2)**

| 優先度 | 関数 | 理由 |
|-------|------|------|
| P2 | looksLikeMarkdown, renderPreviewWithMarkdown | Markdown表示機能のセット |
| P2 | toBoundedInteger | バリデーション、2つの主要拡張機能で使用 |
| P2 | formatDuration, formatDurationMs, formatBytes, formatClockTime | フォーマット処理のセット |
| P2 | classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage | エラー分類セット |
| P2 | extractStatusCodeFromMessage | エラー処理の依存 |
| P2 | toConcurrencyLimit, toRetryOverrides | バリデーション処理のセット |
| P2 | loadStorage, saveStorage, ensureDefaults | ストレージ処理のパターン重複 |

**Phase 3: 低優先度 (P3)**

| 優先度 | 関数 | 理由 |
|-------|------|------|
| P3 | appendTail | 影響範囲が限定的 |
| P3 | countOccurrences | 簡単な実装、影響範囲小 |
| P3 | estimateLineCount | 簡単な実装、影響範囲小 |

### 5.3 移行手順

**Phase A: 共通ライブラリ作成 (P0-P1)**

1. `.pi/lib/error-utils.ts` の作成
   - toErrorMessage, toFiniteNumber, toFiniteNumberOrZero を実装
2. `.pi/lib/storage-lock.ts` への ensureDir 追加
3. `.pi/lib/markdown-utils.ts` の作成（toTailLines含む）
   - toTailLinesの挙動統一（オプションC採用）
4. 各ファイルからインポートに切り替え
5. テストと検証

**Phase B: 中優先度モジュールの作成 (P2)**

1. `.pi/lib/format-utils.ts` の作成
   - formatDuration, formatDurationMs, formatBytes, formatClockTime を実装
2. `.pi/lib/validation-utils.ts` の作成
   - toBoundedInteger, toConcurrencyLimit, toRetryOverrides を実装
3. `.pi/lib/error-utils.ts` の拡張
   - classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage を追加
4. 各ファイルからインポートに切り替え
5. テストと検証

**Phase C: 残り機能の統合 (P3) + パターン重複の対処**

1. `.pi/lib/string-utils.ts` の作成
   - countOccurrences, estimateLineCount を実装
2. `.pi/lib/tail-utils.ts` の作成
   - appendTail を実装
3. ストレージ関数のジェネリック化（loadStorage, saveStorage, ensureDefaults）
4. 全体の統合テスト
5. ドキュメント更新

---

## 6. Phase 1とPhase 2の分析結果の検証

### 6.1 矛盾の有無

**検証結果:** Phase 1とPhase 2の分析結果に重大な矛盾はなし

| 検証項目 | Phase 1 | Phase 2 | 一致 |
|---------|---------|---------|------|
| toErrorMessageの重複 | 4ファイル | 4ファイル | OK |
| toTailLinesの挙動差異 | 指摘あり | 指摘あり | OK |
| toFiniteNumberの型不一致 | 指摘あり | 指摘あり | OK |
| code examplesの正確性 | 検証済み | 検証済み | OK |
| 行番号の正確性 | 検証済み | 検証済み | OK |

### 6.2 追加発見された重複実装

Phase 2レビューで以下の重複実装を追加発見:

1. **formatBytes** (agent-teams.ts:268, subagents.ts:204) - 完全一致
2. **formatClockTime** (agent-teams.ts:275, subagents.ts:211) - 完全一致
3. **toConcurrencyLimit** (agent-teams.ts:1546, subagents.ts:1038) - 完全一致
4. **toRetryOverrides** (agent-teams.ts:1528, subagents.ts:1020) - 類似（定数名のみ異なる）
5. **loadStorage** (agent-teams.ts:2358, subagents.ts:1368) - パターン重複
6. **saveStorage** (agent-teams.ts:2391, subagents.ts:1402) - パターン重複
7. **ensureDefaults** (agent-teams.ts:2260, subagents.ts:1416) - パターン重複

**Reviewerの指摘との照合:**
- Reviewerが指摘した formatBytes, formatPercent, formatClockTime のうち、formatBytes と formatClockTime が発見されました
- formatPercent は存在しませんでした（誤検知）

### 6.3 カテゴリ分類の正確性

**検証結果:** カテゴリ分類は正確

| 分類 | 重複実装数 | 検証結果 |
|------|-----------|---------|
| 完全一致 | 18種類 | OK |
| 類似実装 | 3種類 | OK |
| パターン重複 | 3種類 | OK（新規追加） |

### 6.4 コード比較の正確性

**検証結果:** コード例は正確

- 実際のソースコードとドキュメントのコード例を比較
- 行番号を確認
- 実装の差異を検証
- 全てのサンプルコードが正確であることを確認

### 6.5 統合計画の実行可能性

**検証結果:** 統合計画は実行可能

| 項目 | 検証結果 |
|------|---------|
| モジュール構造 | 実行可能 |
| 移行手順 | 実行可能 |
| 優先順位 | 合理的 |
| リスク対策 | 適切 |

### 6.6 重要な重複実装の見落とし

**検証結果:** Phase 1では以下の重複実装が見落とされていました

| 重複実装 | 発見フェーズ | 説明 |
|---------|-------------|------|
| formatBytes | Phase 2 | フォーマットユーティリティ |
| formatClockTime | Phase 2 | フォーマットユーティリティ |
| toConcurrencyLimit | Phase 2 | バリデーションユーティリティ |
| toRetryOverrides | Phase 2 | バリデーションユーティリティ |
| loadStorage | Phase 2 | パターン重複 |
| saveStorage | Phase 2 | パターン重複 |
| ensureDefaults | Phase 2 | パターン重複 |

**重要度:** これらは中優先度（P2）で、統合によるコード削減効果は約80行

---

## 7. テスト計画

### 7.1 ユニットテスト要件

| 関数 | 必要なテストケース |
|------|------------------|
| toErrorMessage | Errorインスタンス, 文字列, null, undefined, 数値, オブジェクト |
| toBoundedInteger | 範囲内, 範囲外, 整数以外, undefined, NaN, Infinity |
| toFiniteNumber | 有効数値, 無効数値, 文字列数値, null, undefined |
| toFiniteNumberOrZero | 有効数値, 無効数値, 文字列数値, null, undefined |
| toTailLines | 空文字, 単一行, 複数行, 末尾空行, 制限超過, 空行削除の挙動 |
| looksLikeMarkdown | 各種Markdown構文, プレーンテキスト |
| renderPreviewWithMarkdown | Markdownテキスト, プレーンテキスト, 空文字, 幅制限, 行数制限 |
| classifyPressureError | 各種エラーメッセージ, ステータスコード |
| isCancelledErrorMessage | キャンセル関連の各種エラーメッセージ |
| isTimeoutErrorMessage | タイムアウト関連の各種エラーメッセージ |
| extractStatusCodeFromMessage | 各種ステータスコード, オブジェクト形式, メッセージ形式 |
| formatDuration | 0ms, <1000ms, >=1000ms, 負値, NaN, Infinity |
| formatDurationMs | 開始済み, 未開始, 実行中, 完了済み |
| formatBytes | 0, <1024, <1MB, >=1MB, 負値 |
| formatClockTime | undefined, 0, 有効なタイムスタンプ |
| ensureDir | 既存ディレクトリ, 新規ディレクトリ, ネストしたパス |
| toConcurrencyLimit | undefined, 有効数値, 負値, 0, 小数点 |

### 7.2 統合テスト要件

- ライブモニターの表示が統合前と同等であること
- エラーハンドリングの挙動が変わらないこと
- 全拡張機能の動作検証
- 型チェックによるエラーの検証
- 下位互換性の確認

### 7.3 特別なテスト要件

**toTailLinesの挙動統一テスト:**
- agent-teams.tsとsubagents.tsの元の挙動を両方テスト
- 統一後の挙動が選択したオプションと一致することを確認
- 両方の呼び出し元で期待通りの結果が得られることを確認

**toFiniteNumberの型テスト:**
- `toFiniteNumber` が `number | undefined` を返すこと
- `toFiniteNumberOrZero` が `number` を返すこと
- 呼び出し元で適切な型チェックが行われていることを確認

---

## 8. リスク評価と緩和策

### 8.1 統合によるリスク

| リスク | 説明 | 影響度 | 緩和策 |
|-------|------|--------|--------|
| 破壊的変更 | 既存コードの動作が変わる可能性 | 高 | 包括的なテストカバレッジ |
| toTailLinesの挙動変更 | 空行処理の違いによる表示不整合 | 高 | オプションパラメータで制御可能に |
| toFiniteNumberの型変更 | 戻り値の型の違いによる型エラー | 高 | 2つの関数を提供 |
| 循環依存 | ファイル間の依存関係が複雑になる | 中 | 依存関係の慎重な設計 |
| extractStatusCodeFromMessageの置換 | retry-with-backoff.tsの関数への置換 | 中 | 呼び出し元の挙動を検証 |
| パフォーマンス低下 | インポートによるオーバーヘッド | 低 | ベンチマークテスト |

### 8.2 統合しない場合のリスク

| リスク | 説明 | 影響度 |
|-------|------|--------|
| メンテナンス性の低下 | バグ修正時に全ての重複箇所を修正する必要がある | 高 |
| 不整合の発生 | ファイルごとに微妙な実装の違いが生じる可能性 | 高 |
| toTailLinesの挙動差異 | 既に存在する表示不整合の継続 | 高 |
| toFiniteNumberの型不一致 | 潜在的なバグの温床 | 高 |
| コードの肥大化 | 同じコードが複数箇所に存在する | 中 |

---

## 9. 推定作業量とスケジュール

### 9.1 推定作業量

| フェーズ | 見積もり時間 | 説明 |
|---------|-------------|------|
| Phase A: P0-P1統合 | 3-4時間 | error-utils, storage-lock, markdown-utilsの作成と統合 |
| Phase B: P2統合 | 4-5時間 | format-utils, validation-utils, error-utils拡張の作成と統合 |
| Phase C: P3統合 + パターン重複 | 3-4時間 | string-utils, tail-utils, ストレージ関数のジェネリック化 |
| テストと検証 | 2-3時間 | ユニットテスト、統合テスト、動作検証 |
| 予備 | 2時間 | 予期せぬ問題対応 |
| 合計 | 14-18時間 |

### 9.2 スケジュール提案

**Week 1: Phase A (P0-P1)**
- Day 1: error-utils.ts 作成、toErrorMessage 統合
- Day 2: toFiniteNumber 統合、ensureDir 統合
- Day 3: toTailLines 統合、markdown-utils.ts 作成
- Day 4-5: テストと検証

**Week 2: Phase B (P2)**
- Day 1-2: format-utils.ts 作成と統合
- Day 3: validation-utils.ts 作成と統合
- Day 4: error-utils.ts 拡張（エラー分類関数群）
- Day 5: テストと検証

**Week 3: Phase C (P3 + パターン重複)**
- Day 1-2: string-utils.ts, tail-utils.ts 作成と統合
- Day 3-4: ストレージ関数のジェネリック化
- Day 5: 全体の統合テスト

**Week 4: 品質レビューとドキュメント更新**
- Day 1-2: 回帰テスト
- Day 3-4: ドキュメント更新
- Day 5: 最終レビュー

---

## 10. 結論と推奨事項

### 10.1 分析結果の要約

本カタログにより、以下のことが明らかになりました:

1. **27種類の重複実装**を特定、合計59箇所の重複インスタンスが存在
2. 約420行のコード削減が可能
3. **toTailLinesの挙動差異**と**toFiniteNumberの型不一致**が緊急の対処が必要（P0）
4. **toErrorMessage**は4ファイルで使用される基礎ユーティリティであり、最も優先度が高い（P1）
5. Phase 2レビューで7種類の追加重複実装を発見
6. 共通ライブラリ構造を提案、段階的な移行計画を策定

### 10.2 推奨事項

1. **toTailLinesの挙動を統一する（P0）**
   - オプションパラメータを追加して空行削除の挙動を制御可能にする
   - デフォルト値は慎重に決定する（subagents版の.filter(Boolean)を推奨）

2. **toFiniteNumberの型を明確にする（P0）**
   - `toFiniteNumber(value: unknown): number | undefined`
   - `toFiniteNumberOrZero(value: unknown): number`
   - の2つの関数を提供する

3. **toErrorMessageを統合する（P1）**
   - 最も影響範囲が広い基礎ユーティリティ
   - 優先的に統合を進める

4. **関連する関数をまとめて移動する**
   - Markdown関連の関数はセットで移動
   - エラー処理関連の関数はセットで移動
   - フォーマット関連の関数はセットで移動
   - バリデーション関連の関数はセットで移動

5. **包括的なテストを用意する**
   - 各ユーティリティ関数の単体テスト
   - 統合後の挙動を検証する統合テスト
   - 特にtoTailLinesとtoFiniteNumberの挙動テスト

6. **段階的な統合を実施する**
   - P0-P1の関数から順に統合
   - 各フェーズで動作検証を実施
   - 問題があれば即座に対応

### 10.3 Phase 1とPhase 2の合意

**合意: 重複統合の方針**
- 高優先度の完全一致重複（toErrorMessage, ensureDir）と類似実装（toTailLines, toFiniteNumber）から順に統合を進める
- エラーハンドリング関数群を error-utils.ts に一元化する
- 関連する関数をグループ化してまとめて移動する
- 段階的な統合でリスクを最小化する
- 包括的なテストで品質を保証する

---

## 11. 次のステップ

1. **Phase A: P0-P1統合の実施**
   - `.pi/lib/error-utils.ts` の作成
   - `.pi/lib/storage-lock.ts` への ensureDir 追加
   - `.pi/lib/markdown-utils.ts` の作成（toTailLines含む）
   - 各ファイルからインポートに切り替え
   - テストと検証

2. **Phase B: P2統合の実施**
   - `.pi/lib/format-utils.ts` の作成
   - `.pi/lib/validation-utils.ts` の作成
   - `.pi/lib/error-utils.ts` の拡張
   - 各ファイルからインポートに切り替え
   - テストと検証

3. **Phase C: P3統合 + パターン重複の対処**
   - `.pi/lib/string-utils.ts`, `.pi/lib/tail-utils.ts` の作成
   - ストレージ関数のジェネリック化
   - 全体の統合テスト
   - ドキュメント更新

---

## 付録 A: ファイル行番号索引

| 関数名 | ファイル | 行番号 |
|--------|---------|--------|
| toBoundedInteger | loop.ts | 2448-2463 |
| toBoundedInteger | rsa.ts | 879-894 |
| toErrorMessage | agent-teams.ts | 5340-5344 |
| toErrorMessage | loop.ts | 2477-2481 |
| toErrorMessage | rsa.ts | 1500-1504 |
| toErrorMessage | subagents.ts | 3087-3091 |
| looksLikeMarkdown | agent-teams.ts | 289-302 |
| looksLikeMarkdown | subagents.ts | 225-238 |
| renderPreviewWithMarkdown | agent-teams.ts | 304-325 |
| renderPreviewWithMarkdown | subagents.ts | 240-261 |
| appendTail | agent-teams.ts | 248-255 |
| appendTail | subagents.ts | 184-191 |
| countOccurrences | agent-teams.ts | 255-267 |
| countOccurrences | subagents.ts | 191-203 |
| estimateLineCount | agent-teams.ts | 284-289 |
| estimateLineCount | subagents.ts | 220-225 |
| ensureDir | agent-teams.ts | 1819-1824 |
| ensureDir | agent-usage-tracker.ts | 135-140 |
| ensureDir | subagents.ts | 1300-1305 |
| formatDuration | loop.ts | 2465-2470 |
| formatDuration | rsa.ts | 1483-1488 |
| formatDurationMs | agent-teams.ts | 343-349 |
| formatDurationMs | subagents.ts | 277-283 |
| formatBytes | agent-teams.ts | 268-274 |
| formatBytes | subagents.ts | 204-210 |
| formatClockTime | agent-teams.ts | 275-283 |
| formatClockTime | subagents.ts | 211-219 |
| toConcurrencyLimit | agent-teams.ts | 1546-1553 |
| toConcurrencyLimit | subagents.ts | 1038-1045 |
| toRetryOverrides | agent-teams.ts | 1528-1545 |
| toRetryOverrides | subagents.ts | 1020-1037 |
| toFiniteNumber | agent-usage-tracker.ts | 437-440 |
| toFiniteNumber | context-usage-dashboard.ts | 72-75 |
| toFiniteNumber | retry-with-backoff.ts | 82-85 |
| toTailLines | agent-teams.ts | 332-340 |
| toTailLines | subagents.ts | 268-276 |
| extractStatusCodeFromMessage | agent-teams.ts | 992-999 |
| extractStatusCodeFromMessage | subagents.ts | 722-729 |
| extractRetryStatusCode | retry-with-backoff.ts | 308-330 |
| classifyPressureError | agent-teams.ts | 1000-1010 |
| classifyPressureError | subagents.ts | 730-740 |
| isCancelledErrorMessage | agent-teams.ts | 1011-1019 |
| isCancelledErrorMessage | subagents.ts | 741-749 |
| isTimeoutErrorMessage | agent-teams.ts | 1022-1030 |
| isTimeoutErrorMessage | subagents.ts | 752-760 |
| loadStorage | agent-teams.ts | 2358-2390 |
| loadStorage | subagents.ts | 1368-1401 |
| saveStorage | agent-teams.ts | 2391-2422 |
| saveStorage | subagents.ts | 1402-1415 |
| ensureDefaults | agent-teams.ts | 2260-2357 |
| ensureDefaults | subagents.ts | 1416-1418 |

---

## 付録 B: Phase 1とPhase 2の参加者

### Phase 1 サブエージェント
- Researcher (research): 初期調査と重複実装の特定
- Reviewer (review): コードレビューとリスク評価
- Implementer (build): 実装計画の策定とドキュメント作成

### Phase 2 Core Delivery Team
- Reviewer (reviewer): 全体レビューと検証、最終ドキュメント作成
- Implementer (build): 詳細な統合計画の策定
- Researcher (researcher): 追加重複実装の調査と検証

---

**文書履歴:**

| バージョン | 日付 | 作成者 | 変更内容 |
|---------|------|--------|---------|
| 1.0 | 2026-02-13 | Implementer (build) - Phase 1 | 初版作成（Phase 1調査結果） |
| 2.0 | 2026-02-13 | Reviewer - Phase 1 | Phase 1レビュー結果の追加 |
| 3.0 | 2026-02-13 | Implementer (build) - Phase 2 | Phase 2分析結果の追加、更新 |
| 4.0 | 2026-02-13 | Reviewer - Phase 2 | 最終版、Phase 1とPhase 2の統合、検証結果の追加 |

---

*ドキュメント終了*
