---
name: self-improvement
description: 7 philosophical perspectives for self-improvement. Select ONE perspective based on task type.
license: MIT
tags: [meta, deconstruction, logic, reasoning]
metadata:
  skill-version: "2.0.0"
  created-by: pi-skill-system
  paper-reference: "Evaluating AGENTS.md - arXiv:2602.11988"
---

# Self-Improvement (Minimal)

**Select ONE perspective based on task type. Do not apply all 7 perspectives.**

## 7 Perspectives

| Perspective | Core Question | When to Use |
|-------------|---------------|-------------|
| Deconstruction | What assumptions am I making? | Detecting fixed beliefs, questioning "obvious" |
| Schizoanalysis | What desires am I producing? | Analyzing motivations, side effects |
| Eudaimonia | What is my "good life"? | Clarifying values, quality standards |
| Utopia/Dystopia | What world am I creating? | Predicting future impact, risks |
| Philosophy of Thought | Am I "thinking"? | Meta-cognition, autopilot detection |
| Taxonomy of Thought | Which thinking mode fits? | Mode selection (debug/design/review) |
| Logic | Is this inference valid? | Logical verification, edge cases |

## Usage

1. **Select ONE perspective** based on task type (see table above)
2. Apply the core question
3. Document findings in simple format

## Output Format

```
FOCUS: [selected perspective]
FINDING: [1-2 sentences]
ACTION: [next step]
```

## Stop Conditions

Stop and reassess when:
1. 3+ cycles with no progress (stagnation)
2. Core question lost
3. Circular reasoning detected
4. Score consistently < 50

## Important Notes

Based on "Evaluating AGENTS.md" paper findings:
- **Do not apply all 7 perspectives** - this increases cost and reduces success rate
- **Minimal requirements only** - unnecessary requirements make tasks harder
- **Single focus** - choose one perspective, not all

## Pre/Post Task Check (Simplified)

### Pre-Task (3 items max)
- [ ] What is the core question?
- [ ] What assumptions am I making?
- [ ] What is the stopping condition?

### Post-Task (3 items max)
- [ ] Did I answer the core question?
- [ ] What did I learn?
- [ ] What would I do differently?
