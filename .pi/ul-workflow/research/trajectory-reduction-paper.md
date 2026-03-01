# Trajectory Reduction Paper Research Report

**Paper Title:** Improving the Efficiency of LLM Agent Systems through Trajectory Reduction
**URL:** https://arxiv.org/html/2509.23586v1
**Authors:** Yuan-An Xiao (Peking University), Pengfei Gao (ByteDance), Chao Peng (ByteDance), Yingfei Xiong (Peking University)
**Date:** 2018 (based on paper metadata)

---

## 1. 論文の概要と目的 (Overview and Objectives)

### Purpose
This paper addresses a critical efficiency problem in LLM agent systems: the ever-growing trajectory that accumulates tokens throughout multi-step reasoning and tool-calling workflows. The primary goal is to reduce the computational cost of coding LLM agents through **inference-time trajectory reduction** without harming agent performance.

### Key Motivation
- **Efficiency Crisis**: 53% of developers consider the cost of using AI agents a barrier (StackOverflow survey)
- **Token Accumulation**: Daily Claude 4 Sonnet usage reaches 100B tokens on OpenRouter, with 99% being input tokens accumulated in trajectories
- **Snowball Effect**: Tool calls and results remain in trajectory forever, causing computational costs to snowball with each step
- **Research Gap**: Existing token reduction approaches focus on single-turn tasks, not multi-turn agent trajectories

### Main Contributions
1. Reveals that inference-time trajectory reduction is a promising new direction with significant cost reduction potential
2. Proposes **AgentDiet**, a simple but effective trajectory reduction approach
3. Demonstrates feasibility through case studies and large-scale quantitative experiments

---

## 2. 提案手法の詳細 (Proposed Method: AgentDiet)

### Core Concept
AgentDiet is an **inference-time trajectory reduction approach** that automatically identifies and removes waste information from LLM agent trajectories. The method uses a **separate reflection module** to compress trajectory content without modifying the agent's core workflow.

### Three Types of Waste in Trajectories

#### 2.1 Useless Information
Information that is never relevant to the task, such as:
- Verbose test output showing each test passed individually
- Long file contents that are viewed but never referenced again
- Example: Test command showing 100+ lines of "PASSED" when only the final "FAILED" matters

#### 2.2 Redundant Information
Information that is repeated multiple times:
- Same file content viewed repeatedly
- Repeated error messages or stack traces
- Example: Opening the same file multiple times, each time adding full content to trajectory

#### 2.3 Expired Information
Information that was useful but is no longer relevant:
- Old file contents after modifications
- Intermediate exploration results
- Example: Initial file view before editing - the edited version supersedes it

### Design Principles

#### 2.3.1 Identifying the Waste
- **LLM-Based Detection**: Uses GPT-4o mini to identify waste with a prompt based on LLMLingua-2
- **Prompt Design**: Instructs LLM to replace useless, redundant, or expired information with "... (short description)"
- **Case Study Result**: GPT-4o mini successfully removes verbose test lines while preserving failed test names
- **Comparison**: Outperforms LLMLingua-2, which corrupts important information due to token-level compression

#### 2.3.2 Timing of Trajectory Reduction
**Failed Approach - Agent Self-Reduction:**
- Attempted to give agents an `erase` tool to reduce their own trajectories
- Even with Claude 4 Sonnet, agents continued working on original tasks instead of reducing
- **Problem**: LLMs memorize standard procedures during training, creating uncontrollable tendency to follow those procedures

**Successful Approach - Separate Reflection Module:**
- External system controls timing of trajectory reduction
- Agent LLM remains unaware of trajectory reduction
- Reduces disturbance to original workflow
- **Benefit**: No need for expensive fine-tuning of proprietary LLMs

#### 2.3.3 Controlling the Overhead
**Challenge**: If full trajectory passed to reflection module each step, token usage doubles

**Solutions:**

1. **Cost-Efficient LLM for Reflection:**
   - Use cheaper model (e.g., GPT-4o mini) for reflection vs. expensive agent LLM (Claude 4 Sonnet)
   - Example: GPT-4o mini is 12x cheaper than Claude 4 Sonnet

2. **Sliding Window Approach:**
   - When agent reaches step `s`, reflection module can only reduce content in step `s-a`
   - Only provides fixed context window from step `s-a-b` to step `s`
   - **Parameters**:
     - `a`: Number of steps after the target step
     - `b`: Number of steps before the target step
     - `θ`: Token threshold for skipping reduction (if step is too short)

3. **Benefits of Sliding Window:**
   - Token usage capped at `a+1+b` steps regardless of trajectory length
   - Modifies only fixed recent step → preserves KV Cache for previous steps
   - Cannot destructively erase most recent step or all steps at once
   - Prevents disastrous outcomes from occasional LLM failures

---

## 3. アルゴリズムと実装のポイント (Algorithm and Implementation)

### Algorithm 1: Integrating AgentDiet in Typical LLM Agent

```
Input: Problem instruction (I), Environment (E)
Output: Result (r), Modified environment (E)
Constants: Steps before (b) / after (a) target, Step limit (s_max),
           Length threshold (θ), LLM_agent, LLM_reflect

1: T ← MakeInitialPrompt(I)          ▷ Initiate trajectory
2: for each s ∈ [1...s_max] do
3:   m_assis ← LLM_agent(T)          ▷ Perform agent step
4:   if IsTaskDone(m_assis) then
5:     r ← "finished"
6:     return r, E
7:   end if
8:   E, m_tool ← ExecTool(E, m_assis) ▷ Execute tool call
9:   T ← T + [⟨m_assis, m_tool⟩]      ▷ Add messages to trajectory
10:
11:  ▷ AgentDiet Reflection Module (orange box in paper)
12:  if s-a > 0 then
13:    l_orig ← Length(Serialize([T[s-a]]))
14:    if l_orig > θ then
15:      ctx ← Serialize(T[max(0,s-a-b):s])
16:      m_reduced ← LLM_reflect(ctx, s-a)  ▷ Perform reflection
17:      l_reduced ← Length(m_reduced)
18:
19:      if l_orig - l_reduced > θ then  ▷ Apply if benefit > threshold
20:        T[s-a] ← m_reduced
21:      end if
22:    end if
23:  end if
24: end for
25:
26: r ← "interrupted"  ▷ Reached step limit
27: return r, E
```

### Implementation Details

#### 3.1 Integration in Trae Agent
- **Base Agent**: Trae Agent (ranked #1 on SWE-bench Verified as of July 2025)
- **Tools**: `bash`, `str_replace_editor`, `think`, `task_done`
- **Semantically Equivalent**: Similar to mini-SWE-agent and OpenHands
- **Integration**: Add reflection module call (lines 12-23) after each agent step

#### 3.2 Hyperparameter Settings

**Initial Settings:**
- `LLM_reflect`: Gemini 2.5 Flash
- `θ` (threshold): 500 tokens
- `a` (steps after): 3
- `b` (steps before): 1

**Final Settings (after iteration):**
- `LLM_reflect`: **GPT-4o mini** (12x cheaper than Claude 4 Sonnet)
- `θ`: **500 tokens**
- `a`: **2** (reduced from 3)
- `b`: **1**
- `LLM_agent`: Claude 4 Sonnet
- `s_max`: 50

**Hyperparameter Tuning Process:**
1. Started with initial settings
2. Tested variants with different hyperparameters
3. Found GPT-4o mini and a=2 performed better
4. Re-ran experiments - no variant showed better results
5. Confirmed final settings

### Key Implementation Points

1. **Token Threshold (θ=500):**
   - Skip reflection if step length ≤ θ (benefit too small)
   - Only apply reduction if `l_orig - l_reduced > θ`

2. **Context Window (a=2, b=1):**
   - Reflection module sees 4 steps total (a + 1 + b = 2 + 1 + 1)
   - Can only modify step `s-2` when at step `s`
   - Provides context from `s-3` to `s`

3. **Serialization:**
   - `Serialize()`: Converts trajectory step to string
   - `Length()`: Calculates tokenized length

4. **KV Cache Preservation:**
   - Modifies only one fixed recent step
   - Previous KV Cache entries remain valid
   - Minimizes overhead from cache invalidation

---

## 4. 実験結果と評価 (Experimental Results and Evaluation)

### 4.1 Experimental Setup

#### Benchmarks
1. **SWE-bench Verified**: 500 instances, Python repositories
2. **Multi-SWE-bench Flash**: 388 instances, multiple languages (Rust, TypeScript, JavaScript, Go, Java, Python)

#### LLMs Tested
1. **Claude 4 Sonnet** (Anthropic)
2. **Gemini 2.5 Pro** (Google)

#### Metrics
- **Pass%**: Percentage of instances resolved successfully
- **Input Tokens (I)**: Accumulated input tokens across all steps
- **Steps**: Average number of steps taken
- **Cost ($)**: Computational cost of agent
- **Cost+ ($+)**: Total cost including reflection module overhead
- **Keep%**: Percentage of tokens kept after reflection

### 4.2 Results Summary

#### RQ1: Efficiency Improvement

| Metric | SbV+Claude | SbV+Gemini | MSbF+Claude | MSbF+Gemini |
|--------|-----------|-----------|-------------|-------------|
| **Keep%** | 22.6% | 25.2% | 30.8% | 22.9% |
| **Input Token Reduction (1-I)** | 59.7% | 52.5% | 42.3% | 39.9% |
| **Agent Cost Reduction (1-$)** | 44.1% | 40.0% | 31.6% | 28.6% |
| **Final Cost Reduction (1-$+)** | **35.9%** | **26.0%** | **26.9%** | **21.1%** |

**Key Findings:**
- Reflection module removes **69.2% ∼ 77.4%** of content it processes
- Input tokens reduced by **39.9% ∼ 59.7%**
- Final computational cost reduced by **21.1% ∼ 35.9%**
- Cost reduction smaller than token reduction due to:
  - Output token costs
  - KV Cache invalidation overhead
  - Reflection module overhead

**Absolute Costs (Average US$ per instance):**

| Configuration | Original | AgentDiet | Savings |
|--------------|----------|-----------|---------|
| SbV+Claude | $0.535 | $0.422 | $0.113 |
| SbV+Gemini | $0.385 | $0.285 | $0.100 |
| MSbF+Claude | $1.277 | $0.933 | $0.344 |
| MSbF+Gemini | $0.701 | $0.449 | $0.252 |

#### RQ2: Performance Impact

| Metric | SbV+Claude | SbV+Gemini | MSbF+Claude | MSbF+Gemini |
|--------|-----------|-----------|-------------|-------------|
| **Original Pass%** | 43.0% | 37.0% | 30.5% | 23.0% |
| **AgentDiet Pass%** | 44.0% | 38.0% | 30.0% | 25.0% |
| **Difference** | **+1.0%** | **+1.0%** | **-0.5%** | **+2.0%** |

**Key Findings:**
- Performance is **comparable** (-1.0% ∼ +2.0%) to baseline
- **No performance degradation** despite significant cost reduction
- **Contradicts** "test-time compute" belief that there's a trade-off
- **Explanation**: LLM performance degrades with long/low-quality context
- Removing waste information → less performance degradation

**Special Case - Gemini 2.5 Pro + Multi-SWE-bench Flash:**
- Steps reduced from 57.20 → 43.90
- Gemini shows abnormal behavior with long context (repeated tool calls)
- AgentDiet reduces trajectory length by half → fewer instances reaching step limit
- Instances at step limit (100 steps): 66 → 26

#### RQ3: Generalization

**Cross-Benchmark:**
- Effective on both SWE-bench Verified (Python) and Multi-SWE-bench Flash (multi-language)

**Cross-LLM:**
- Effective on both Claude 4 Sonnet and Gemini 2.5 Pro
- Suggests approach generalizes to different proprietary LLMs

**Cross-Language (Multi-SWE-bench Flash):**

| Language | Pass% Change | Input Token Reduction |
|----------|-------------|----------------------|
| Rust | +3.2% | 42.6% |
| TypeScript | -3.0% | 42.3% |
| JavaScript | +2.1% | 40.3% |
| Go | +0.6% | 40.6% |
| Java | +4.3% | 40.3% |
| Python | -0.5% | 39.4% |

### 4.3 Comparison with Baselines

#### LLMLingua-2 Comparison
- **AgentDiet**: Successfully preserves important information (e.g., failed test names)
- **LLMLingua-2**: Corrupts important information due to token-level compression
- **Reason**: LLMLingua-2 is small model (xlm-roberta-large) trained on natural language
- **Advantage**: LLMs like GPT-4o mini have better reasoning at larger granularity

#### Industry Practices
- **Current**: Apply compression only when context window is full
- **Focus**: Robustness rather than efficiency
- **AgentDiet**: Proactive reduction at every step with benefit threshold

---

## 5. 既存手法との比較 (Comparison with Existing Methods)

### 5.1 Prompt Reduction (Single-Turn Tasks)

**Existing Approaches:**
- LLMLingua, LLMLingua-2: Prompt compression for QA
- Selective Context: Redundancy removal
- Gist Token: Fine-grained compression

**Key Differences:**
| Aspect | Existing (Single-Turn) | AgentDiet (Multi-Turn) |
|--------|----------------------|----------------------|
| **Timing** | All tokens at once | Gradual buildup |
| **Content** | Natural language | Code + structured info |
| **LLM Access** | May require inference access | Works with proprietary LLMs |
| **Research Question** | How to compress? | When and how to compress? |

### 5.2 Context Management in Agent Systems

**Existing Approaches:**
- **Summarization**: Claude's prompt caching, Cursor's context compression
- **Applied**: Only when context window is full
- **Goal**: Robustness (avoid context overflow)

**AgentDiet Advantages:**
- **Proactive**: Reduces before context window fills
- **Efficiency-Focused**: Optimizes for cost, not just robustness
- **Fine-Grained**: Targets specific waste types (useless, redundant, expired)
- **Performance-Neutral**: Maintains agent performance

### 5.3 Efficiency for Whitebox LLMs

**Existing Approaches:**
- KV Cache optimization
- Model pruning/quantization
- Inference-time acceleration

**AgentDiet Complementarity:**
- Works with **blackbox proprietary LLMs**
- Orthogonal to model-level optimizations
- Can be combined with whitebox optimizations

---

## 6. 利点と限界 (Advantages and Limitations)

### 6.1 Advantages

#### Cost Efficiency
- **21.1% ∼ 35.9%** reduction in final computational cost
- **39.9% ∼ 59.7%** reduction in input tokens
- Significant savings at scale (popular AI products with active users)

#### Performance Preservation
- **No performance degradation** (-1.0% ∼ +2.0%)
- Sometimes **improves** performance by reducing context length
- Prevents abnormal behavior in some models (e.g., Gemini with long context)

#### Generalizability
- Works across **multiple LLMs** (Claude, Gemini)
- Works across **multiple languages** (Python, Rust, TypeScript, JavaScript, Go, Java)
- Works across **multiple benchmarks** (SWE-bench Verified, Multi-SWE-bench Flash)

#### Ease of Integration
- **Simple**: Add reflection module call after each step
- **Non-Invasive**: Agent LLM unaware of trajectory reduction
- **Flexible**: Hyperparameters can be tuned for specific use cases
- **Open-Source**: Can be integrated in different coding agents

#### Practical Benefits
- Reduces VRAM and I/O bandwidth usage
- Works with KV Cache (preserves cache for previous steps)
- No fine-tuning required for proprietary LLMs

### 6.2 Limitations

#### Overhead Trade-off
- **Reflection module cost**: Adds computational overhead
- **Net benefit**: Still positive but reduced from gross token reduction
- **Break-even point**: May not benefit very short trajectories

#### Hyperparameter Sensitivity
- Requires tuning of `a`, `b`, `θ` parameters
- Optimal settings may vary across:
  - Different agent architectures
  - Different task types
  - Different LLMs

#### Potential for Information Loss
- **Risk**: Reflection module may remove important information
- **Mitigation**: Threshold-based application, sliding window
- **Residual Risk**: Cannot guarantee perfect preservation

#### Scope Limitations
- Evaluated only on **coding agents**
- Not tested on:
  - **Ensembled systems** (multiple LLM calls with voting)
  - **Multi-agent systems** (multiple agents with communication)
  - Other domains (general QA, planning, etc.)

#### LLM Dependency
- Quality depends on reflection LLM capability
- GPT-4o mini may not be optimal for all cases
- May require different reflection LLMs for different tasks

### 6.3 Threats to Validity

#### Generalization Across Agents
- Only tested on Trae Agent
- **Mitigation**: Agent systems are homogeneous with similar tools
- **Risk**: May not generalize to very different architectures

#### Data Leakage in LLMs
- LLMs may have seen benchmark data during training
- **Mitigation**: Used recent benchmarks (SWE-bench Verified, Multi-SWE-bench Flash)
- **Risk**: Performance numbers may be inflated

#### Patch Correctness
- SWE-bench verifies with tests, but tests may be incomplete
- **Risk**: "Resolved" instances may have incorrect patches

### 6.4 Future Work Directions

#### Improving Latency
- Current focus: Cost reduction
- Future: Reduce wall-clock time (latency)
- Challenge: Balance cost vs. latency

#### Exploring More Designs
- **Different timing strategies**: When to reduce?
- **Different compression methods**: How to reduce?
- **Different architectures**: Where to reduce?
- **Multi-agent scenarios**: Apply to all agents?

---

## 7. Key Insights and Takeaways

### 7.1 Main Findings

1. **Waste is Widespread**: Useless, redundant, and expired information exists in all trajectories
2. **LLMs Can Identify Waste**: GPT-4o mini successfully identifies and removes waste
3. **Agents Can't Self-Reduce**: Even powerful LLMs fail to reduce their own trajectories
4. **External Control Works**: Separate reflection module effectively reduces trajectories
5. **Performance is Maintained**: Trajectory reduction does not harm agent performance
6. **Significant Savings**: 21-36% cost reduction is achievable

### 7.2 Practical Recommendations

1. **Use Sliding Window**: Control overhead with fixed context window
2. **Choose Cost-Efficient Reflection LLM**: GPT-4o mini works well
3. **Set Appropriate Thresholds**: θ=500 tokens balances benefit vs. overhead
4. **Start with Default Hyperparameters**: a=2, b=1 is good starting point
5. **Monitor Performance**: Check that Pass% is maintained

### 7.3 Research Significance

This paper:
- **Opens new research direction**: Inference-time trajectory reduction
- **Challenges assumptions**: Test-time compute trade-off may not hold
- **Provides practical tool**: AgentDiet is simple and effective
- **Demonstrates potential**: Significant cost savings are achievable

---

## 8. Conclusion

**AgentDiet** represents a significant advancement in LLM agent efficiency. By identifying and removing waste information (useless, redundant, expired) from trajectories through a separate reflection module with sliding window approach, it achieves:

- **39.9% ∼ 59.7%** reduction in input tokens
- **21.1% ∼ 35.9%** reduction in final computational cost
- **No performance degradation** (-1.0% ∼ +2.0%)

The approach is:
- **Simple**: Easy to integrate in existing agents
- **General**: Works across LLMs, benchmarks, and languages
- **Practical**: No fine-tuning required, works with proprietary LLMs
- **Effective**: Significant cost savings at scale

This work demonstrates that **trajectory reduction is a promising direction** for improving the efficiency of LLM agent systems, opening avenues for future research in this emerging field.

---

## References

Key papers mentioned:
- LLMLingua-2 (Pan et al., 2024): Prompt compression
- SWE-bench Verified (Jimenez et al., 2024): Benchmark
- mini-SWE-agent (Yang et al., 2024a): Agent baseline
- Trae Agent (Gao et al., 2025): Top-performing agent
- ReAct (Yao et al., 2023): Agent framework
- CodeAct (Wang et al., 2024a): Agent framework
