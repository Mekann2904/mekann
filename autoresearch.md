# autoresearch: テストカバレッジ最大化

## 目的
全ワークスペースのテストカバレッジを最大化する。
特に低カバレッジのワークスペースを改善し、全体の composite coverage (Statements + Branches + Functions + Lines の加重平均) を向上させる。

## 現状 (baseline)

| ワークスペース | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| subagent | 81.1% | 73.0% | 86.2% | 82.0% |
| plan-mode | 88.7% | 84.2% | 96.7% | 90.1% |
| cache-friendly-prompt | 91.0% | 69.7% | 89.5% | 97.6% |
| prompt-core | 92.2% | 79.1% | 94.9% | 92.0% |
| output-gate | 97.4% | 93.0% | 97.9% | 99.5% |
| goal | 97.9% | 91.8% | 100% | 98.5% |
| agent-guidelines | 100% | 100% | 100% | 100% |
| zip-repo | 100% | 100% | 100% | 100% |

## 優先順位
1. **subagent** (81.1% → 目標 90%+): index.ts 57%, agentControl.ts 67%, applyQueue.ts 72%
2. **plan-mode** (88.7% → 目標 95%+): index.ts 88.7%
3. **cache-friendly-prompt** (91.0% → 目標 95%+): report.ts 91.9%, index.ts 89.2%
4. **prompt-core** (92.2% → 目標 95%+): render.ts 83.3%

## 戦略
- 各ワークスペースの未カバー行・分岐を特定
- 対象関数のユニットテストを追加
- 境界条件・エラーパスを重点的にカバー
- 外部依存（fs, child_process等）はモックを使用
