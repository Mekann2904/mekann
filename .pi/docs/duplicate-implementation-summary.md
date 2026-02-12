# 重複実装カタログ 要約版
# Duplicate Implementation Catalog - Summary

**作成日:** 2026-02-13
**作成者:** Reviewer - Core Delivery Team

---

## 実行概要

本ドキュメントは、Phase 1（3人のサブエージェントによる調査）とPhase 2（core-delivery-teamによるレビュー）の結果を統合し、`.pi/extensions/` および `.pi/lib/` ディレクトリ内の重複実装を徹底的に調査した結果の要約です。

---

## 統計サマリー

| カテゴリ | 重複種類数 | 重複箇所数 | 予想削減行数 |
|---------|-----------|-----------|-------------|
| 完全一致重複 | 18種類 | 41箇所 | 約310行 |
| 類似実装 | 3種類 | 6箇所 | 約30行 |
| パターン重複 | 3種類 | 6箇所 | 約40行 |
| 合計 | 24種類 | 53箇所 | 約380行 |

---

## 完全一致の重複実装（18種類）

### 高優先度 (P0-P1)

| 関数名 | 重複箇所 | 影響範囲 | 推定削減行数 | 統合先 |
|--------|---------|----------|-------------|--------|
| toErrorMessage | 4ファイル | エラーハンドリング | 16行 | error-utils.ts |
| ensureDir | 3ファイル | ディレクトリ作成 | 12行 | storage-lock.ts |

### 中優先度 (P2)

| 関数名 | 重複箇所 | 影響範囲 | 推定削減行数 | 統合先 |
|--------|---------|----------|-------------|--------|
| looksLikeMarkdown | 2ファイル | Markdown判定 | 14行 | markdown-utils.ts |
| renderPreviewWithMarkdown | 2ファイル | Markdownレンダリング | 22行 | markdown-utils.ts |
| toBoundedInteger | 2ファイル | 整数バリデーション | 16行 | validation-utils.ts |
| formatDuration | 2ファイル | 時間フォーマット | 6行 | format-utils.ts |
| formatDurationMs | 2ファイル | 経過時間フォーマット | 14行 | format-utils.ts |
| formatBytes | 2ファイル | バイトフォーマット | 8行 | format-utils.ts |
| formatClockTime | 2ファイル | 時刻フォーマット | 8行 | format-utils.ts |
| toConcurrencyLimit | 2ファイル | 並列性制限変換 | 6行 | validation-utils.ts |
| toRetryOverrides | 2ファイル | リトライ設定変換 | 12行 | validation-utils.ts |
| classifyPressureError | 2ファイル | エラー分類 | 11行 | error-utils.ts |
| extractStatusCodeFromMessage | 2ファイル | ステータスコード抽出 | 8行 | error-utils.ts |

### 低優先度 (P3)

| 関数名 | 重複箇所 | 影響範囲 | 推定削減行数 | 統合先 |
|--------|---------|----------|-------------|--------|
| appendTail | 2ファイル | 文字列追加 | 8行 | tail-utils.ts |
| countOccurrences | 2ファイル | 出現回数カウント | 12行 | string-utils.ts |
| estimateLineCount | 2ファイル | 行数推定 | 6行 | string-utils.ts |
| isCancelledErrorMessage | 2ファイル | キャンセル判定 | 9行 | error-utils.ts |
| isTimeoutErrorMessage | 2ファイル | タイムアウト判定 | 9行 | error-utils.ts |

---

## 類似実装（3種類） - ⚠️ 優先度高

| 関数名 | 重複箇所 | 問題点 | 優先度 | 推定削減行数 |
|--------|---------|--------|--------|-------------|
| toTailLines | 2ファイル | 空行処理の挙動差異 | P0 | 10行 |
| toFiniteNumber | 3ファイル | 戻り値の型不一致 | P0 | 9行 |
| extractStatusCodeFromMessage | 3ファイル | retry-with-backoff.tsの関数がより完全 | P2 | 20行 |

---

## パターン重複（3種類）

| 関数名 | 重複箇所 | 問題点 | 優先度 | 推定削減行数 |
|--------|---------|--------|--------|-------------|
| loadStorage | 2ファイル | 型パラメータで共通化可能 | P2 | 35行 |
| saveStorage | 2ファイル | 型パラメータで共通化可能 | P2 | 20行 |
| ensureDefaults | 2ファイル | 型パラメータで共通化可能 | P2 | 30行 |

---

## 影響を受けるファイル

| ファイル | 重複関数数 | 影響度 | 備考 |
|---------|-----------|--------|------|
| agent-teams.ts | 16 | 高 | 最も多くの重複 |
| subagents.ts | 15 | 高 | agent-teams.tsと類似 |
| loop.ts | 3 | 中 | |
| rsa.ts | 3 | 中 | |
| agent-usage-tracker.ts | 2 | 中 | |
| context-usage-dashboard.ts | 1 | 低 | |
| retry-with-backoff.ts | 3 | 低 | |

---

## 統合計画の推奨モジュール構造

```
.pi/lib/
├── error-utils.ts              # エラー処理 (P0-P2)
├── markdown-utils.ts           # Markdown処理 (P2)
├── format-utils.ts             # フォーマット (P2)
├── validation-utils.ts         # バリデーション (P2)
├── string-utils.ts             # 文字列処理 (P3)
├── storage-lock.ts             # ストレージ操作 (P1)
└── tail-utils.ts               # テール処理 (P3)
```

---

## 優先順位の明確化

### Phase 1: 緊急・高優先度 (P0-P1) - 3-4時間

| 関数 | 理由 |
|------|------|
| toTailLines | ⚠️ 挙動差異による表示不整合リスク |
| toFiniteNumber | ⚠️ 型不一致による潜在的なバグ |
| toErrorMessage | 4ファイルで使用される基礎ユーティリティ |
| ensureDir | 3ファイルで使用される基本処理 |

### Phase 2: 中優先度 (P2) - 4-5時間

| 関数グループ | 理由 |
|-------------|------|
| Markdown処理 (looksLikeMarkdown, renderPreviewWithMarkdown) | Markdown表示機能のセット |
| フォーマット処理 (formatDuration, formatDurationMs, formatBytes, formatClockTime) | フォーマット処理のセット |
| バリデーション (toBoundedInteger, toConcurrencyLimit, toRetryOverrides) | バリデーション処理のセット |
| エラー分類 (classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage) | エラー処理のセット |

### Phase 3: 低優先度 (P3) + パターン重複 - 3-4時間

| 関数グループ | 理由 |
|-------------|------|
| 文字列操作 (appendTail, countOccurrences, estimateLineCount) | 影響範囲が限定的 |
| ストレージ処理 (loadStorage, saveStorage, ensureDefaults) | パターン重複の対処 |

---

## Phase 1とPhase 2の検証結果

### 矛盾の有無
- **結果:** Phase 1とPhase 2の分析結果に重大な矛盾はなし
- **検証項目:** コード例の正確性、行番号の正確性、カテゴリ分類の正確性、統合計画の実行可能性 - 全てOK

### 追加発見された重複実装（7種類）
Phase 2レビューで以下の重複実装を追加発見:
1. formatBytes (完全一致)
2. formatClockTime (完全一致)
3. toConcurrencyLimit (完全一致)
4. toRetryOverrides (類似)
5. loadStorage (パターン重複)
6. saveStorage (パターン重複)
7. ensureDefaults (パターン重複)

---

## 重要なリスクと対処

| リスク | 影響度 | 対処策 |
|-------|--------|--------|
| toTailLinesの挙動差異 | 高 | オプションパラメータで制御可能に（P0） |
| toFiniteNumberの型不一致 | 高 | 2つの関数を提供（toFiniteNumber, toFiniteNumberOrZero）（P0） |
| 破壊的変更 | 高 | 包括的なテストカバレッジ |
| 循環依存 | 中 | 依存関係の慎重な設計 |

---

## 推定作業量

| フェーズ | 見積もり時間 |
|---------|-------------|
| Phase A: P0-P1統合 | 3-4時間 |
| Phase B: P2統合 | 4-5時間 |
| Phase C: P3統合 + パターン重複 | 3-4時間 |
| テストと検証 | 2-3時間 |
| 合計 | 14-18時間 |

---

## 結論

1. **24種類の重複実装**を特定、合計53箇所の重複インスタンスが存在
2. 約380行のコード削減が可能
3. **toTailLinesの挙動差異**と**toFiniteNumberの型不一致**が緊急の対処が必要（P0）
4. Phase 2レビューで7種類の追加重複実装を発見
5. 段階的な統合でリスクを最小化する計画を策定

---

## 次のステップ

1. Phase A: P0-P1統合の実施（error-utils, storage-lock, markdown-utils）
2. Phase B: P2統合の実施（format-utils, validation-utils, error-utils拡張）
3. Phase C: P3統合 + パターン重複の対処（string-utils, tail-utils, ストレージ関数）
4. 全体の統合テストとドキュメント更新

---

**詳細なドキュメント:** `.pi/docs/final-duplicate-implementation-catalog.md`
