# Contributing

Mekann は Pi coding agent の自律作業を安全に伸ばすための extension suite です。contribution は、実装だけでなく、用語、ADR、feature README、検証手順の整合性まで含めて扱います。

## Before you start

- まず [README](./README.md)、[CONTEXT.md](./CONTEXT.md)、関係する feature README を読んでください。
- 大きな変更や仕様変更は GitHub issue で合意してから進めます。issue 運用は [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md) を参照してください。
- `vendor/mattpocock-skills` は upstream mirror です。直接編集しません。詳細は [docs/vendor/mattpocock-skills.md](./docs/vendor/mattpocock-skills.md) を参照してください。

## Development setup

```bash
nvm use
npm ci --workspaces --include-workspace-root
npm run typecheck
npm test
```

Node.js は `package.json` の `engines.node` と `.nvmrc` に合わせてください。

## Pull request expectations

- 変更の目的、ユーザーに見える挙動、検証した command を PR description に書いてください。
- feature の責任境界や用語を変えた場合は [CONTEXT.md](./CONTEXT.md) を更新してください。
- 長く残る設計判断は [docs/adr](./docs/adr/) に ADR を追加または更新してください。
- user-facing behavior、command、setting、tool、skill を変えた場合は README や docs を同じ PR で更新してください。
- safety feature は threat boundary を明示し、macOS 依存の挙動は macOS test の有無を明記してください。

## Tests

変更範囲に応じて最小限ではなく十分な検証を実行します。

```bash
npm run typecheck:prod
npm run typecheck
npm test
npm run prepush
```

個別 feature の test command と CI 構成は [TESTING.md](./TESTING.md) を参照してください。

## Documentation policy

- 初見の利用者向け導線は [docs/README.md](./docs/README.md) から辿れるようにします。
- feature 固有の詳細は feature directory の `README.md` に置きます。
- repo 全体の共通語彙は [CONTEXT.md](./CONTEXT.md) に置きます。
- 変更履歴は [CHANGELOG.md](./CHANGELOG.md) に追記します。
- agent 向け手順は [AGENTS.md](./AGENTS.md) と `docs/agents/` に置きます。

## Issue labels

この repo は `needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix` を使います。定義は [docs/agents/triage-labels.md](./docs/agents/triage-labels.md) にあります。
