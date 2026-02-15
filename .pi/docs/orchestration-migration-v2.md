# Orchestration System Migration Guide (v2.0.0)

This document describes the migration from legacy orchestration to the enhanced system.

## Migration Status: COMPLETE

All improvements have been implemented and are now the **default behavior**.

## Feature Flag Changes

| Feature Flag | Old Default | New Default | Notes |
|-------------|-------------|-------------|-------|
| `PI_OUTPUT_SCHEMA_MODE` | `legacy` | `strict` | JSON Schema validation is now enforced |
| `PI_ADAPTIVE_PENALTY_MODE` | `legacy` | `enhanced` | Exponential decay and reason-based weights |
| `PI_JUDGE_WEIGHTS_PATH` | (not implemented) | **Implemented** | Custom weights via JSON file |

## Rollback Instructions

If issues arise, rollback by setting environment variables:

```bash
# Rollback to legacy output validation
export PI_OUTPUT_SCHEMA_MODE=legacy

# Rollback to legacy penalty controller
export PI_ADAPTIVE_PENALTY_MODE=legacy
```

## New Capabilities

### P0-1: JSON Schema Contract

Output validation now uses structured schema validation instead of regex-based checks.

**Benefits:**
- Type-safe field validation
- Length constraints enforcement
- Numeric range checking (CONFIDENCE: 0-1)

**Files:**
- `lib/output-schema.ts` - Schema definitions and validation
- `lib/output-validation.ts` - Enhanced validation with schema support

### P0-3: Judge Explainability

Judge decisions now include detailed explanations of how uncertainty was calculated.

**New Functions:**
- `computeProxyUncertaintyWithExplainability()` - Returns breakdown of factors
- `formatJudgeExplanation()` - Human-readable explanation
- `getJudgeWeights()` - Configurable via `PI_JUDGE_WEIGHTS_PATH`

**Example Configuration:**
```bash
export PI_JUDGE_WEIGHTS_PATH=.pi/config/judge-weights.json
```

See `.pi/config/judge-weights.example.json` for configuration format.

### P1-4: Enhanced Adaptive Penalty

Penalty controller now supports exponential decay and reason-based weights.

**Decay Strategies:**
- `linear` - Legacy +1/-1 steps
- `exponential` - penalty = penalty * 0.5^(steps)
- `hybrid` - Exponential for high penalty, linear for low

**Reason Weights:**
```typescript
{
  rate_limit: 2.0,        // Heavy: API limits need fast response
  capacity: 1.5,          // Medium: Capacity issues
  timeout: 1.0,           // Standard
  schema_violation: 0.5   // Light: Transient format errors
}
```

### P1-5: Extended Error Classification

New semantic error types for better error handling:

| Code | Description | Retryable |
|------|-------------|-----------|
| `SCHEMA_VIOLATION` | Output format doesn't match schema | Yes |
| `LOW_SUBSTANCE` | Intent-only output without content | Yes |
| `EMPTY_OUTPUT` | No content produced | Yes |
| `PARSE_ERROR` | JSON/text parsing failed | Yes |

## New Shared Module

`lib/text-parsing.ts` provides shared utilities to avoid circular dependencies:

- `clampConfidence()` - Clamp to [0, 1] range
- `parseUnitInterval()` - Parse decimal/percentage values
- `extractField()` - Extract field from structured output
- `countKeywordSignals()` - Count keyword occurrences

## Migration Timeline

| Date | Phase | Description |
|------|-------|-------------|
| 2026-02-15 | Implementation | All improvements implemented |
| 2026-02-15 | Review | Critical issues fixed |
| 2026-02-15 | Migration | Defaults changed to new behavior |

## Testing

Run validation tests to verify the migration:

```bash
# Test schema validation
PI_OUTPUT_SCHEMA_MODE=strict npm test

# Test enhanced penalty
PI_ADAPTIVE_PENALTY_MODE=enhanced npm test

# Test with custom judge weights
PI_JUDGE_WEIGHTS_PATH=.pi/config/judge-weights.example.json npm test
```

## Questions?

Refer to the implementation files for detailed documentation:
- `lib/output-schema.ts` - Schema validation
- `lib/adaptive-penalty.ts` - Penalty controller
- `lib/agent-errors.ts` - Error classification
- `extensions/agent-teams/judge.ts` - Judge explainability
