# Cache-friendly prompt separates prediction logs from actual cache usage

Cache-friendly prompt records request-time cacheability predictions separately from message-end actual cache usage. The lifecycle hooks are not guaranteed to map 1:1, so logs remain append-only and are correlated with `runKey`, optional `requestId`, and prefix hashes. Stable prefix hashes remain canonical diagnostics, while provider prefix hashes use raw-ish injected text to better correlate with provider-reported cache reads.
