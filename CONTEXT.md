# Mekann Pi Extensions Context

Mekann is a suite of pi extensions for safety, autonomy, context, core prompt handling, utilities, and skills. This context records project-specific language so AI agents and human developers use the same names during architecture reviews, refactors, and planning sessions.

## Language

### Suite structure

**Pi extension suite**:
A grouped set of pi extensions loaded together by the `mekann` wrapper. A suite is a distribution and load-order grouping such as core, safety, autonomy, context, or utils; detailed design responsibility usually belongs to individual features inside the suite.
_Avoid_: plugin bundle, package group, feature boundary

**Feature**:
A responsibility-bearing capability inside a Pi extension suite, such as `sandbox`, `modes`, `subagent`, `autoresearch`, `output-gate`, or `context-ledger`. Features are the preferred unit for design discussion when behavior or ownership is being clarified.
_Avoid_: module, package, suite

**Implementation delegation**:
Deprecated. Sub mode now behaves the same as main mode. The former implementation-delegation strategy has been removed; sub mode agents have full design, implementation, review, and research capabilities.
_Avoid_: delegated TDD, implementation subagent workflow, model-cost TDD

**Fixed spec artifact**:
Deprecated. No longer used as a sub-mode input contract.
_Avoid_: prompt brief, test notes, task description

**Implementation agent**:
Deprecated. Sub mode agents now have the same capabilities as main mode agents.
_Avoid_: delegated TDD agent, coding helper, autonomous implementer

**Project context**:
The shared project language and domain knowledge recorded in `CONTEXT.md` so AI agents and human developers interpret Mekann concepts consistently. It is distinct from the `context` suite, which provides runtime context-management features, and from the model's `context window`, which is the active token budget available during inference.
_Avoid_: context suite, context window, implementation notes, design scratchpad

**Utility feature**:
A small, single-purpose helper primarily for human convenience rather than agent autonomy, safety boundaries, or runtime context control. Utility features belong in the `utils` suite and should stay lightweight.
_Avoid_: autonomy feature, safety feature, core feature

**Terminal shortcut**:
An exact user input alias that resolves to a Terminal action for the human operator instead of sending the input to the agent. Terminal shortcuts are utility features and are distinct from shell aliases because Pi resolves them before normal prompt handling.
_Avoid_: shell alias, slash command, prompt shortcut

**Terminal action**:
A human-operated command or shell action that can be launched by a Terminal shortcut. Terminal action defines what runs; User launch preference defines how an eligible action opens. Terminal actions may fall back from split launch to idle Terminal pass-through when the action supports it.
_Avoid_: launch strategy, shortcut name, TUI placement

**External UI feature**:
A Mekann feature whose UI is intentionally launched outside Pi's active TUI, usually to run an independent OpenTUI application. External UI features require a supported External split UI capability and must not fall back to Terminal pass-through.
_Avoid_: terminal action, pass-through fallback, Pi TUI overlay

**Dashboard feature**:
A utility feature that presents human-facing project and usage status in an interactive terminal dashboard. It owns data collection and Pi TUI rendering for `/dashboard`. Images (avatar, contribution graph) are placed via `kitten icat --place` to bypass the TUI overlay compositor, which adds padding spaces that overwrite Kitty image cells. CLI text-mode rendering is available via `mekann-dashboard --text`.
_Avoid_: dashboard shortcut, status command, prompt report, pass-through dashboard

**GitHub dashboard identity**:
The authenticated GitHub account shown in the Dashboard feature, including display name, login, avatar, profile URL, and repository/activity aggregates. It is resolved from `gh` CLI first and from `GITHUB_TOKEN` only when `gh` is unavailable.
_Avoid_: local git user, repo author, GitHub config

**GitHub activity**:
The authenticated account's contribution, pull request, issue, review, repository, and social activity as reported by GitHub APIs. Dashboard GitHub activity is network-backed and should not be inferred from local `git log`.
_Avoid_: local git activity, commit history, repo activity

**Local git activity**:
Activity and repository state derived from the current local checkout, such as branch, recent commits, changed files, and uncommitted work. It is a separate Dashboard view from GitHub activity and must not be presented as GitHub contribution data.
_Avoid_: GitHub activity, contribution graph

**Dashboard avatar**:
The GitHub dashboard identity's profile image rendered in the Dashboard feature. It targets Kitty's graphics protocol because Kitty is the recommended terminal for Mekann terminal integrations.
_Avoid_: text-only profile marker, local account icon

**Kitty-first terminal integration**:
Mekann's terminal-adjacent UX is optimized for Kitty remote control because Kitty is the recommended terminal for this project. Kitty-specific launch behavior must preserve terminal-safe fallback behavior for non-Kitty environments. Kitty split launches may run while Pi is not idle because they do not take over Pi's TTY; pass-through fallback remains idle-only because it suspends Pi and hands over the current terminal.
_Avoid_: Kitty-only integration, terminal lock-in, best-effort terminal support

**Startup terminal clear**:
A utility behavior that clears the terminal screen via ANSI escape sequence when Pi fires `session_start` with reason `startup`. It is controlled by the `terminal.clearOnStartup` global setting (default: `true`) and lives in `utils/terminal/`. It does not fire on `reload`, `new`, `resume`, or `fork`.
_Avoid_: boot screen clear, session reset, TUI clear

**Pi TUI overlay**:
A UI rendered inside Pi's active TUI while Pi keeps ownership of the current TTY. Pi TUI overlay uses Pi TUI and must not run OpenTUI in-place.
_Avoid_: in-Pi OpenTUI, embedded OpenTUI, direct OpenTUI overlay

**Terminal pass-through**:
A human-operated terminal action that temporarily stops Pi's TUI and hands the current TTY to a child command. Terminal pass-through is allowed only when Pi is idle and should not be used to run OpenTUI-style independent TUI applications in-place.
_Avoid_: Pi TUI overlay, external split UI, background TUI

**External split UI**:
A UI launched into a separate terminal-emulator-managed pane or window instead of being rendered inside Pi's current TTY. External split UI may use OpenTUI because it does not take over Pi's TTY.
_Avoid_: Pi overlay, pass-through UI, background TUI

**Terminal UI placement**:
The architectural choice of whether a Mekann extension UI appears as Pi TUI overlay, Terminal pass-through, or External split UI. Pi TUI overlay uses Pi TUI; External split UI may use OpenTUI. Terminal-emulator-specific launching is owned by shared terminal infrastructure rather than individual features. Feature safety constraints and supported placements take precedence over user launch preferences.
_Avoid_: TUI framework preference, renderer choice, terminal styling

**Mekann settings editor**:
A Mekann-owned External split UI for discovering, diagnosing, and safely editing Mekann feature settings. It does not own Pi's extension-loading settings and should distinguish global defaults from workspace overrides when both exist.
_Avoid_: Pi settings editor, settings.json editor, config file browser, Pi TUI settings overlay

**Mekann settings file**:
A Mekann-owned configuration file for persisted Mekann feature settings, with global and workspace variants such as `~/.pi/agent/mekann.json` and `.pi/mekann.json`. It is separate from Pi's `settings.json`, which owns Pi-level configuration such as extension loading.
_Avoid_: Pi settings.json, extension settings file

**User launch preference**:
A user-configurable preference for how an eligible terminal-oriented action should open, such as pass-through or split-longer-side. User-facing launch preference names are terminal-emulator-independent; terminal adapters translate them into Kitty, iTerm2, or other emulator-specific commands. User launch preferences apply only inside the placements and safety constraints supported by the feature.
_Avoid_: feature placement requirement, safety override, TUI framework selection, kitty-specific strategy name

**Terminal emulator capability**:
A terminal emulator's supported integration surface, such as remote control, split creation, image rendering, window sizing, or environment propagation. Capability detection is separate from TUI framework selection.
_Avoid_: TUI capability, Kitty feature flag, renderer support

**Terminal emulator adapter**:
A shared implementation that hides terminal-emulator-specific commands and protocols behind a Mekann-facing API. Terminal-emulator-specific implementations live under `utils/terminal/<emulator>/`, such as `utils/terminal/kitty/`. Feature code should not directly assemble Kitty, iTerm2, or other emulator-specific control commands.
_Avoid_: feature-local terminal control, inline kitty command, per-feature emulator logic

**TUI framework selection**:
The choice of which TUI framework renders a Mekann UI after its placement is known. Pi TUI overlay selects Pi TUI; External split UI may select OpenTUI when the terminal emulator can provide an isolated surface. Shared TUI placement and framework-selection rules live under `utils/tui/`, separate from terminal-emulator adapters.
_Avoid_: terminal emulator detection, renderer preference, styling choice

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

**Delegated implementation loop**:
A cost-aware collaboration pattern where a planning/review model defines the problem, architecture, implementation instructions, and tests, while an implementation model performs the edit-and-test loop until the agreed checks pass. The implementation model treats the tests as fixed; if the tests appear wrong or unexecutable, it returns a test correction request instead of weakening the specification.
_Avoid_: model priority, generic model routing, cheap-model fallback

**Delegated implementation brief**:
The structured Markdown handoff from the planning/review model to the implementation model in a delegated implementation loop. It names the goal, fixed tests, allowed implementation scope, forbidden changes, cheap checks, acceptance checks, blocked-state response, and expected patch-proposal output.
_Avoid_: freeform implementation prompt, model routing contract, autoresearch contract

**Failure handoff**:
The check-failure evidence passed from the parent loop back to the implementation model during a delegated implementation loop. It normally includes the full failure output, but long output should flow through context-control features such as output gate so the implementation model receives a preview plus artifact reference instead of oversized inline logs.
_Avoid_: failure summary, failure excerpt, raw log dumping

**Spec patch**:
The test or specification-facing change produced by the planning/review model in a delegated implementation loop. A spec patch is kept separate from the implementation patch so failures and reviews can distinguish an invalid specification from an incomplete implementation.
_Avoid_: test tweak, implementation patch, merged fix patch

**Implementation patch**:
The production-code change proposed by the implementation model in a delegated implementation loop. An implementation patch is evaluated against the fixed spec patch and should not weaken or rewrite the tests that define the task.
_Avoid_: spec patch, all-in-one patch, test-changing fix

**Autoresearch**:
A higher-autonomy research mode for persistent investigation, candidate generation, and evaluation when ordinary pair programming or goal continuation would be too slow or shallow. Autoresearch is currently metric-driven by default, but the intended concept also includes future non-metric or hard-to-measure research tasks that still need disciplined autonomous evaluation.
_Avoid_: goal, benchmark script, simple automation

**Calibrated evaluation**:
A composite evaluation approach for hard-to-measure autoresearch tasks that combines mechanical checks, structured acceptance criteria, LLM critics or judges, and human review where needed. LLM judgment is useful but should be calibrated against human or expert review before it becomes a trusted decision source.
_Avoid_: LLM-only judgment, subjective vibes

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

**Command normalization**:
A runtime context-management feature that rewrites simple bash tool commands into parse-friendly, bounded forms before execution without changing the search target or evidence owner. Command normalization does not compact raw output; large raw output belongs to Output gate.
_Avoid_: output budget, output compaction, raw output storage

**Context ledger**:
A runtime context-management feature that stores meaningful working-memory events such as decisions, tasks, errors, plans, file changes, and artifact references. Context ledger preserves interpreted session state, while output gate preserves raw tool output.
_Avoid_: output gate, raw log dump

**Context event**:
A context-ledger record of a meaningful working-memory fact, decision, task, error, plan, or boundary. A context event stores interpreted state, not raw output; raw evidence belongs in output-gate artifacts and is linked through references.
_Avoid_: raw log entry, conversation message

**Context recording**:
Runtime context-management responsibility for turning an observed fact from another feature into a context event without exposing context-ledger storage details to that feature. Context recording is the seam between features that observe meaningful work, such as output-gate artifact creation, and context ledger, which persists interpreted session state.
_Avoid_: context-ledger implementation, raw artifact storage, generic event bus

**Effective context status**:
The current status of a context event after projecting append-only context events and their relations. It is distinct from the event's stored status, which records what the event declared when it was written.
_Avoid_: stored status, mutable event status

**Context event relation**:
A forward append-only link from a newer context event to older context events that it supersedes, resolves, or invalidates. Reverse links such as `resolvedBy` are projection results, not persisted event fields.
_Avoid_: mutable back-reference, status update

**Context control plane**:
Agent の次の行動に必要な情報だけを、出自・状態・有効期限・安全境界・関連 scope にもとづいて、保存、索引化、検索、復元、失効、注入するための横断的な設計レイヤー。`output-gate`、`context-ledger`、snapshot、prompt hooks、artifact search、cache-friendly prompt を束ねる考え方であり、単一の feature 名ではない。

It controls what information is allowed to become active runtime context. A feature owns a concrete responsibility and implementation surface; the context control plane is the coordination layer that defines how context-related features interact. Do not confuse this with Project context: Project context is the shared glossary and project-level knowledge in `CONTEXT.md`, while the context control plane is a runtime architecture concept.
_Avoid_: memory feature, conversation summary, context-mode clone

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
The principle for subagent delegation that gives the subagent the task goal, constraints, expected output, and relevant starting points, while avoiding unnecessary parent conversation that would undermine context isolation. Parent context is forked only when it is genuinely needed for correctness or safety. Delegation briefs are written in English by default to improve model consistency and cost efficiency, even when the user-facing conversation is Japanese.
_Avoid_: full conversation dump, context starvation

**Parent-facing subagent output**:
A subagent result style optimized for the parent agent's downstream reasoning, validation, and merge decisions rather than direct human readability. It should be concise, structured, evidence-oriented, and avoid polished prose unless explicitly requested. For `subagent_result_v1` contracts the child emits raw JSON; for free-text results, terse bullet sections or key-value blocks are preferred.
_Avoid_: human-readable report, polished summary, narrative output

**Silent subagent execution**:
The default subagent behavior where a subagent avoids assistant-message progress reports, greetings, status narration, and human-facing play-by-play while it works. The subagent should use tool calls as needed and emit an assistant message only for its final result, a blocked state, or an explicit parent decision request.
_Avoid_: progress reporting, narrated execution, human-facing subagent log

**Queued subagent**:
A subagent delegation that has been accepted but is waiting for an open execution slot. A queued subagent is still visible as an agent so the parent can observe pending work instead of relying on memory or re-spawning attempts.
_Avoid_: hidden spawn backlog, failed spawn, background promise

**Subagent spawn queue**:
The bounded global FIFO queue for accepted subagent delegations that cannot start immediately because execution slots are full. The queue preserves accepted work across turns without treating queued work as failed or forcing the parent agent to remember every pending delegation.
_Avoid_: per-parent scheduler, unbounded backlog, retry loop

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

**Read-only mode**:
A collaboration mode for investigation and consultation where file changes are not allowed. Read-only mode may reuse the existing read-only command intent checks and sandbox profile.
_Avoid_: implementation handoff mode, sandbox profile

**Sub mode**:
A collaboration mode that behaves like main mode while biasing the agent toward proactive subagent delegation and parallel execution for independent investigation, review, exploration, or editing work. Sub mode has its own model and thinking preferences, but it is not a safety boundary and does not change workspace permissions.
_Avoid_: subagent, auto mode, sandbox profile

**Sandbox**:
A safety feature that enforces execution restrictions for the `bash` tool, primarily through OS-level policy when enabled. Sandbox is the hard runtime boundary for command execution, while collaboration modes such as Read-only mode describe user-facing work posture.
_Avoid_: read-only mode, agent-wide security boundary

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

**Actual cache usage**:
Provider-reported token usage that shows whether a prompt request actually reused cached input, such as cache read tokens, cache write tokens, and cache hit rate. It is effect telemetry for cache-friendly prompt, not the same thing as a stable prefix hash or other cacheability prediction.
_Avoid_: cache prediction, stable prefix streak, cache guarantee

**Fragment stability**:
The prompt-fragment classification that determines cache-friendly prompt placement: stable content belongs in the stable prefix, semi-stable content follows it, and dynamic content belongs near the turn tail. Fragment stability is the ordering source of truth; it must not be silently overridden by cache intent.
_Avoid_: cache intent, provider cache status

**Cache intent**:
A prompt-fragment declaration of cache-related intention used for diagnostics and future provider hints. Cache intent does not decide fragment placement; contradictions such as stable content with avoid-cache intent should be surfaced as diagnostics rather than auto-corrected.
_Avoid_: fragment stability, ordering rule

### Codex

**Codex web search**:
A Pi extension tool that exposes the ChatGPT Codex backend-api web search endpoint as an LLM-callable tool. The agent sends a query and receives streamed text, search call metadata, and URL citations.
_Avoid_: codex-search (ambiguous with code search), web search tool (too generic)

**Codex search tool input**:
The parameters the LLM provides when calling codex web search: `query` (required) and `searchContextSize` (optional, default `medium`). All other options (authentication, model, network policy) are resolved internally.
_Avoid_: tool options, tool config

**Codex search execution policy**:
A host-side configuration controlling whether the tool may cross the external network boundary (`externalWebAccess`). This is not a search quality parameter but an execution permission. When `false`, the tool is either unregistered or returns an explicit unavailability error.
_Avoid_: search mode, network setting

**Codex usage**:
A utils suite feature that reads ChatGPT subscription usage and Codex rate-limit windows, then presents them through `/codex-status` and the Pi footer. Its core responsibility is usage retrieval and normalized usage reporting; Pi command registration and footer rendering are adapters around it. The Dashboard feature may embed Codex usage as the first LLM usage panel, but broader Pi-wide LLM usage is a separate expansion.
_Avoid_: codex-status (command-specific), codex usage query (implementation-specific), codex-limits (package name)

**Codex shared**:
The `codex-shared` module inside the utils suite, containing Codex API client primitives shared by `codex-limits` and `codex-web-search`: base URL normalization, auth header generation, account ID extraction, error types and classification, model fetching, model selection, and the in-memory model cache. It does not depend on Pi tool framework types.
_Avoid_: codex-core, codex-base

**Codex shared dependency rule**:
`codex-shared` must not depend on Pi tool framework types or on `codex-limits` / `codex-web-search`. Pi-context-aware auth resolution belongs in each tool module or a thin adapter, not in `codex-shared`.

### Issue worktree management

**Issue worktree**:
A git worktree created for working on a specific GitHub issue, placed in a sibling directory of the main repository. The naming convention is `issue-<number>` for both the branch and the worktree directory. Issue worktrees are managed by the `/issue` command and the `mekann-issue` CLI.
_Avoid_: feature worktree, autoresearch worktree, candidate worktree

**Issue worktree directory**:
A sibling directory of the main repository that holds all issue worktrees for a project. The naming convention is `<project>-worktrees/`. Each worktree inside is named `issue-<number>/` matching its branch name.
_Avoid_: worktree pool, worktree stash, autoresearch-worktrees

**`mekann-issue` CLI**:
A standalone CLI tool that provides two modes: an interactive OpenTUI issue list (no arguments) and a direct worktree-open mode (`--issue <number>`). It creates issue worktrees, launches pi in a Kitty split, and handles cleanup. Registered as a bin in the root `package.json`.
_Avoid_: issue command handler, issue extension

**`/issue` command**:
A Pi extension command registered by the issue worktree feature that validates prerequisites (Kitty terminal, `gh` CLI, git repository) and launches `mekann-issue` in a Kitty split via the Mekann terminal adapter infrastructure. Closed issue worktrees are removed with `/clean-issue-worktrees`.
_Avoid_: issue tool, issue prompt template

**Issue worktree cleanup**:
The batch removal of issue worktrees whose corresponding GitHub issues are closed. Triggered by `/clean-issue-worktrees`, removes both the worktree and the local branch.
_Avoid_: worktree garbage collection, autoresearch candidate removal

**Main Pi**:
The Pi session running on the user's primary working branch from which `/issue` is invoked. It is the stable launch context for issue work and must keep a stable terminal region; it is used as the Kitty split source only for the first issue Pi and never thereafter.
_Avoid_: host session, parent pi, base session

**Issue Pi**:
A Pi session opened in a Kitty split to work on a single issue's worktree, titled `Issue #<number>`. Multiple issue Pi sessions may be open at once, one per issue. Each is identified by its title prefix so pane management can find them statelessly.
_Avoid_: worktree session, child pi, issue window

**Issue autopilot**:
An upper-level automation feature, triggered by `/issue-autopilot`, that processes every open issue labeled `ready-for-agent` across the repository without manual selection. Unlike `/issue` (where the human selects issues with the space key) or `/issue <parent>` (serial, merge-gated orchestration of one parent's children), autopilot auto-selects by label and runs up to a configurable parallel limit (`issue.autopilot.maxParallel`, default 2). Each Work Pi self-runs implement → review_fixer → PR creation, then auto-closes to free its slot. The merge stays human-controlled. Autopilot and the manual `/issue` commands coexist; autopilot is the higher-level path that removes the selection step.
_Avoid_: issue automation, auto-issue, parallel orchestration

**Autopilot supervisor**:
The Main Pi-side extension loop that drives issue autopilot. It maintains the parallel worker pool, enforces the `ready-for-agent` label gate and the `blocked_by` dependency gate, reuses the GitHub-truth snapshot model, and stops when every `ready-for-agent` issue has produced a PR or been demoted to `ready-for-human`. It does not auto-recover from frozen or failed Work Pis; a stopped Work Pi stays as an open pane for the human to notice and handle manually.
_Avoid_: autopilot daemon, detached orchestrator, background worker manager

**Agreement phase**:
The Issue Pi interaction mode entered when a `ready-for-human` issue is opened via the manual `/issue` command. Instead of auto-running implementation, the agent and the human converse in the Issue Pi to converge on a specification; once the human agrees, the agent flips the label to `ready-for-agent` and transitions into the normal implement → review → PR self-run. Agreement content is recorded as a triage-notes-style issue comment so it survives across sessions. Autopilot never enters the agreement phase because it only picks `ready-for-agent` issues; agreement is a manual `/issue`-only path.
_Avoid_: planning phase, pre-implementation chat, spec negotiation window

**Label-gated startability**:
The combined readiness rule for issue work: an issue is startable only when it carries the `ready-for-agent` label and has no open `blocked_by` dependencies. The existing `judgeChild` dependency check is extended with the `ready-for-agent` label gate so that `ready-for-human` / `needs-triage` / `needs-info` / `wontfix` issues are never auto-implemented. This also fixes the legacy `/issue` behavior of opening `ready-for-human` issues straight into agent implementation.
_Avoid_: label filter, triage filter, dependency-only startability

### Development workflow

**OSS reference library**:
A local collection of full-cloned major OSS repositories under `vendor/oss/` used as implementation reference when building Mekann extensions. The agent reads source code from these repositories when the user directs it to consult a specific project for architecture patterns, API design, or implementation ideas. Cloned via `npm run clone:oss` and updated via `npm run update:oss`. The directory is git-ignored and is not part of the Mekann build.
_Avoid_: upstream skill mirror, vendored dependency, build-time reference

## Example dialogue

Developer: "Should this be a goal or autoresearch?"
Domain expert: "Use a goal when the agent should keep pursuing a general objective. Use autoresearch when the task needs higher-autonomy research, repeated candidate generation, and disciplined evaluation."

Developer: "Why not just keep all investigation details in the parent agent?"
Domain expert: "That pollutes the context window. Use subagent delegation with minimal sufficient context for isolated exploration or fresh review, then bring back a structured subagent result."

Developer: "Can this subagent result become an autoresearch candidate?"
Domain expert: "Only after a trust transition. A patch proposal must pass PatchProposalPolicy, and candidate escrow should preserve it for evaluation without applying it to the main worktree."

Developer: "I want to work on issue #42. Should I use an autoresearch worktree?"
Domain expert: "No. Autoresearch worktrees are temporary candidate isolation inside `.pi/autoresearch-worktrees/`. For issue work, use `/issue` — it creates an issue worktree in `<project>-worktrees/issue-42/` and opens an issue Pi in a Kitty split."

Developer: "I already have issue #42 open. If I run `/issue` again for #43, does my Main Pi shrink again?"
Domain expert: "No. The Main Pi is split only for the first issue Pi. On the second and later `/issue`, the existing issue Pi region is split instead, so the Main Pi keeps its stable region. Among multiple issue Pi panes, the widest one is used as the split source so no single pane shrinks to nothing."

Developer: "I want all `ready-for-agent` issues processed overnight. Should I `/issue` each one?"
Domain expert: "No. Use `/issue-autopilot`. It auto-selects every `ready-for-agent` issue, runs up to `maxParallel` Work Pis in parallel, and each Work Pi self-runs to PR creation then auto-closes to free the slot. `/issue` is the manual path where you pick issues with the space key; autopilot is the upper-level path that skips selection."

Developer: "What happens when an agent gets stuck mid-implementation under autopilot?"
Domain expert: "It demotes the issue from `ready-for-agent` to `ready-for-human`, posts a triage-notes-style comment with the open question, does NOT create a PR, and stops. Autopilot won't pick it again because it is no longer `ready-for-agent`. You resolve it later via the agreement phase in a manual `/issue` session."

Developer: "A `ready-for-human` issue needs the human to decide direction. Can autopilot handle it?"
Domain expert: "No. Autopilot only picks `ready-for-agent`. A `ready-for-human` issue opened via manual `/issue` enters the agreement phase, where the agent and human converse in the Issue Pi until the human agrees; then the agent flips the label to `ready-for-agent` and proceeds to implementation."

Developer: "What if a Work Pi freezes under autopilot?"
Domain expert: "Nothing auto-recovers it. The frozen Work Pi stays as an open pane so you notice it and handle it manually. Autopilot has no timeout or retry; the stop condition is only that every `ready-for-agent` issue has produced a PR or been demoted."

Developer: "Can `/issue` work without Kitty?"
Domain expert: "No. Issue worktree management is Kitty-only because it relies on Kitty split to open a separate pi session. Without Kitty the command is not registered."

Developer: "What happens when the PR is merged?"
Domain expert: "Run `/clean-issue-worktrees`. It removes issue worktrees whose issues are closed, including both the worktree directory and the local branch."
