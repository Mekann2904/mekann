# Research: Paper Concepts Integration Analysis

## Executive Summary

The mekann system already implements significant portions of the paper concepts. Key gaps exist in: (1) Tool Classifier for automatic grouping, (2) Optimal Model Combination patterns, and (3) Token reduction via null replacement.

---

## 1. Current System Analysis

### 1.1 Tool Compiler (`tool-compiler.ts` + `tool-fuser.ts`)

**Current Implementation:**
- Tool fusion via `compile_tools()` groups independent tool calls
- Dependency graph analysis (DAG-based)
- Topological sort for execution order
- Token savings calculation
- Parallel execution via `execute_compiled()`

**Key Code:**
```typescript
// tool-compiler.ts:69-76
export function integrateWithSubagents(
  tools: ToolCall[],
  fuserConfig?: Partial<FusionConfig>
): { compiled: CompilationResult; shouldUseFusion: boolean }
```

**Gap vs Paper:**
| Feature | Paper | mekann | Gap |
|---------|-------|--------|-----|
| Tool Classifier | Yes | No | HIGH |
| Multi Calling Prompt | Yes | Partial | MEDIUM |
| Result Integration | Yes | No | MEDIUM |
| Dependency Analysis | Yes | Yes | NONE |
| Parallel Execution | Yes | Yes | NONE |

### 1.2 Subagent System (`subagents.ts`)

**Current Implementation:**
- Per-subagent model/provider override (`SubagentDefinition.model`, `.provider`)
- Parallel execution via `subagent_run_parallel`
- DAG execution via `subagent_run_dag` with `DagExecutor`
- DynTaskMAS weight-based scheduling integrated
- Runtime capacity management with adaptive penalty

**Key Code:**
```typescript
// subagents.ts:83-90
interface SubagentDefinition {
  provider?: string;  // Model override support
  model?: string;     // Model override support
  // ...
}
```

**Gap vs Paper:**
| Feature | Paper | mekann | Gap |
|---------|-------|--------|-----|
| Planner Model | GPT-3.5t | Not specified | LOW |
| Solver Model | GPT-4o | Not specified | LOW |
| Model per role | Yes | Yes | NONE |

### 1.3 DAG Executor (`dag-executor.ts`)

**Current Implementation:**
- DynTaskMAS weight-based scheduling
- Priority scheduling with starvation prevention
- Context injection from dependencies
- Concurrency limiting

**Key Code:**
```typescript
// dag-executor.ts:105-114
export interface DagExecutorOptions {
  useWeightBasedScheduling?: boolean;  // DynTaskMAS integration
  weightConfig?: WeightConfig;
  schedulerConfig?: SchedulerConfig;
}
```

### 1.4 Cross-Instance Coordinator (`cross-instance-coordinator.ts`)

**Current Implementation:**
- File-based instance registration
- Heartbeat-based liveness detection
- Work stealing with distributed locks
- Model-specific parallel limits

### 1.5 Provider Limits (`provider-limits.ts`)

**Current Implementation:**
- Per-provider/model/tier RPM/TPM limits
- Concurrency limits
- User-configurable overrides

---

## 2. Concept-by-Concept Integration Assessment

### 2.1 Concurrent API Calls

**Technical Feasibility:** HIGH

**Current Affinity:** HIGH
- `ToolFuser` already groups tools
- `runWithConcurrencyLimit()` supports parallel execution
- Integration hooks exist in `integrateWithSubagents()`

**Required New Development:**
1. **Tool Classifier** - Classify tools by purpose (search, read, write)
2. **Multi Calling Prompt** - Prompt template for grouped tool invocation
3. **Result Aggregator** - Merge results from parallel calls

**Estimated Effort:** 2-3 days

**Implementation Path:**
```typescript
// New: lib/tool-classifier.ts
interface ToolClass {
  category: "search" | "read" | "write" | "execute";
  purpose: string;
  canParallelize: boolean;
}

function classifyTool(tool: ToolCall): ToolClass;

// Enhance: lib/tool-fuser.ts
function groupByClassification(tools: ToolCall[]): Map<ToolClass, ToolCall[]>;
```

### 2.2 Optimal Model Combination

**Technical Feasibility:** HIGH

**Current Affinity:** MEDIUM
- SubagentDefinition supports model/provider per agent
- No explicit Planner/Solver/Worker role distinction

**Required New Development:**
1. **Role-based Model Selection** - Map roles to optimal models
2. **Model Configuration Presets** - "planner", "solver", "worker" profiles
3. **Cost/Performance Tracking** - Validate paper's claim

**Estimated Effort:** 1-2 days

**Implementation Path:**
```typescript
// New: lib/model-combination.ts
interface ModelCombinationConfig {
  planner: { provider: string; model: string };
  solver: { provider: string; model: string };
  worker: { provider: string; model: string };
}

const REWOO_PRESET: ModelCombinationConfig = {
  planner: { provider: "openai", model: "gpt-3.5-turbo" },
  solver: { provider: "openai", model: "gpt-4o" },
  worker: { provider: "anthropic", model: "claude-3-5-haiku" },
};
```

### 2.3 ReWOO Workflow

**Technical Feasibility:** MEDIUM

**Current Affinity:** HIGH
- `subagent_run_dag` implements DAG execution
- Planner -> Worker -> Solver mapping exists implicitly
- DynTaskMAS scheduling for efficiency

**Key Similarity with UL Workflow:**
| ReWOO Phase | UL Workflow Phase | mekann Component |
|-------------|-------------------|------------------|
| Planner | Research + Plan | Main agent + DAG builder |
| Worker | Implement | `subagent_run` / `agent_team_run` |
| Solver | Final output | Main agent aggregation |

**Key Difference:**
- ReWOO: Planner generates complete plan upfront
- UL Workflow: Interactive annotation cycle with user
- mekann: Supports both via `plan` parameter in `subagent_run_dag`

**Estimated Effort:** 1 day (documentation + presets)

### 2.4 Exception Handling Token Reduction

**Technical Feasibility:** HIGH

**Current Affinity:** LOW
- No null replacement for "not find" results
- Full tool outputs passed to context

**Required New Development:**
1. **Result Normalizer** - Detect "not found" patterns
2. **Null Replacement** - Replace with minimal placeholder
3. **Token Counter** - Track savings

**Estimated Effort:** 1 day

**Implementation Path:**
```typescript
// New: lib/result-normalizer.ts
const NOT_FOUND_PATTERNS = [
  /not find/i,
  /no results/i,
  /empty/i,
  /not found/i,
];

function normalizeResult(result: string): string | null {
  for (const pattern of NOT_FOUND_PATTERNS) {
    if (pattern.test(result)) return null;
  }
  return result;
}
```

---

## 3. Implementation Priority

### HIGH Priority (Immediate)

| Concept | Effort | Impact | Risk |
|---------|--------|--------|------|
| Exception Handling Token Reduction | 1 day | 19% cost savings | LOW |
| Optimal Model Combination | 1-2 days | Quality improvement | LOW |

### MEDIUM Priority (Short-term)

| Concept | Effort | Impact | Risk |
|---------|--------|--------|------|
| Tool Classifier | 2 days | 4.4-9.3% accuracy | MEDIUM |
| Result Aggregator | 1 day | Consistency | LOW |

### LOW Priority (Long-term)

| Concept | Effort | Impact | Risk |
|---------|--------|--------|------|
| Multi Calling Prompt | 2-3 days | Latency reduction | MEDIUM |
| ReWOO Presets | 1 day | Workflow standardization | LOW |

---

## 4. Concerns and Risks

### 4.1 Tool Classifier Accuracy
- **Risk:** Misclassification leads to incorrect parallelization
- **Mitigation:** Start with explicit categories, add ML-based classification later

### 4.2 Model Combination Validation
- **Risk:** Paper's GPT-3.5t/GPT-4o finding may not generalize
- **Mitigation:** A/B testing with cost tracking

### 4.3 Cross-Provider Latency
- **Risk:** Different providers have varying response times
- **Mitigation:** Use `provider-limits.ts` concurrency controls

### 4.4 Token Reduction Information Loss
- **Risk:** "not find" may contain useful context
- **Mitigation:** Configurable patterns, preserve original in debug mode

---

## 5. Architecture Integration Points

```
                    ┌─────────────────┐
                    │  Tool Compiler  │
                    │  (compile_tools)│
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Tool Classifier │ │ Result Normalizer│ │ Model Combination│
│    (NEW)        │ │    (NEW)        │ │    (NEW)        │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Subagent System │
                    │ (subagent_run)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  DAG Executor   │
                    │ (DynTaskMAS)    │
                    └─────────────────┘
```

---

## 6. Recommended Next Steps

1. **Week 1:** Implement Result Normalizer + Model Combination presets
2. **Week 2:** Add Tool Classifier with explicit categories
3. **Week 3:** Integrate Multi Calling Prompt pattern
4. **Week 4:** A/B testing and metrics collection

---

## 7. Key Code References

| Component | File | Lines |
|-----------|------|-------|
| Tool Fusion | `.pi/lib/tool-fuser.ts` | 1-200 |
| Subagent Model Override | `.pi/extensions/subagents.ts` | 83-90 |
| DAG Executor | `.pi/lib/dag-executor.ts` | 1-150 |
| Provider Limits | `.pi/lib/provider-limits.ts` | 1-100 |
| Cross-Instance Coord | `.pi/lib/cross-instance-coordinator.ts` | 1-150 |
