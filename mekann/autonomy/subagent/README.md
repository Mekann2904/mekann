# subagent

`subagent` は、独立した作業を別 agent に委譲し、context isolation と fresh review を得るための autonomy feature です。

## 使う場面

- repo-wide 調査を subagent に押し出し、root は最小 verification pointer だけを検証したい（`type=scout`）
- root が TDD/境界/acceptance を定義し、限定 file scope の実装を委任したい（`type=implement`）
- 親 agent の先入観から離れた fresh review が欲しい（`type=review`）
- narrow な検証を別 context で行いたい（`type=verify`）
- patch proposal を生成させ、trust transition を通して扱いたい
- 長い探索や実装試行錯誤を parent の context window から切り離したい

## 主な概念

- **Subagent delegation**: coherent で bounded な task を別 agent に任せること
- **Minimal sufficient context**: goal・制約・期待出力・開始点だけを渡す原則
- **Scout result**: root が信用する結論ではなく、root が最小 read で検証するための verification pointer 集合
- **Implement result**: root-owned tests/scope を満たす bounded implementation の manifest。changed files・scope compliance・tests・root_should_verify を返す
- **Subagent result**: subagent の structured outcome。生成された時点では信頼しない
- **Patch proposal**: diff と metadata を含む patch 型の subagent result
- **Trust transition**: patch proposal を escrow や workspace apply に進める判断点

## 主な tool

- `delegate_agent`: subagent を開始し、final result まで同期的に待って返す（既定ではこの tool だけを root LLM context に登録する）

`subagent.toolSurface=async-tools` のときだけ、advanced/debug 用に以下も登録します。

- `spawn_agent`: subagent を非同期に開始（advanced / 並列管理用）
- `wait_agent`: lifecycle event / mailbox / final result を待つ
- `message_agent`: `mode=note` で文脈追加、`mode=task` で追加作業を依頼
- `list_agents`: 状態を確認
- `close_agent`: cancellation が必要なときだけ中止
- `agent_results`: structured result の list/show/apply/reject/retry

## Patch proposal の扱い

Patch proposal は、存在するだけでは信頼されません。`PatchProposalPolicy` と patch proposal intake が、scope・base hash・authority・semantic metadata・validation hint を確認します。

Autoresearch では直接 apply せず、candidate escrow に渡して評価します。
