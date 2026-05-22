# subagent

`subagent` は、独立した作業を別 agent に委譲し、context isolation と fresh review を得るための autonomy feature です。

## 使う場面

- repo-wide 調査を複数領域に分けたい
- 親 agent の先入観から離れた fresh review が欲しい
- patch proposal を生成させ、trust transition を通して扱いたい
- 長い探索を parent の context window から切り離したい

## 主な概念

- **Subagent delegation**: coherent で bounded な task を別 agent に任せること
- **Minimal sufficient context**: goal・制約・期待出力・開始点だけを渡す原則
- **Subagent result**: subagent の structured outcome。生成された時点では信頼しない
- **Patch proposal**: diff と metadata を含む patch 型の subagent result
- **Trust transition**: patch proposal を escrow や workspace apply に進める判断点

## 主な tool

- `spawn_agent`: subagent を開始
- `wait_agent`: lifecycle event / mailbox / final result を待つ
- `followup_task`: 追加作業を依頼
- `list_agents`: 状態を確認
- `close_agent`: cancellation が必要なときだけ中止
- `apply_agent_results`: policy check 後に patch proposal を適用

## Patch proposal の扱い

Patch proposal は、存在するだけでは信頼されません。`PatchProposalPolicy` と patch proposal intake が、scope・base hash・authority・semantic metadata・validation hint を確認します。

Autoresearch では直接 apply せず、candidate escrow に渡して評価します。
