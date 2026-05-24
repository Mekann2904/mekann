# Cache-friendly prompt separates prediction logs from actual cache usage

Status: Accepted and implemented.

Cache-friendly prompt records request-time cacheability predictions separately from message-end actual cache usage. The lifecycle hooks are not guaranteed to map 1:1, so logs remain append-only and are correlated with `runKey`, optional `requestId`, prefix hashes, and `correlationConfidence`.

## Decision

Keep two telemetry streams:

- `.pi-cache-friendly/requests.jsonl`
  - written around `before_provider_request`
  - records prefix proxy data such as `stablePrefixHash`, `featureCacheablePrefixHash`, `providerPrefixHash`, prompt sizes, fragment hashes, and warnings
- `.pi-cache-friendly/actual-usage.jsonl`
  - written around `message_end`
  - records provider usage token metrics such as `inputTotalTokens`, `cacheReadTokens`, `cacheWriteTokens`, `tokenHitRate`, and `cacheableReadRate`

Do not mix prefix prediction/proxy metrics with provider actual cache usage metrics. Reports may show both, but must label them separately.

## Correlation model

Actual usage rows include request snapshot metadata when available:

- `correlationConfidence`: `requestId_matched`, `runKey_latest`, or `missing`
- `stablePrefixHash`
- `featureCacheablePrefixHash`
- `providerPrefixHash`
- prefix and prompt sizes
- latest dynamic fragment hashes

`requestId_matched` rows are the strongest basis for comparative hit-rate claims. `runKey_latest` rows are useful operational telemetry but can be contaminated when hook ordering or request interleaving changes.

## Usage normalization

Provider usage schemas differ. The normalizer records:

- `inputSemantics`: whether `input`/provider input is treated as total input, non-cached input, or unknown
- `normalizationStrategy`: the branch used to compute `inputTotalTokens`
- `normalizationWarnings`: ambiguity or heuristic warnings

This is especially important for Pi normalized usage because `usage.input` may represent either total input or non-cached input depending on upstream semantics.

## Dynamic tail placement guard

Dynamic fragments belong in the volatile tail, not in cacheable system/developer prefix fields. The provider-request inspection therefore warns when the dynamic marker appears in `system`, `developer`, `instructions`, or system/developer message content, and when extracted payload text shows dynamic context before the stable marker. This guards against provider adapter and hook ordering regressions.

## Base system prompt stability

`stablePrefixHash` intentionally excludes the base system prompt. `providerPrefixHash` includes the base system prompt plus stable and semi-stable fragments, so it is closer to the prefix that provider cache sees. Reports therefore track `baseSystemHashChanges` and list recent `baseSystemHash` changes separately. If stable fragment hashes are constant but provider prefix hashes change, base system prompt volatility is the first thing to inspect.

## Prefix change attribution

Reports include recent scoped reuse key changes with best-effort attribution. The attribution compares adjacent request rows and lists changed hash families, changed/added/removed fragment ids, and prompt-size deltas. This does not prove provider cache invalidation by itself, but it gives the first place to inspect when actual cache hit rate drops.

## Report generation

Report generation is intentionally configurable. Long-running sessions should avoid regenerating the full report on every append; the extension defaults to debounced report generation. Tests and short local runs can use immediate generation. Automation may disable inline report generation and call `generateCacheFriendlyReport(dir)` explicitly.

## Consequences

This makes the feature more than a prompt placement optimization. It is an observability layer for checking whether a cacheable prefix / volatile tail split corresponds to provider-reported cache reads, and for identifying which prefix or dynamic-context changes correlate with cache misses.
