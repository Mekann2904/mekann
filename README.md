# Mekann Pi extension suite

[![CI](https://github.com/Mekann2904/mekann/actions/workflows/ci.yml/badge.svg)](https://github.com/Mekann2904/mekann/actions/workflows/ci.yml)
[![Sandbox CI](https://github.com/Mekann2904/mekann/actions/workflows/sandbox-ci.yml/badge.svg)](https://github.com/Mekann2904/mekann/actions/workflows/sandbox-ci.yml)

Mekann は、Pi coding agent の **自律的な作業**を安全に伸ばすための Pi extension suite です。

このリポジトリでは、機能を次の単位で整理します。

- **Pi extension suite**: `core` / `safety` / `autonomy` / `context` / `utils` のような読み込み・配布のまとまり
- **Feature**: `sandbox` や `subagent` のように、責任を持つ個別機能
- **Skill**: エージェントが特定作業のために読む手順書。runtime tool を提供する feature ではありません

用語の詳細は [`CONTEXT.md`](./CONTEXT.md) を参照してください。

## Project status

Mekann は実験的な Pi extension suite です。API、設定、runtime behavior は `0.x` の間に変更される可能性があります。
安全境界に関わる機能は特に慎重に扱い、変更時は feature README、[`CONTEXT.md`](./CONTEXT.md)、必要な ADR を一緒に更新します。

## Documentation

- [Installation](./docs/installation.md): Pi への追加、Node 要件、初回確認
- [Configuration](./docs/configuration.md): `mekann.json`、global/workspace 設定、代表例
- [Architecture](./docs/architecture.md): suite / feature 構成、load order、設計資料への導線
- [Testing](./TESTING.md): test command、CI、pre-push hook
- [Skills Guide](./docs/skills.md): Pi-maintained skills の使い分け
- [Contributing](./CONTRIBUTING.md): issue、PR、ドキュメント更新、検証方針
- [Security](./SECURITY.md): 脆弱性報告、安全境界、サポート範囲

## 全体像

| Suite | 役割 | Feature |
|---|---|---|
| [`core`](./mekann/core/) | prompt の土台と常時ガイドライン | [`prompt-core`](./mekann/core/prompt-core/), [`cache-friendly-prompt`](./mekann/core/cache-friendly-prompt/), [`agent-guidelines`](./mekann/core/agent-guidelines/) |
| [`safety`](./mekann/safety/) | 自律性を許容するための安全境界 | [`sandbox`](./mekann/safety/sandbox/), [`modes`](./mekann/safety/modes/), [`policy-core`](./mekann/safety/policy-core/) |
| [`autonomy`](./mekann/autonomy/) | 長い作業・並列作業・実験的作業の継続 | [`goal`](./mekann/autonomy/goal/), [`subagent`](./mekann/autonomy/subagent/), [`autoresearch`](./mekann/autonomy/autoresearch/) |
| [`context`](./mekann/context/) | runtime context management | [`output-gate`](./mekann/context/output-gate/), [`context-ledger`](./mekann/context/ledger/) |
| [`utils`](./mekann/utils/) | 小さな人間向け補助機能 | [`zip-repo`](./mekann/utils/zip-repo/), [`codex-limits`](./mekann/utils/codex-limits/), [`dashboard`](./mekann/utils/dashboard/), [`codex-web-search`](./mekann/utils/codex-web-search/), [`terminal-shortcuts`](./mekann/utils/terminal-shortcuts/), [`settings-editor`](./mekann/utils/settings-editor/) |

## 代表的な使い分け

- 実装前に読み取り専用で考えたい: [`modes`](./mekann/safety/modes/) の read-only mode
- `bash` tool の実行を OS レベルで制限したい: [`sandbox`](./mekann/safety/sandbox/)
- 大きな tool output を context window に入れすぎたくない: [`output-gate`](./mekann/context/output-gate/)
- 決定・タスク・エラーなどの作業記憶を残したい: [`context-ledger`](./mekann/context/ledger/)
- 独立調査や fresh review を別 context で走らせたい: [`subagent`](./mekann/autonomy/subagent/)
- 一般目的を継続追跡したい: [`goal`](./mekann/autonomy/goal/)
- 候補生成と評価を伴う高自律な研究をしたい: [`autoresearch`](./mekann/autonomy/autoresearch/)
- 作業ツリーを ZIP として共有したい: [`zip-repo`](./mekann/utils/zip-repo/)
- Codex (ChatGPT subscription) の使用量を確認したい: [`codex-limits`](./mekann/utils/codex-limits/)
- 現在のモデルに関わらず Web 検索を使いたい: [`codex-web-search`](./mekann/utils/codex-web-search/)
- `lg` や `zed` のような短い入力で人間向け terminal command を開きたい: [`terminal-shortcuts`](./mekann/utils/terminal-shortcuts/)
- Mekann feature settings を `mekann.json` で編集したい: `/mekann-settings` (`settings-editor`)

## インストール

Node.js `>=22.19.0` を使い、依存関係を入れたあと、`~/.pi/agent/settings.json` の `extensions` に `mekann` ディレクトリを追加します。

```bash
npm ci --workspaces --include-workspace-root
```

```json
{
  "extensions": ["/path/to/this/repo/mekann"]
}
```

Pi package としては `package.json` の `pi.extensions` / `pi.skills` から参照されます。
詳しい手順は [Installation](./docs/installation.md) を参照してください。

## 開発

```bash
npm test
npm run typecheck
```

個別 feature の詳細は各 README を参照してください。変更前後の検証方針は [Testing](./TESTING.md) と [Contributing](./CONTRIBUTING.md) にまとめています。

## Skills

Pi coding agent が読む Pi-maintained skill は [`mekann/skills`](./mekann/skills/) 配下に置きます。
`vendor/mattpocock-skills` は upstream skill mirror であり、直接編集しません。

Skill の使い分け、代表 workflow、組み合わせパターンは [Skills Guide](./docs/skills.md) を参照してください。

現在、`mattpocock/skills` の engineering skills を Pi 向けに取り込んでいます。

- `diagnose`
- `grill-with-docs`
- `improve-codebase-architecture`
- `prototype`
- `setup-matt-pocock-skills`
- `tdd`
- `to-issues`
- `to-prd`
- `triage`
- `zoom-out`

## 謝辞

Engineering skills の多くは [mattpocock/skills](https://github.com/mattpocock/skills) に由来します。元の発想・構成・ワークフローは Matt Pocock 氏によるものです。

Mekann では、それらを Pi coding agent 向けに翻案・調整して利用しています。これらの skills と、その背後にあるワークフローの考え方を公開してくださった Matt Pocock 氏に感謝します。
