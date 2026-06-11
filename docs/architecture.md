# Architecture

Mekann は `mekann/index.ts` の wrapper extension が複数の Pi extension suite を固定順序で読み込む構成です。

```text
mekann
  core
  safety
  autonomy
  utils
  context
```

## Load order

`mekann/index.ts` は次の順に suite を初期化します。

1. `core`
2. `safety`
3. `autonomy`
4. `utils`
5. `context`

`safety` は自律性や tool 実行に影響するため、`autonomy` より前に初期化します。`sandbox` は hard boundary、`modes` は collaboration UX を扱います。

## Suites

| Suite | Responsibility | Notable features |
|---|---|---|
| `core` | prompt の土台、常時ガイドライン、provider-aware 最適化 | `prompt-core`, `cache-friendly-prompt`, `agent-guidelines`, `model-optimizer` |
| `safety` | tool 実行や collaboration mode の安全境界 | `sandbox`, `modes`, `policy-core` |
| `autonomy` | 長い作業、並列作業、継続目標、反復研究 | `goal`, `subagent`, `autoresearch` |
| `context` | runtime context management と大出力制御 | `output-gate`, `context-ledger` |
| `utils` | human-facing helper と terminal integration | `zip-repo`, `codex-limits`, `dashboard`, `codex-web-search`, `terminal-shortcuts`, `settings-editor`, `pr-workflow` |

## Design sources

- [CONTEXT.md](../CONTEXT.md): project vocabulary。用語や責任境界の正本。
- [docs/adr](./adr/): 長く残る設計判断。
- Feature README: feature 固有の使い方、境界、tool / command。
- [docs/terminal-ui.md](./terminal-ui.md): terminal UI placement の設計整理。
- [docs/vendor/mattpocock-skills.md](./vendor/mattpocock-skills.md): upstream engineering skill mirror と Pi-maintained skill の関係。
- [docs/vendor/greensock-gsap-skills.md](./vendor/greensock-gsap-skills.md): upstream GSAP skill mirror と Pi-maintained skill の関係。

## Settings architecture

Mekann-owned settings は `mekann/settings/` が読み書きし、各 feature が `settingsSchema.ts` を提供します。

- Global file: `~/.pi/agent/mekann.json`
- Workspace file: `.pi/mekann.json`
- Registry: `mekann/settings/registry.ts`
- Editor: `mekann/utils/settings-editor/`

設定の詳細は [Configuration](./configuration.md) を参照してください。

## Safety model

Mekann は「自律性を上げるほど safety feature が必要になる」という前提で設計されています。

- `sandbox` は `bash` tool execution を制御する。
- `modes` は read-only などの collaboration mode を扱う。
- `subagent` result は trust transition を通るまで信頼しない。
- `autoresearch` は safety boundary でだけ user control に戻る。

Security reporting とサポート範囲は [SECURITY.md](../SECURITY.md) を参照してください。
