# autoresearch

`autoresearch` は、候補生成と評価を伴う高自律な research mode です。普通の pair-programming mode や `goal` では遅すぎる、または浅くなりやすい調査に使います。

## 使う場面

- 改善指標や acceptance criteria がある
- 複数候補を生成して比較したい
- benchmark / checks / review を組み合わせて calibrated evaluation したい
- subagent patch proposal を candidate escrow に入れて評価したい

## 基本の流れ

1. user の目的を query として整理する
2. `autoresearch.plan.md` に editable な plan と contract draft を作る
3. approve で baseline と lock を作る
4. subagent などで patch proposal を作る
5. candidate escrow に保存する
6. isolated worktree または trial patch として評価する
7. contract evaluator が keep / discard / pause を判断する

## 主な tool

- `autoresearch_evaluate_query`: query が実験契約にできるか評価
- `autoresearch_plan`: editable plan draft を作成
- `autoresearch_approve`: contract を承認し baseline を測る
- `autoresearch_candidate_escrow`: subagent patch result を candidate 化
- `autoresearch_run_contract`: contract に従って checks と benchmark を実行

## 境界

- `goal` は一般目的の継続、`autoresearch` は評価契約を持つ research mode です
- LLM-only judgment だけで判断せず、必要に応じて mechanical checks・structured criteria・human review を組み合わせます
- safety guardrail と trust transition を前提にします
