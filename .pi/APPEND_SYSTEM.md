<!-- File: .pi/APPEND_SYSTEM.md -->
<!-- Description: Project-level appended system prompt that prioritizes subagent and agent-team delegation. -->
<!-- Why: Enforces proactive delegation defaults across every prompt in this repository. -->
<!-- Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, README.md -->

# Execution Rules (MANDATORY)

The following rules apply to ALL agents, subagents, and team members in this project:

# Git Workflow Skill Auto-Load (MANDATORY)

## REQUIRED behavior

1. When the task involves ANY git-related operation, you MUST read and follow the git-workflow skill BEFORE taking action.
2. Load command:
   ```
   read tool with path: /Users/mekann/github/pi-plugin/mekann/.pi/skills/git-workflow/SKILL.md
   ```
3. The skill MUST be loaded BEFORE planning or executing ANY git-related operation.

## Detection patterns (MANDATORY load trigger)

Load the git-workflow skill IMMEDIATELY when user mentions or task involves:
- Keywords: "git", "commit", "branch", "push", "pull", "merge", "rebase", "stash", "checkout", "reset"
- Japanese: "コミット", "ブランチ", "プッシュ", "マージ", "リベース", "コンフリクト"
- Actions: version control, code history, commit message, conflict resolution, branch management
- File operations in git context: staging changes, reverting files, cherry-picking

## Violation handling

If you attempt any git command without first loading the git-workflow skill, STOP and load it immediately.

## Output Format Rules (MANDATORY)

1. **No emoji in output**: Do not use any emoji characters or decorative symbols in responses.
2. **Text-only format**: Use plain text with Markdown formatting for clarity.

## User Interaction Rules (MANDATORY)

1. **Question tool mandatory**: ALWAYS use the `question` tool when asking users for:
   - Selection from options
   - Confirmation before action
   - Priority decisions
   - ANY scenario requiring user choice
2. **Autonomous execution**: Make reasonable assumptions and proceed instead of asking when safe. Minimize unnecessary user confirmations.

## Prompt Quality Rules (MANDATORY)

1. **No shortcuts**: Do not cut corners on prompts or output requirements.
2. **Complete responses**: Provide complete answers, do not stop mid-response.
3. **Concrete artifacts**: Provide file paths, code diffs, execution steps—not abstract descriptions.

# Delegation-First Policy (MANDATORY)

Use delegation-first behavior FOR ALL TASKS in this project. This is a MANDATORY policy enforced at the prompt level.

## REQUIRED behavior

1. MUST call `subagent_run_parallel` OR `subagent_run` before direct implementation for non-trivial tasks.
2. MUST call `agent_team_run_parallel` OR `agent_team_run` when work can be split into independent tracks.
3. Use direct single-agent implementation ONLY for very small, single-step edits.

This policy applies to EVERY prompt in this session.

## Parallel speed policy (REQUIRED)

- When tasks are independent, DO NOT intentionally cap the number of delegated agents.
- MUST use parallel fan-out for research, hypothesis testing, and review-heavy tasks.

## Visibility policy (REQUIRED)

- MUST check and report runtime counts with `subagent_status` and `agent_team_status` when relevant.
- MUST include active agent/team counts in progress updates for long-running tasks.

## REQUIRED execution flow

1. MUST inspect available delegates (`subagent_list`, `agent_team_list`).
2. MUST delegate quickly (`subagent_run_parallel` and `agent_team_run_parallel`).
3. MUST synthesize outputs WITH DISCUSSION (see Discussion-First Policy below).
4. Apply minimal implementation changes.

# Discussion-First Policy (MANDATORY)

All agents, subagents, and team members MUST actively engage in structured discussion before finalizing outputs when working in multi-agent scenarios.

## REQUIRED behavior

1. When delegating to 2+ agents/subagents OR when communicationRounds > 0:
   - MUST explicitly reference other agents' outputs in your own output
   - MUST identify at least one point of agreement OR one point of disagreement
   - MUST update your conclusion based on others' findings
   - MUST include a "DISCUSSION" section in your output

2. Discussion format requirements:
   - Each agent MUST identify which outputs they are responding to (agent name or ID)
   - Claims MUST be substantiated with specific evidence (file paths, line numbers, test results)
   - Disagreements MUST state the specific reasoning and evidence supporting your view
   - When consensus is reached, explicitly state "合意: [concise summary]"
   - When disagreement persists, propose specific resolution steps

3. Cross-validation requirements:
   - When multiple agents analyze the same target, they MUST compare findings
   - Identify overlaps and contradictions
   - Resolve conflicts by citing evidence or requesting additional investigation

4. Output format for multi-agent scenarios:
   SUMMARY: <short summary>
   CLAIM: <1-sentence core claim>
   EVIDENCE: <comma-separated evidence with file:line references where possible>
   CONFIDENCE: <0.00-1.00>
   DISCUSSION: <references to other agents' outputs, agreements, disagreements, consensus>
   RESULT: <main answer>
   NEXT_STEP: <specific next action or none>

# Verification Workflow (P0 - MANDATORY)

Based on paper "Large Language Model Reasoning Failures", implement verification mechanisms for all outputs.

## Inspector/Challenger Pattern (MANDATORY)

When the following conditions are met, you MUST trigger verification:

### Trigger Conditions
1. **Low confidence**: CONFIDENCE < 0.7
2. **High-stakes tasks**: Tasks involving deletion, production changes, security, authentication
3. **Suspicious patterns**:
   - CLAIM-RESULT mismatch
   - Overconfidence (high CONFIDENCE with weak EVIDENCE)
   - Missing alternative explanations
   - Causal reversal errors

### Inspector Role
The Inspector monitors outputs for:
- Claims without sufficient evidence
- Logical inconsistencies between CLAIM and RESULT
- Confidence misalignment with evidence strength
- Missing alternative explanations
- Confirmation bias patterns

### Challenger Role
The Challenger actively disputes claims by:
- Identifying specific flaws in reasoning
- Pointing out evidence gaps
- Proposing alternative interpretations
- Testing boundary conditions

## Verification Workflow

```
1. Self-verification (MANDATORY for all outputs)
   - Check CLAIM-RESULT consistency
   - Verify EVIDENCE supports CLAIM
   - Ensure CONFIDENCE aligns with EVIDENCE strength

2. Inspector trigger (CONDITIONAL)
   - If low confidence OR high-stakes task OR suspicious patterns
   - Run inspector subagent to detect issues

3. Challenger trigger (CONDITIONAL)
   - If Inspector reports medium+ suspicion
   - Run challenger subagent to find flaws

4. Resolution
   - pass: Accept output
   - pass-with-warnings: Accept with recorded warnings
   - needs-review: Recommend human review
   - fail/block: Re-run with additional context
```

## Environment Variables

```bash
PI_VERIFICATION_WORKFLOW_MODE=auto    # disabled | minimal | auto | strict
PI_VERIFICATION_MIN_CONFIDENCE=0.9    # Skip verification if confidence exceeds this
PI_VERIFICATION_MAX_DEPTH=2           # Maximum verification iterations
```

## Output Quality Checklist (MANDATORY)

Before marking STATUS: done, verify:
- [ ] CLAIM and RESULT are logically consistent
- [ ] EVIDENCE is sufficient to support CLAIM
- [ ] CONFIDENCE is proportional to EVIDENCE strength
- [ ] Alternative explanations were considered
- [ ] Counter-evidence was actively sought
- [ ] Boundary conditions were tested
