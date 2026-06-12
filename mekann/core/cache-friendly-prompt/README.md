# cache-friendly-prompt

`cache-friendly-prompt` は、`prompt-core` に集まった prompt fragment を cache されやすい順序で最終 prompt に配置し、provider 実 usage と prefix proxy を分けて記録する telemetry layer です。

## 役割

- stable / semi-stable content を system prompt 側の cacheable prefix へ置く
- dynamic content を user message tail へ寄せる
- request-time prefix proxy を `.pi-cache-friendly/requests.jsonl` に記録する
- message-end の provider usage 由来 actual cache read tokens を `.pi-cache-friendly/actual-usage.jsonl` に記録する
- proxy と actual usage を `requestId`, `runKey`, prefix hash, `correlationConfidence` で join しやすくする

## actual usage telemetry

`actual-usage.jsonl` は、provider usage tokens から正規化した以下の値を持ちます。

- `inputTotalTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `cacheMissTokens`
- `tokenHitRate = cacheReadTokens / inputTotalTokens`
- `cacheableReadRate = cacheReadTokens / (cacheReadTokens + cacheWriteTokens)` when cache write tokens are available
- `inputSemantics`: `total_input` / `non_cached_input` / `unknown`
- `normalizationStrategy` and `normalizationWarnings`

Pi normalized usage は provider ごとの semantics が曖昧な場合があります。そのため、`input` が total input なのか non-cached input なのかを推定した場合は `normalizationWarnings` に残します。

## prefix correlation metadata

actual usage rows also include prefix snapshot metadata when available:

- `correlationConfidence`: `requestId_matched` / `providerModel_fifo` / `runKey_latest` / `missing`
- `stablePrefixHash`, `featureCacheablePrefixHash`, `providerPrefixHash`
- `stablePrefixChars`, `semiStableChars`, `providerPrefixChars`, `totalPromptChars`
- `latestDynamicFragmentHashes`
- dynamic truncation metadata (`dynamicContextTruncated`, original/rendered/limit chars)

比較用の hit rate を出す場合は、まず `correlationConfidence === "requestId_matched"` or `"providerModel_fifo"` の rows だけで再集計してください。`requestId_matched` が最強で、request id がない provider/runtime では `providerModel_fifo` が次善の correlation です。

## prefix change attribution

`report.md` の “Recent scoped reuse key changes” は、前回 request と今回 request の差分から cacheable prefix を壊した可能性がある要因を表示します。

- changed hash family: `baseSystemHash`, `stablePrefixHash`, `semiStableHash`, `featureCacheablePrefixHash`, `providerPrefixHash`
- changed / added / removed fragment ids
- provider prefix chars delta
- total prompt chars delta

まずここを見て、stable / semi-stable に runtime 値が混ざっていないかを確認してください。

## dynamic tail size and truncation

Dynamic context is placed in the volatile tail, but it still contributes to total input tokens and can reduce request-level `tokenHitRate` by increasing the denominator. The report tracks dynamic truncation telemetry:

- `dynamicTruncationCount`
- `dynamicTruncationOriginalChars`
- `dynamicTruncationRenderedChars`
- `dynamicTruncationOmittedChars`

The “Dynamic tail size / truncation” table lists recent truncations and the dynamic fragment ids involved. Use this to replace huge tool/log/file context with summaries, artifact ids, or targeted snippets.

## cacheable fragment ordering audit

Stable and semi-stable fragments are sorted deterministically by stability, priority, source, kind, and id. `prompt-core` warns with `CACHEABLE_FRAGMENT_ORDER_TIE` when two cacheable fragments share the same ordering key, because the final tie-breaker would fall back to provider input order.

If this warning appears, give the fragments distinct ids, sources, kinds, or priorities so cacheable prefix rendering does not depend on registration or collection order.

## recent low-hit actual rows

`report.md` includes “Recent low-hit actual rows” for request-level `tokenHitRate < 80%`. It shows provider/model, role, input tokens, `baseSystemHash`, `providerPrefixHash`, total prompt chars, and correlation confidence so regressions can be inspected without ad-hoc scripts.

## base system volatility audit

The base system prompt is inspected for volatile/runtime-like content before cache-friendly fragments. Warnings include:

- `BASE_SYSTEM_VOLATILE_SIGNAL`
- `BASE_SYSTEM_ABSOLUTE_PATH`
- `BASE_SYSTEM_AVAILABLE_SKILLS_BLOCK`

These warnings help identify Pi/core prompt content that may still sit before the cacheable extension prefix.

## base system hash hit-rate attribution

`actual-usage.jsonl` includes `baseSystemHash` when a request snapshot can be correlated. `report.md` groups actual usage by short base system hash so main/subagent base prompt differences can be measured separately from extension fragment differences.

Summary field:

- `actualByBaseSystemHash`

## provider prefix hash hit-rate attribution

`report.md` groups actual usage by short `providerPrefixHash`. This makes it easy to compare hashes such as `8f37820c` and `d8f6ac77` directly and identify whether a specific prefix shape has lower actual cache reads.

Summary field:

- `actualByProviderPrefixHash`

## provider/model switching

Provider cache is usually scoped by provider/model. `report.md` records adjacent provider/model switches so global hit rate can be interpreted separately from model routing changes.

Summary fields:

- `providerModelSwitches`
- `providerSwitches`
- `modelSwitchesWithinProvider`

The “Provider/model switching” table shows recent switches with reuse key changes and prompt sizes.

## cold vs warm actual hit rate

`report.md` separates actual usage into cold and warm rows. Cold means the first row for a `provider/model/prefix hash` key in the current log; warm means later rows with the same key.

Summary fields:

- `actualColdRequestCount`
- `actualColdTokenHitRateWeighted`
- `actualWarmRequestCount`
- `actualWarmTokenHitRateWeighted`
- `actualByWarmState`

This helps avoid judging cache behavior from unavoidable first-use misses.

## main vs subagent actual hit rate

`report.md` groups actual provider usage by `requestRole` (`main`, `subagent`, `tool`, `unknown`). This makes it easy to see whether subagent task briefs, forked context, or authority metadata are lowering cache hit rate independently of the main agent.

Generated artifacts include:

- summary field: `actualByRequestRole`
- report table: “By request role”
- graphs: `actual-hit-rate-role-<role>.svg`

## volatile runtime context placement

`before_agent_start` moves simple volatile runtime lines from the base system prompt to after stable/semi-stable fragments:

- `Current date:`
- `Current working directory:`
- `Current cwd:`
- `Working directory:`

This keeps date/cwd changes from invalidating the earlier cacheable prefix while preserving the information later in the system prompt under `cache-friendly-prompt:Volatile runtime context`.

## cacheable-prefix volatility guard

`FINAL_PAYLOAD_VOLATILE_BEFORE_STABLE_END` is now evaluated against structurally cacheable payload fields only (`system`, `developer`, `instructions`, and system/developer message content). User-message volatile text before a stable marker in flattened payload extraction is ignored, reducing false positives from provider payload traversal order.

## dynamic tail placement guard

Dynamic fragments should stay in the volatile user-message tail. `before_provider_request` inspects the provider payload and emits `DYNAMIC_CONTEXT_IN_CACHEABLE_PREFIX` if the dynamic marker appears in cacheable fields such as `system`, `developer`, `instructions`, or system/developer message content. It also emits `DYNAMIC_CONTEXT_BEFORE_STABLE_PREFIX` if extracted provider text shows dynamic content before the stable marker.

These warnings are intended to catch provider adapter or hook ordering regressions that accidentally move turn-specific context into the cacheable prefix.

## base system prompt stability

`stablePrefixHash` は stable fragment だけを見る診断用 hash です。provider cache に近いのは base system prompt も含む `providerPrefixHash` です。

`report.md` には “Base system prompt stability” セクションがあり、`baseSystemHash` の変化を抜き出します。`stablePrefixHash` が安定しているのに `providerPrefixHash` が変わる場合は、Pi 本体や provider adapter が作る base system prompt 側に runtime 値が混ざっていないかを確認してください。

## stable / semi-stable volatility audit

`prompt-core` は stable / semi-stable fragment に runtime 値が混ざっていないかを検査します。

Examples that are flagged:

- `requestId`, `sessionId`, `conversationId`, `runId`
- `timestamp`, `current date`, `current time`
- `tokens used`, `remaining tokens`, `token budget`
- `cwd`, absolute user/tmp paths
- `git status`, `open files`, `current file`, diagnostics/tool/search results

Stable fragment の具体的な runtime 値は error、semi-stable fragment の volatile signal は warning として report に残ります。

## report generation

ログ append ごとの report 再生成は重くなるため、既定では debounce されます。

Extension config:

```ts
cacheFriendlyPromptExtension(pi, {
  reportMode: "debounce", // "immediate" | "debounce" | "off"
  reportDebounceMs: 1000,
});
```

Tests or one-shot local checks can use `reportMode: "immediate"`. Long-running sessions can use the default debounce, or `"off"` and call `generateCacheFriendlyReport(dir)` from a separate command/script.

## 注意

これは provider cache hit を保証する機能ではありません。provider 固有 API の cache layer でもありません。`requests.jsonl` の prefix continuity proxy と `actual-usage.jsonl` の provider usage token metrics は別物として扱ってください。
