# Phase-Separated Agent Teams Design

## Problem

When using `strategy: "parallel"`, all team members start simultaneously even if they are assigned to different phases (Phase 1, Phase 2, Phase 3). This causes:

1. **Phase collision**: Phase 2 members start before Phase 1 completes
2. **Duplicate work**: Multiple members read the same files independently
3. **Context loss**: Later phases lack results from earlier phases

## Solution: Phase-Separated Teams

Split teams by phase instead of role within a single team.

### Before (Single Team, Parallel Problem)

```yaml
core-delivery-team:
  strategy: parallel  # Problem: all phases start together
  members:
    - research (Phase 1: Investigation)
    - build (Phase 2: Implementation)
    - review (Phase 3: Quality Review)
```

### After (Phase-Separated Teams)

```yaml
# Phase 1 Team
core-delivery-phase1:
  strategy: parallel  # Multiple investigators can work in parallel
  members:
    - research-1
    - research-2
    - research-3

# Phase 2 Team  
core-delivery-phase2:
  strategy: parallel
  members:
    - build-1
    - build-2

# Phase 3 Team
core-delivery-phase3:
  strategy: parallel
  members:
    - review-1
    - review-2
```

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Investigation                                      │
│  agent_team_run(teamId: "core-delivery-phase1")             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                        │
│  │research1│ │research2│ │research3│  (parallel)            │
│  └─────────┘ └─────────┘ └─────────┘                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ Wait for completion
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Implementation                                     │
│  agent_team_run(teamId: "core-delivery-phase2",             │
│    task: `... based on Phase 1 results: ${phase1Result}`)   │
│  ┌─────────┐ ┌─────────┐                                    │
│  │ build1  │ │ build2  │  (parallel)                        │
│  └─────────┘ └─────────┘                                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ Wait for completion
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Review                                             │
│  agent_team_run(teamId: "core-delivery-phase3",             │
│    task: `... review Phase 2 implementation: ${phase2Result}`│
│  ┌─────────┐ ┌─────────┐                                    │
│  │review1  │ │review2  │  (parallel)                        │
│  └─────────┘ └─────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

## Benefits

1. **No phase collision**: Each phase completes before the next starts
2. **Context handoff**: Each phase receives results from previous phase
3. **Parallelism preserved**: Multiple members within a phase work in parallel
4. **Clear responsibility**: Team members focus on their phase specialty

## Team Definition Template

### Phase 1 Team (Investigation)

```typescript
{
  id: "core-delivery-phase1",
  name: "Core Delivery - Phase 1 Investigation",
  description: "Investigation phase team. Gathers requirements, analyzes codebase, identifies constraints. Passes findings to Phase 2.",
  members: [
    {
      id: "research-1",
      role: "Primary Researcher",
      description: "Lead investigation of files, dependencies, and constraints"
    },
    {
      id: "research-2", 
      role: "Secondary Researcher",
      description: "Cross-validate findings and explore edge cases"
    }
  ]
}
```

### Phase 2 Team (Implementation)

```typescript
{
  id: "core-delivery-phase2",
  name: "Core Delivery - Phase 2 Implementation",
  description: "Implementation phase team. Designs and builds solution based on Phase 1 findings. Passes implementation to Phase 3.",
  members: [
    {
      id: "build-1",
      role: "Primary Implementer",
      description: "Lead implementation based on investigation results"
    },
    {
      id: "build-2",
      role: "Secondary Implementer", 
      description: "Handle edge cases and integration points"
    }
  ]
}
```

### Phase 3 Team (Review)

```typescript
{
  id: "core-delivery-phase3",
  name: "Core Delivery - Phase 3 Review",
  description: "Review phase team. Validates implementation quality, identifies risks, ensures completeness.",
  members: [
    {
      id: "review-1",
      role: "Quality Reviewer",
      description: "Review code quality, test coverage, and edge cases"
    },
    {
      id: "review-2",
      role: "Risk Reviewer",
      description: "Identify security, performance, and maintenance risks"
    }
  ]
}
```

## Migration Guide

### Current Pattern (Problematic)

```
Single team with phase-labeled members
→ agent_team_run with strategy: parallel
→ All phases start simultaneously
```

### New Pattern (Phase-Separated)

```
Multiple teams, one per phase
→ Sequential agent_team_run calls
→ Each phase waits for previous to complete
→ Results passed between phases via task context
```

## Implementation Checklist

- [x] Create phase-separated team definitions
- [x] Update existing teams to phase-separated versions
- [ ] Create helper function for sequential phase execution
- [ ] Document in team creation guide

Note: APPEND_SYSTEM.mdの更新タスクは削除（既に対応済み）。

## Created Phase-Separated Teams

以下のチームがフェーズ分割済みです：

| 元チーム | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---------|---------|---------|---------|---------|
| core-delivery-team | core-delivery-p1 (Investigation) | core-delivery-p2 (Implementation) | core-delivery-p3 (Review) | - |
| bug-war-room | bug-war-room-p1 (Root Cause) | bug-war-room-p2 (Pattern) | bug-war-room-p3 (Hypothesis) | bug-war-room-p4 (Implementation) |
| code-excellence-review-team | code-excellence-p1 (Readability) | code-excellence-p2 (Architecture) | code-excellence-p3 (Synthesis) | - |
| design-discovery-team | design-discovery-p1 (Requirements) | design-discovery-p2 (Trade-offs) | design-discovery-p3 (Design) | - |
| docs-enablement-team | docs-enablement-p1 (Onboarding) | docs-enablement-p2 (Runbook) | docs-enablement-p3 (Quality) | - |
| file-organizer-team | file-organizer-p1 (Analysis) | file-organizer-p2 (Plan) | file-organizer-p3 (Execution) | - |
| mermaid-diagram-team | mermaid-diagram-p1 (Analysis) | mermaid-diagram-p2 (Authoring) | mermaid-diagram-p3 (Syntax) | mermaid-diagram-p4 (Consistency) |
| rapid-swarm-team | rapid-swarm-p1 (Interface) | rapid-swarm-p2 (Dataflow) | rapid-swarm-p3 (Synthesis) | - |
| refactor-migration-team | refactor-migration-p1 (Impact) | refactor-migration-p2 (Plan) | refactor-migration-p3 (Implementation) | - |
| security-hardening-team | security-hardening-p1 (Threat) | security-hardening-p2 (Auth) | security-hardening-p3 (Review) | - |
| skill-creation-team | skill-creation-p1 (Design) | skill-creation-p2 (Authoring) | skill-creation-p3 (Validation) | - |

## Usage Example

```javascript
// Sequential phase execution
const task = "Implement user authentication feature";

// Phase 1: Investigation
const phase1 = await agent_team_run({
  teamId: "core-delivery-p1",
  task: task
});

// Phase 2: Implementation (with Phase 1 context)
const phase2 = await agent_team_run({
  teamId: "core-delivery-p2",
  task: `${task}\n\nPhase 1 Investigation Results:\n${phase1.output}`
});

// Phase 3: Review (with Phase 1 & 2 context)
const phase3 = await agent_team_run({
  teamId: "core-delivery-p3",
  task: `${task}\n\nPhase 1 Results:\n${phase1.output}\n\nPhase 2 Implementation:\n${phase2.output}`
});
```

## Exception: research-team

`research-team`はフェーズ分割されていません。理由は以下の通り:

1. **専門性重視の設計**: 9人の永続メンバーがそれぞれ固有の専門分野（PI/PM, Acquisition, Steward, EDA, Statistician, ML Engineer, DL Specialist, Bayes/Optimization, Viz/XAI）を持つ
2. **ワークフロー全体の一体性**: 研究プロジェクトは各フェーズ間で密接な連携が必要であり、成果物の受け渡し仕様（Artifact Contracts）が明確に定義されている
3. **内部フェーズ管理**: チーム自体が内部で4フェーズ（計画・設計、データ準備、分析実行、統合・報告）を順次実行する設計
4. **メンバー固定性**: 他のチームと異なり、メンバーが動的に追加・削除されるのではなく、固定的な専門役割として定義されている

このチームは`strategy: parallel`を使用しますが、各メンバーが担当フェーズに応じて順次作業を行うため、フェーズ衝突の問題は発生しません。

## Future Enhancements

1. **Auto-phase-split**: Automatically split legacy single teams into phase teams
2. **Phase orchestrator skill**: Skill that manages multi-phase execution flow
3. **Context compression**: Smart summarization between phases to reduce token usage
