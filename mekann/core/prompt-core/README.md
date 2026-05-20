# prompt-core

`prompt-core` is a shared registry and rendering layer for provider-agnostic cache-friendly prompt fragments. It does not call provider cache APIs. It exists to make stable prefix construction deterministic across Pi extensions.

```text
extensions -> prompt-core registry -> cache-friendly-prompt -> provider
```

It separates fragments into stable, semi-stable, and dynamic sections, canonicalizes text, sorts fragments deterministically, and computes hashes for inspection/logging.
