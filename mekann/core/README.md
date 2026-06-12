# core suite

`core` は、Mekann feature が prompt を安全かつ決定的に組み立てるための土台です。

| Feature | 役割 |
|---|---|
| [`prompt-core`](./prompt-core/) | prompt fragment registry と renderer |
| [`cache-friendly-prompt`](./cache-friendly-prompt/) | cache されやすい順序で最終 prompt を組み立てる orchestrator |
| [`agent-guidelines`](./agent-guidelines/) | 常時適用される coding-agent guideline を提供する |

`prompt-core` は provider cache API を呼びません。cache friendliness は `cache-friendly-prompt` が扱います。
