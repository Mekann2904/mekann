# cache-friendly-prompt

`cache-friendly-prompt` is the final Prompt Orchestrator extension. It collects fragments from other extensions, appends stable/semi-stable context to the system prompt, places dynamic context at the tail, and logs stablePrefixHash/warnings. It improves cache-friendliness but does not guarantee provider cache hits.

```text
extensions -> prompt-core registry -> cache-friendly-prompt -> provider
```

## Limitations

- Does not guarantee cache hits
- Does not know provider TTL
- Does not insert cache_control
- Does not manage cache objects
- Token counts are estimates
- Full prompts are not logged for privacy
- MVP keeps minimal module-level last-state; highly concurrent runs may share the most recent stable-prefix metadata for logging only.
