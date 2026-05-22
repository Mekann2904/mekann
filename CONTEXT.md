# Mekann Pi Extensions Context

Mekann is a suite of pi extensions for safety, autonomy, context, core prompt handling, utilities, and skills. This context records project-specific language so AI agents and human developers use the same names during architecture reviews, refactors, and planning sessions.

## Language

### Suite structure

**Pi extension suite**:
A grouped set of pi extensions loaded together by the `mekann` wrapper. A suite is a distribution and load-order grouping such as core, safety, autonomy, context, or utils; detailed design responsibility usually belongs to individual features inside the suite.
_Avoid_: plugin bundle, package group, feature boundary

**Feature**:
A responsibility-bearing capability inside a Pi extension suite, such as `sandbox`, `plan-mode`, `subagent`, `autoresearch`, `output-gate`, or `context-ledger`. Features are the preferred unit for design discussion when behavior or ownership is being clarified.
_Avoid_: module, package, suite

**Project context**:
The shared project language and domain knowledge recorded in `CONTEXT.md` so AI agents and human developers interpret Mekann concepts consistently. It is distinct from the `context` suite, which provides runtime context-management features, and from the model's `context window`, which is the active token budget available during inference.
_Avoid_: context suite, context window, implementation notes, design scratchpad

**Utility feature**:
A small, single-purpose helper primarily for human convenience rather than agent autonomy, safety boundaries, or runtime context control. Utility features belong in the `utils` suite and should stay lightweight.
_Avoid_: autonomy feature, safety feature, core feature

**Skill**:
A task-specific instruction package that a Pi coding agent reads to perform a particular kind of work. A skill is not an extension feature because it does not provide runtime tools or commands; it connects project context, ADRs, supporting docs, and action patterns into an executable workflow for the agent.
_Avoid_: feature, command, runtime extension

**Grilling skill**:
A skill style that uses focused questioning, codebase cross-checking, and inline documentation updates to align a plan with project language and decisions. `grill-with-docs` is the base grilling skill; `improve-codebase-architecture` uses architecture exploration first and then enters a grilling loop for a chosen candidate.
_Avoid_: generic Q&A, architecture report only

**Upstream skill mirror**:
A vendored copy of an external skill repository kept for provenance, license clarity, and update tracking. Upstream skill mirrors are source material, not the runtime source of truth for Pi agents.
_Avoid_: editable skill, runtime skill directory

**Pi-maintained skill**:
A skill copy under `mekann/skills` that Pi coding agents actually read. Pi-maintained skills may diverge from upstream so they use Pi tools and workflows, avoid Claude-specific assumptions, and follow Mekann's Japanese interaction policy for its users.
_Avoid_: upstream mirror, unmodified import

**Japanese interaction policy**:
The expectation that Pi-maintained skills communicate with Mekann users in Japanese for questions, recommendations, reports, summaries, and documentation updates. Existing project terms, code identifiers, file names, and quoted source text may remain in their original language when that preserves precision.
_Avoid_: English-only skill output, translated code identifiers

**Agent guideline**:
An always-on behavioral rule contributed through the core prompt path for ordinary coding-agent behavior. Agent guidelines differ from skills because they apply broadly, while skills are task-specific instruction packages read when a particular workflow is needed.
_Avoid_: skill, task workflow, one-off procedure

### Autonomy

**Autonomous work**:
The central value Mekann aims to improve: enabling a Pi coding agent to continue long-running, multi-step, parallel, or experiment-driven coding work with less direct user steering. Autonomous work may explore and evaluate alternatives, but irreversible or high-risk decisions remain explicitly controlled by the user; safety features are prerequisites that make this level of autonomy acceptable.
_Avoid_: automation, unattended execution, unchecked autonomy

**Pair-programming mode**:
The default collaboration style when features such as `goal` or `autoresearch` are not active. In pair-programming mode, the agent behaves like a normal coding agent that works interactively with the user rather than continuing autonomous loops on its own.
_Avoid_: autonomous work, background continuation

**Goal**:
A general-purpose autonomous-continuation objective attached to a session or thread. A goal lets the agent keep pursuing a user-defined objective across turns, within continuation and budget limits, without turning the task into a metric-driven experiment.
_Avoid_: experiment contract, benchmark target

**Autoresearch**:
A higher-autonomy research mode for persistent investigation, candidate generation, and evaluation when ordinary pair programming or goal continuation would be too slow or shallow. Autoresearch is currently metric-driven by default, but the intended concept also includes future non-metric or hard-to-measure research tasks that still need disciplined autonomous evaluation.
_Avoid_: goal, benchmark script, simple automation

**Calibrated evaluation**:
A composite evaluation approach for hard-to-measure autoresearch tasks that combines mechanical checks, structured acceptance criteria, LLM critics or judges, and human review where needed. LLM judgment is useful but should be calibrated against human or expert review before it becomes a trusted decision source.
_Avoid_: LLM-only judgment, subjective vibes

**Autoresearch test-time scaling**:
ユーザが停止するまで autoresearch の推論時計算量を増やし、複数の仮説・候補・評価・反省を並行または世代的に進めて研究品質を高める方式。通常の研究ループ中にユーザ判断を求めず、不可逆または高リスクな安全境界だけをユーザ制御として残す。
_Avoid_: autoresearch loop replacement, background daemon, unchecked agent autonomy, interactive research loop

**Scaling plan**:
Autoresearch test-time scaling の開始時に生成される `autoresearch.plan.md` の拡張形で、通常の評価契約に加えて探索集団、役割配分、世代更新、証拠、失敗記憶、停止・一時停止方針を記述する plan。別ファイルではなく既存 plan 形式を拡張し、contract 内で scaling mode と supervisor policy を明示し、研究状態は対象 plan 配下の scaling state として保持する。
_Avoid_: separate scale plan file, informal research notes, normal loop plan

**Supervisor policy**:
Autoresearch test-time scaling の supervisor が読む契約化された探索方針で、候補集団、役割配分、世代更新、証拠重視、失敗記憶、resource 上限、stop / safety pause / exhaustion の扱い、hypothesis slots を定義する。通常の候補採否や仮説選択や unknown 解決をユーザ判断へ逃がさず、安全境界に関わる停止理由だけを扱う。
_Avoid_: markdown-only strategy, hidden agent preference, ad hoc loop prompt, human-in-the-loop fallback

**Autonomous assumption**:
Autoresearch test-time scaling が unknown に遭遇したとき、ユーザへ質問せずに contract、plan、repo docs、code から解決を試み、解決不能なら明示的な仮定として記録して探索を続けるための前提。仮定が contract violation や不可逆変更につながる場合だけ safety pause の対象になる。
_Avoid_: clarifying question, user instruction request, hidden assumption

**Safety pause**:
Autoresearch test-time scaling が自律探索を一時停止してユーザ制御へ戻す安全境界で、停止理由は contract violation、unexpected dirty workspace、revert failure、resource exhausted or unavailable、unsafe or irreversible decision required に限定される。改善なし、仮説枯渇、弱い candidate、critic finding、未解決 unknown、benchmark/check 失敗は safety pause ではなく discard、exhaustion、failure memory で処理する。
_Avoid_: human decision required, low-confidence pause, no-improvement pause, resource error

**Resource degradation**:
Autoresearch test-time scaling が subagent、evaluation、worktree、benchmark、tool、timeout などの resource 制約に遭遇したとき、すぐ safety pause せず、並列度削減、cheap evidence への切替、historian 省略、generation 縮小、残候補の exhaustion 記録などで自律的に縮退して継続する扱い。縮退しても contract を満たせず継続不能な場合だけ resource exhausted or unavailable として safety pause する。
_Avoid_: resource error, immediate pause, ask user for more resources

**Autonomy status**:
Autoresearch test-time scaling がユーザへ返す観測用の進捗表示で、現在 phase、generation、resource 使用量、best candidate、次に自律実行する action、直近の evidence や discard 理由、summary file path を示す。ユーザに操縦を求める質問ではなく、通常実行中は stop、pending adoption、safety pause の修復または許可以外の判断依頼を表示しない。
_Avoid_: next-step question, hypothesis approval prompt, clarifying question dump

**Pending adoption**:
Autoresearch test-time scaling が winning candidate を選び、証拠・critic finding・benchmark/check 結果・採用用 patch をまとめたが、main worktree への最終反映はまだ行っていない状態。研究としての最良案提示までは自走し、プロジェクト状態を変える採用はユーザ制御として残す。
_Avoid_: auto-merge, auto-commit, final adoption

**Hypothesis slot**:
Autoresearch test-time scaling の初期探索多様性を確保するための仮説カテゴリ。Scaling plan には固定 slot と目的文由来 slot を置き、具体的な hypothesis は contract 承認後に scout が埋める。
_Avoid_: concrete patch idea before approval, single-track next step, unbounded brainstorming

**Negative-control hypothesis**:
候補 patch を作るためではなく、benchmark、checks、metric、cheap check と full benchmark の相関など、評価系が候補比較に使えるほど安定しているかを疑う hypothesis slot。Autoresearch test-time scaling では評価環境の信頼性も研究対象に含める。
_Avoid_: intentionally weak patch, wasted candidate, random no-op change

**Scaling state**:
Autoresearch test-time scaling の研究状態の正本で、対象 plan の `.autoresearch/plans/<planId>/scaling/` 配下に保持される append-only event log、再開用 snapshot、prompt / compaction 用 summary の集合。仮説、候補、評価、証拠、失敗、方針更新、scout / proposer / critic / historian の role task を event として記録し、会話 context ではなく scaling state から研究を復元する。
_Avoid_: conversation memory, markdown-only notes, root-level global scaling state

**Graceful stop**:
ユーザが Autoresearch test-time scaling の停止を要求した後、現在の candidate evaluation を安全に完了してから止める停止方式。内部 state では `draining`、UI では `graceful stopping` と表示する。新しい仮説・候補・generation は開始せず、実行中 candidate の checks、benchmark、decision、revert または materialization、証拠、失敗理由を研究状態に反映してから stop する。
_Avoid_: immediate abort, dirty stop, abandoned candidate evaluation

**Critic finding**:
Autoresearch test-time scaling の critic が出す、scope violation、metric hacking、hidden side effect、expected evidence の弱さに関する監査指摘。Critic finding は evidence と ranking input であり、candidate の直接 discard、loop の pause、ユーザ判断要求、最終 ranking decision は行わない。
_Avoid_: critic decision, judge verdict, pause command

**Exploration exhaustion**:
特定の探索軌道や役割が有望な次候補を出せなくなった状態。Autoresearch test-time scaling では研究全体の完了ではなく、失敗記憶として保存し、別の仮説・観点・file cluster・実装戦略へ探索分布を移す信号として扱う。既存 autoresearch loop の `COMPLETE` marker は scale 中には停止理由ではなく、この exploration exhaustion の証拠として記録する。
_Avoid_: complete, final success, user stop

### Runtime context

**Runtime context management**:
The control of what session information is kept inline, stored externally, summarized, retrieved, or delegated so long-running agent work remains cost-aware and reasoning quality does not degrade from excessive or noisy context. It manages the model's context window during work; it does not define the project's domain language.
_Avoid_: project context, memory dump, prompt stuffing

**Context window**:
The active token budget and contents available to the model for a single inference. Mekann treats the context window as a scarce runtime resource that must be protected from excessive raw output, unrelated task branches, and stale assumptions.
_Avoid_: project context, context suite, long-term memory

**Output gate**:
A runtime context-management feature that stores large raw tool outputs outside the inline conversation and leaves a searchable artifact reference behind. Output gate preserves raw evidence without forcing the model to carry the whole output in its active context.
_Avoid_: context ledger, summary, decision log

**Context ledger**:
A runtime context-management feature that stores meaningful working-memory events such as decisions, tasks, errors, plans, file changes, and artifact references. Context ledger preserves interpreted session state, while output gate preserves raw tool output.
_Avoid_: output gate, raw log dump

**Context isolation**:
The deliberate separation of task context so an agent can reason about one coherent task without being polluted by unrelated details, compressed summaries, or the parent agent's prior assumptions. Subagents provide context isolation by receiving only the context needed for their delegated task.
_Avoid_: context compression, shared scratchpad

**Fresh review**:
An evaluation or judgment performed by an agent whose context is intentionally cleaner than the parent agent's context. Fresh review is used to reduce anchoring, self-justification, and overconfidence in code or plans produced by the parent agent.
_Avoid_: self-review, rubber stamp

### Subagents and trust

**Subagent result**:
The structured outcome produced by a subagent and stored for later review, application, or escrow. A subagent result may be a patch proposal, observation, no-change result, blocked result, or decision request, and is not trusted merely because it was produced by a subagent.
_Avoid_: child output, agent response

**Subagent delegation**:
The act of assigning a coherent, bounded task to a subagent so the parent agent does not have to hold every branch of the work in one context window. Subagent delegation is used for parallel work, isolated exploration, candidate generation, and fresh review.
_Avoid_: context compression, multitasking in one context

**Minimal sufficient context**:
The principle for subagent delegation that gives the subagent the task goal, constraints, expected output, and relevant starting points, while avoiding unnecessary parent conversation that would undermine context isolation. Parent context is forked only when it is genuinely needed for correctness or safety.
_Avoid_: full conversation dump, context starvation

**Subagent lifecycle**:
The module shape that owns how a subagent is spawned, connected, run, finalized, and recorded. Subagent lifecycle concentrates spawn-to-final-result behavior so display, IPC, registry, mailbox, authority preamble, and result storage do not leak across unrelated callers.
_Avoid_: agent orchestration, child session manager, runtime wrapper

**Trust transition**:
A point where Mekann changes how much it relies on an agent-produced artifact, such as moving a subagent patch proposal into candidate escrow or applying it to the workspace. Trust transitions require explicit policy checks rather than assuming the producing agent was correct.
_Avoid_: implicit trust, direct apply

**Patch proposal**:
A subagent result whose outcome is `patch` and whose payload includes a unified diff plus declared base, scope, semantic metadata, and validation hints. A patch proposal is not trusted merely because it exists.
_Avoid_: patch response, diff result

**PatchProposalPolicy**:
The module that decides whether a patch proposal can move to the next stage by checking patch safety, declared touched paths, authority scope, base hashes, and public surface declarations. It produces findings that candidate escrow and subagent apply can interpret differently.
_Avoid_: PatchProposalValidator, SubagentResultTrust

**Patch proposal intake**:
The deepened module that receives a patch proposal from a subagent result and turns it into an admission outcome for a specific downstream adapter, such as candidate escrow or subagent apply. Patch proposal intake owns profile-specific decision semantics, reason mapping, and audit payload shaping so callers do not reinterpret PatchProposalPolicy findings themselves.
_Avoid_: patch import, proposal gate, patch validation wrapper

**Candidate escrow**:
The autoresearch step that stores a trusted patch proposal as an experiment candidate without applying it to the main worktree. Candidate escrow preserves the patch for later evaluation under the autoresearch contract.
_Avoid_: candidate import, patch staging

**Subagent apply**:
The step that applies a trusted patch proposal to the workspace after policy checks, semantic conflict checks, git apply checks, and requested validation commands.
_Avoid_: patch merge, result execution

### Safety

**Plan mode**:
A safety feature for read-only investigation and plan formation before implementation. Plan mode is a UX-level collaboration mode; its command intent checks guide the agent but are not the hard security boundary.
_Avoid_: sandbox, execution guard, todo list

**Sandbox**:
A safety feature that enforces execution restrictions for the `bash` tool, primarily through OS-level policy when enabled. Sandbox is the hard runtime boundary for command execution, while plan mode is the planning UX that can request a read-only sandbox profile.
_Avoid_: plan mode, agent-wide security boundary

**Safety guardrail**:
A boundary or policy that makes higher agent autonomy acceptable by limiting dangerous execution, unsafe state changes, or unreviewed trust transitions. Safety guardrails are enablers of autonomous work, not merely obstacles to it.
_Avoid_: autonomy blocker, optional warning

### Prompt

**Prompt core**:
The shared prompt-fragment registry and rendering foundation used by Mekann features to contribute stable, semi-stable, and dynamic prompt content in a deterministic order. Prompt core does not call provider cache APIs or guarantee cache hits.
_Avoid_: final prompt orchestrator, provider cache layer

**Cache-friendly prompt**:
The final prompt orchestrator that collects prompt fragments through prompt core, places stable and semi-stable content toward the front, dynamic content near the tail, and reports cacheability signals. It improves cache friendliness but does not guarantee provider cache reuse.
_Avoid_: prompt core, cache guarantee

## Example dialogue

Developer: “Should this be a goal or autoresearch?”
Domain expert: “Use a goal when the agent should keep pursuing a general objective. Use autoresearch when the task needs higher-autonomy research, repeated candidate generation, and disciplined evaluation.”

Developer: “Why not just keep all investigation details in the parent agent?”
Domain expert: “That pollutes the context window. Use subagent delegation with minimal sufficient context for isolated exploration or fresh review, then bring back a structured subagent result.”

Developer: “Can this subagent result become an autoresearch candidate?”
Domain expert: “Only after a trust transition. A patch proposal must pass PatchProposalPolicy, and candidate escrow should preserve it for evaluation without applying it to the main worktree.”

Developer: “Is plan mode enough to make implementation safe?”
Domain expert: “No. Plan mode is a UX-level read-only planning mode. Sandbox is the runtime boundary for bash command execution, and safety guardrails are what make higher autonomy acceptable.”
