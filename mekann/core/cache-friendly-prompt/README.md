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

- `correlationConfidence`: `requestId_matched` / `runKey_latest` / `missing`
- `stablePrefixHash`, `featureCacheablePrefixHash`, `providerPrefixHash`
- `stablePrefixChars`, `semiStableChars`, `providerPrefixChars`, `totalPromptChars`
- `latestDynamicFragmentHashes`
- dynamic truncation metadata (`dynamicContextTruncated`, original/rendered/limit chars)

比較用の hit rate を出す場合は、まず `correlationConfidence === "requestId_matched"` の rows だけで再集計してください。

## prefix change attribution

`report.md` の “Recent scoped reuse key changes” は、前回 request と今回 request の差分から cacheable prefix を壊した可能性がある要因を表示します。

- changed hash family: `baseSystemHash`, `stablePrefixHash`, `semiStableHash`, `featureCacheablePrefixHash`, `providerPrefixHash`
- changed / added / removed fragment ids
- provider prefix chars delta
- total prompt chars delta

まずここを見て、stable / semi-stable に runtime 値が混ざっていないかを確認してください。

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
