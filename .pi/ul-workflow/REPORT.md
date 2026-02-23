# UL Mode Issue Report

---
generated_at: 2026-02-24T02:46:00+09:00
source: .pi/ul-workflow/tasks/2026-02-23T17-24-55-ul/research.md
---

## Quick Summary

| カテゴリ | 件数 | 緊急度 |
|---------|------|--------|
| Critical | 3 | 即時対応推奨 |
| High | 3 | 1-2週間以内対応推奨 |
| Medium | 5 | 1ヶ月以内対応推奨 |
| UL-Specific | 7 | 計画的改善推奨 |
| Low | 2 | 低優先度 |

## Impact Assessment

| カテゴリ | 影響範囲 | 発生条件 | ユーザーへの影響 |
|---------|---------|---------|-----------------|
| Critical Race Conditions | 並列サブエージェント実行 | 高負荷時、複数タスク並列 | データ破損、クラッシュ |
| High Priority | リトライ、容量管理 | 中程度の負荷 | パフォーマンス低下、待機時間増加 |
| Medium | 状態管理、エラー処理 | 通常運用 | デバッグ困難、予期しない動作 |
| UL Specific | ULモード全般 | ULプレフィックス使用時 | 設計上の制約による問題 |
| Low | 型安全性、ロギング | 常時 | 情報不足 |

## Critical Issues (P0)

### 1. Rate Limit State Race Condition
- **場所**: `.pi/lib/retry-with-backoff.ts:354-360`
- **影響**: 並列実行時のデータ破損リスク
- **症状**: 複数サブエージェントが同時に429エラーを発生させると状態が不整合
- **回避策**: 並列タスク数を制限（推奨: 3以下）

### 2. globalThis Initialization Race
- **場所**: `.pi/extensions/agent-runtime.ts:159-180`
- **影響**: セッション開始時の初期化失敗リスク
- **症状**: CPU使用率急上昇、デッドロック
- **回避策**: セッション開始直後に問題が発生した場合は再起動

### 3. Belief State Cache Race
- **場所**: `.pi/extensions/agent-teams/communication.ts`
- **影響**: チーム並列実行時のクラッシュリスク
- **症状**: チーム間の信念状態汚染、誤った合意形成
- **回避策**: チームの並列実行数を制限

## High Priority Issues (P1)

### 4. Reservation Sweeper Double Creation
- **場所**: `.pi/extensions/agent-runtime.ts:830-890`
- **影響**: メモリリーク、リソース過剰消費
- **症状**: 長時間実行後のパフォーマンス低下
- **回避策**: 定期的なセッション再起動

### 5. abortOnError Wait Issue
- **場所**: `.pi/lib/concurrency.ts:68-130`
- **影響**: エラー後もリソース消費継続
- **症状**: 最初のエラー後も全ワーカー完了まで待機
- **回避策**: 大量タスクの並列実行を避ける

### 6. File Lock Memory State Update
- **場所**: `.pi/lib/retry-with-backoff.ts`
- **影響**: プロセス間での状態不整合
- **症状**: レート制限待機時間が不正確
- **回避策**: 単一プロセスでの実行を推奨

## Medium Priority Issues (P2)

### 7. Error Swallowing in Coordinator
- **場所**: `.pi/extensions/agent-runtime.ts:publishRuntimeUsageToCoordinator`
- **影響**: デバッグ困難
- **症状**: クロスインスタンスコーディネーターのエラーが隠蔽

### 8. Event Listener Resource Leak
- **場所**: `.pi/extensions/agent-runtime.ts:waitForRuntimeCapacityEvent`
- **影響**: メモリリーク
- **症状**: 長時間実行プロセスでのリソース枯渇

### 9. Queue Eviction Undefined Handling
- **場所**: `.pi/extensions/agent-runtime.ts:trimPendingQueueToLimit`
- **影響**: キューサイズ上限時の予期しない動作

### 10. Member Execution Result Access
- **場所**: `.pi/extensions/agent-teams/member-execution.ts:runMember`
- **影響**: メンバー実行失敗時のクラッシュ

### 11. Results Array Error Message Mismatch
- **場所**: `.pi/lib/concurrency.ts`
- **影響**: デバッグ時の混乱

## UL-Specific Issues

### UL-1. Policy Cache Limit
- **場所**: `.pi/extensions/ul-dual-mode.ts:345-358`
- **問題**: キャッシュ上限10は実際の4パターンに対して過剰
- **影響**: 低（FIFO削除が有効なエントリを削除する可能性）

### UL-2. Trivial Task Detection Accuracy
- **場所**: `.pi/extensions/ul-dual-mode.ts:214-228`
- **問題**: 文字数ベースの判定が精度不足
- **影響**: セキュリティ重要なタスクでreviewerがスキップされる可能性
- **回避策**: セキュリティ関連キーワードを含むタスクは明示的にreviewerを指定

### UL-3. Dynamic Phase Determination Edge Cases
- **場所**: `.pi/extensions/ul-workflow.ts:114-146`
- **問題**: 複雑度推定の誤判定でplanフェーズが省略される可能性
- **影響**: 設計ミスのリスク

### UL-4. Snapshot Cache TTL
- **場所**: `.pi/extensions/ul-dual-mode.ts:119-136`
- **問題**: 50msキャッシュが高負荷時に古いデータを返す可能性
- **影響**: スロットリングの不正確さ

### UL-5. State File Synchronous I/O
- **場所**: `.pi/extensions/ul-workflow.ts:238-250`
- **問題**: 同期I/Oがイベントループをブロック
- **影響**: 大量タスクでのボトルネック

### UL-6. Annotation Pattern Matching
- **場所**: `.pi/extensions/ul-workflow.ts:262-285`
- **問題**: 入れ子HTMLコメントで誤マッチ
- **影響**: 注釈抽出の不整合

### UL-7. Reviewer Guardrail Disabled
- **場所**: `.pi/extensions/ul-dual-mode.ts:37`
- **問題**: Reviewerフェーズが強制されない
- **影響**: 品質保証の欠如

## Low Priority Issues (P3)

### 12. Skill Content Load Exception
- **場所**: `.pi/extensions/agent-teams/member-execution.ts:loadSkillContent`
- **影響**: スキル読み込みエラーが隠蔽

### 13. Status Code Type Check
- **場所**: `.pi/lib/retry-with-backoff.ts:extractRetryStatusCode`
- **影響**: 予期しない入力で誤動作の可能性

## Recommendations

### 即時対応（1週間以内）
1. **Critical問題の修正**: Bug #1-3の修正を実装
2. **診断ツールの活用**: `/ul-diagnostic`コマンドで問題を検出

### 短期対応（2週間以内）
1. **High問題の修正**: Bug #4-6の修正とテスト追加
2. **並列実行数の制限**: デフォルトの並列数を調整

### 中期対応（1ヶ月以内）
1. **UL特有問題の設計見直し**: タスク複雑度推定の改良
2. **非同期I/Oへの移行**: 状態ファイルの書き込み
3. **エラーログの改善**: 隠蔽されているエラーの可視化

### 継続的改善
1. **統合テストの拡充**: 並列実行シナリオのテスト追加
2. **モニタリングの強化**: ランタイム状態の可視化

## Diagnostic Tools

### ul-diagnostic コマンド
```bash
# 簡易診断
/ul-diagnostic

# 詳細診断（レポートファイル出力）
/ul-diagnostic-full
```

診断項目:
- Rate Limit State一貫性チェック
- Runtime初期化状態チェック
- リソースリーク検出
- 並列実行リスク評価
- 設定確認

## Appendix

### 技術詳細
詳細な技術分析は `.pi/ul-workflow/tasks/2026-02-23T17-24-55-ul/research.md` を参照。

### 関連ファイル
| ファイル | 主な問題 |
|---------|---------|
| `.pi/extensions/ul-dual-mode.ts` | UL-SPEC-1〜7 |
| `.pi/extensions/ul-workflow.ts` | UL-SPEC-3, UL-SPEC-5, UL-SPEC-6 |
| `.pi/lib/retry-with-backoff.ts` | Bug #1, Bug #6, Bug #13 |
| `.pi/extensions/agent-runtime.ts` | Bug #2, Bug #4, Bug #7, Bug #8, Bug #9 |
| `.pi/lib/concurrency.ts` | Bug #5, Bug #11 |

### テストファイル
| テストファイル | 内容 |
|---------------|------|
| `.pi/tests/bug-reproduction/critical-race-conditions.test.ts` | Bug #1, #2, #3 |
| `.pi/tests/bug-reproduction/high-bugs.test.ts` | Bug #4, #5, #6 |
| `.pi/tests/bug-reproduction/medium-bugs.test.ts` | Bug #7, #8, #9, #10, #11 |
| `.pi/tests/bug-reproduction/bug-001-004-resource-leaks.test.ts` | BUG-001, #002, #003, #004 |
| `.pi/tests/bug-reproduction/low-bugs.test.ts` | Bug #12, #13 |

---

*Generated from research.md on 2026-02-24*
*Total issues documented: 20*
