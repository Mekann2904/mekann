---
title: AgentDiet Trajectory Reduction Implementation Plan
category: development
audience: developer
last_updated: 2026-03-01
tags: [trajectory-reduction, cost-optimization, agent-efficiency]
related: [research/trajectory-reduction-paper.md, extensions/subagents.ts, extensions/loop.ts]
---

# AgentDiet Trajectory Reduction Implementation Plan

## Executive Summary

**Recommendation: ADOPT with phased rollout**

AgentDiet trajectory reduction is highly compatible with mekann's architecture and offers 21-36% cost reduction with minimal performance impact. Implementation as a new extension is recommended.

---

## 1. Current System Compatibility

### 1.1 Architecture Alignment

| Component | Compatibility | Notes |
|-----------|---------------|-------|
| **subagents.ts** | HIGH | Multi-step execution with trajectory accumulation matches paper's model |
| **loop.ts** | HIGH | Autonomous iteration already tracks steps and messages |
| **agent-teams.ts** | MEDIUM | Parallel execution requires per-agent trajectory management |
| **agent-runtime** | HIGH | Existing step-based execution aligns with sliding window approach |

### 1.2 Integration Points

```
Current Flow:
  User Request → subagent_run → LLM call → Tool execution → Trajectory update → Repeat

With AgentDiet:
  User Request → subagent_run → LLM call → Tool execution → Trajectory update
                                    ↓
                          [Reflection Module] ← New component
                                    ↓
                          Trajectory compression
                                    ↓
                                Repeat
```

### 1.3 Required Changes

| Scope | Changes Required |
|-------|------------------|
| **Core** | Add reflection module hook after each step |
| **Extensions** | Modify `subagents.ts`, `loop.ts`, `agent-teams.ts` |
| **Libraries** | Create `lib/trajectory-reduction.ts` |
| **Configuration** | Add parameters to `pi.json` or `.pi/config/` |

---

## 2. Benefits Analysis

### 2.1 Cost Reduction Estimate

Based on paper results (SWE-bench Verified + Multi-SWE-bench Flash):

| Metric | Paper Result | mekann Estimate |
|--------|--------------|-----------------|
| Input token reduction | 39.9% - 59.7% | **40-50%** (conservative) |
| Final cost reduction | 21.1% - 35.9% | **20-30%** (conservative) |
| Performance impact | -1.0% to +2.0% | **Neutral** |

**Annual Savings Estimate** (hypothetical 1M token/day usage):
- Original cost: ~$5,400/year (Claude 4 Sonnet rates)
- With AgentDiet: ~$3,780/year
- **Savings: ~$1,620/year (30%)**

### 2.2 Performance Impact

| Aspect | Impact | Rationale |
|--------|--------|-----------|
| Latency | +5-10% | Reflection module adds overhead |
| Throughput | +20-30% | Fewer tokens per request |
| Memory | Reduced | Shorter trajectories consume less context |
| Success rate | Neutral | Paper shows no degradation |

### 2.3 User Experience Improvements

1. **Lower costs** for long-running tasks (ul-workflow, agent-teams)
2. **Fewer context overflow errors** in extended sessions
3. **Better stability** for Gemini models (reduced step count)

---

## 3. Risks and Mitigations

### 3.1 Implementation Complexity

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM integration for reflection | MEDIUM | Use existing `callModelViaPi` infrastructure |
| Sliding window state management | LOW | Single state object per run |
| Serialization/deserialization | LOW | Reuse existing message formatting |

### 3.2 Overhead Concerns

| Component | Overhead | Management |
|-----------|----------|------------|
| Reflection LLM call | ~$0.001/step | Use GPT-4o mini (12x cheaper) |
| Serialization | <10ms/step | Threshold θ=500 skips short steps |
| KV Cache invalidation | Already accounted | Sliding window preserves most cache |

**Break-even Analysis**:
- Steps < 5: Overhead may exceed benefit
- Steps 5-20: Moderate benefit (10-20%)
- Steps > 20: Maximum benefit (25-35%)

### 3.3 Information Loss Risk

| Risk Type | Probability | Mitigation |
|-----------|-------------|------------|
| Critical info removed | LOW | θ=500 threshold, sliding window delay |
| Context fragmentation | MEDIUM | a=2 delay preserves recent context |
| Reflection LLM errors | LOW | Threshold check before applying |

**Fallback Strategy**: Disable trajectory reduction if Pass% drops >5%

---

## 4. Implementation as pi Extension

### 4.1 Architecture Decision

**Recommendation: New extension + shared library**

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| New extension | Clean separation, optional feature | Additional file | ✅ SELECTED |
| Integrate into subagents.ts | No new files | Tight coupling, harder to disable | ❌ |
| Integrate into agent-runtime | Centralized | Affects all extensions | ❌ |

### 4.2 File Structure

```
.pi/
├── extensions/
│   └── trajectory-reduction.ts    # NEW: Extension entry point
├── lib/
│   └── trajectory-reduction/
│       ├── index.ts               # Main module
│       ├── reflection-module.ts   # LLM-based waste detection
│       ├── sliding-window.ts      # Context window management
│       ├── serialization.ts       # Message serialization
│       └── types.ts               # Type definitions
└── skills/
    └── trajectory-reduction/
        └── SKILL.md               # Usage guide
```

### 4.3 Required pi SDK APIs

```typescript
// Already available in mekann
import { callModelViaPi } from "./shared/pi-print-executor";
import { getLogger } from "../lib/comprehensive-logger";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// New requirements
interface TrajectoryReductionAPI {
  // Access to current trajectory
  getTrajectory(): Message[];
  
  // Modify trajectory step
  setTrajectoryStep(index: number, content: string): void;
  
  // Token counting
  countTokens(messages: Message[]): number;
}
```

### 4.4 Configuration Parameters

```json
{
  "trajectoryReduction": {
    "enabled": true,
    "reflectionModel": "gpt-4o-mini",
    "threshold": 500,
    "stepsAfter": 2,
    "stepsBefore": 1,
    "skipShortTasks": true,
    "minStepsForReduction": 5,
    "logReductions": true
  }
}
```

### 4.5 Extension API Design

```typescript
// Tool: trajectory_reduce
// Description: Manually trigger trajectory reduction (for debugging)

// Tool: trajectory_stats
// Description: Show current trajectory statistics

// Automatic integration via hook:
// After each step in subagent_run, loop_run, agent_team_run
```

---

## 5. Recommendations

### 5.1 Adoption Decision

**RECOMMENDED: Proceed with implementation**

| Criterion | Assessment | Score |
|-----------|------------|-------|
| Cost benefit | 20-30% reduction | 9/10 |
| Performance risk | Minimal impact | 8/10 |
| Implementation effort | 2-3 days | 7/10 |
| Maintenance burden | Low | 8/10 |
| Strategic value | High (efficiency focus) | 9/10 |
| **Total** | | **41/50** |

### 5.2 Priority

**Priority: HIGH (P1)**

- Aligns with efficiency goals
- Low risk with high reward
- Enables longer-running agents
- Competitive advantage (cost efficiency)

### 5.3 Implementation Roadmap

#### Phase 1: Core Implementation (Week 1)
- [ ] Create `lib/trajectory-reduction/` module structure
- [ ] Implement `reflection-module.ts` with LLM integration
- [ ] Implement `sliding-window.ts` context management
- [ ] Add configuration schema to `pi.json`

#### Phase 2: Extension Integration (Week 2)
- [ ] Create `extensions/trajectory-reduction.ts`
- [ ] Integrate with `subagents.ts` (hook after each step)
- [ ] Integrate with `loop.ts` (hook after each iteration)
- [ ] Add `trajectory_stats` tool for monitoring

#### Phase 3: Testing & Validation (Week 3)
- [ ] Unit tests for each module
- [ ] Integration tests with existing agents
- [ ] A/B testing framework for cost/performance comparison
- [ ] Benchmark against baseline (no reduction)

#### Phase 4: Rollout (Week 4)
- [ ] Feature flag for gradual enablement
- [ ] Documentation and skill guide
- [ ] Monitoring dashboard for cost savings
- [ ] User communication

### 5.4 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cost reduction | ≥20% | Compare token usage before/after |
| Pass% change | ±2% | Compare task success rate |
| Latency overhead | ≤10% | Measure step duration |
| User adoption | ≥80% | Track enablement rate |

---

## 6. Open Questions

1. **Reflection model selection**: GPT-4o mini vs. Claude Haiku vs. local model?
   - Recommendation: Start with GPT-4o mini (paper-validated), benchmark alternatives

2. **Multi-agent scenarios**: Apply reduction to all agents or coordinator only?
   - Recommendation: Per-agent reduction with shared reflection module

3. **Streaming support**: How to handle streaming responses?
   - Recommendation: Buffer until step complete, then reduce

4. **Caching integration**: Interaction with pi's existing context caching?
   - Recommendation: Reduce before cache, preserve cache keys

---

## Appendix A: Algorithm Pseudocode for mekann

```typescript
// Integration in subagents.ts after tool execution
async function afterToolExecution(
  step: number,
  trajectory: Message[],
  config: TrajectoryReductionConfig
): Promise<void> {
  const targetStep = step - config.stepsAfter;
  
  if (targetStep <= 0) return;
  
  const originalLength = countTokens(trajectory[targetStep]);
  if (originalLength <= config.threshold) return;
  
  const context = trajectory.slice(
    Math.max(0, targetStep - config.stepsBefore),
    step
  );
  
  const reduced = await callReflectionLLM(context, targetStep, config);
  const reducedLength = countTokens(reduced);
  
  if (originalLength - reducedLength > config.threshold) {
    trajectory[targetStep] = reduced;
    logReduction(step, originalLength, reducedLength);
  }
}
```

---

## Appendix B: References

- Paper: "Improving the Efficiency of LLM Agent Systems through Trajectory Reduction" (Xiao et al., 2025)
- Research report: `.pi/ul-workflow/research/trajectory-reduction-paper.md`
- Related extensions: `.pi/extensions/subagents.ts`, `.pi/extensions/loop.ts`
- LLMLingua-2: Prior work on prompt compression
