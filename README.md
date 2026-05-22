# Mekann Pi extension suite

Mekann は、Pi coding agent の **自律的な作業**を安全に伸ばすための Pi extension suite です。

このリポジトリでは、機能を次の単位で整理します。

- **Pi extension suite**: `core` / `safety` / `autonomy` / `context` / `utils` のような読み込み・配布のまとまり
- **Feature**: `sandbox` や `subagent` のように、責任を持つ個別機能
- **Skill**: エージェントが特定作業のために読む手順書。runtime tool を提供する feature ではありません

用語の詳細は [`CONTEXT.md`](./CONTEXT.md) を参照してください。

## 全体像

| Suite | 役割 | Feature |
|---|---|---|
| [`core`](./mekann/core/) | prompt の土台と常時ガイドライン | [`prompt-core`](./mekann/core/prompt-core/), [`cache-friendly-prompt`](./mekann/core/cache-friendly-prompt/), [`agent-guidelines`](./mekann/core/agent-guidelines/) |
| [`safety`](./mekann/safety/) | 自律性を許容するための安全境界 | [`sandbox`](./mekann/safety/sandbox/), [`plan-mode`](./mekann/safety/plan-mode/), [`policy-core`](./mekann/safety/policy-core/) |
| [`autonomy`](./mekann/autonomy/) | 長い作業・並列作業・実験的作業の継続 | [`goal`](./mekann/autonomy/goal/), [`subagent`](./mekann/autonomy/subagent/), [`autoresearch`](./mekann/autonomy/autoresearch/) |
| [`context`](./mekann/context/) | runtime context management | [`output-gate`](./mekann/context/output-gate/), [`context-ledger`](./mekann/context/ledger/) |
| [`utils`](./mekann/utils/) | 小さな人間向け補助機能 | [`zip-repo`](./mekann/utils/zip-repo/) |

## 代表的な使い分け

- 実装前に読み取り専用で考えたい: [`plan-mode`](./mekann/safety/plan-mode/)
- `bash` tool の実行を OS レベルで制限したい: [`sandbox`](./mekann/safety/sandbox/)
- 大きな tool output を context window に入れすぎたくない: [`output-gate`](./mekann/context/output-gate/)
- 決定・タスク・エラーなどの作業記憶を残したい: [`context-ledger`](./mekann/context/ledger/)
- 独立調査や fresh review を別 context で走らせたい: [`subagent`](./mekann/autonomy/subagent/)
- 一般目的を継続追跡したい: [`goal`](./mekann/autonomy/goal/)
- 候補生成と評価を伴う高自律な研究をしたい: [`autoresearch`](./mekann/autonomy/autoresearch/)
- 作業ツリーを ZIP として共有したい: [`zip-repo`](./mekann/utils/zip-repo/)

## インストール

`~/.pi/agent/settings.json` の `extensions` に `mekann` ディレクトリを追加します。

```json
{
  "extensions": ["/path/to/this/repo/mekann"]
}
```

Pi package としては `package.json` の `pi.extensions` / `pi.skills` から参照されます。

## 開発

```bash
npm test
npm run typecheck
```

個別 feature の詳細は各 README を参照してください。

## Skills

Pi coding agent が読む Pi-maintained skill は [`mekann/skills`](./mekann/skills/) 配下に置きます。
`vendor/mattpocock-skills` は upstream skill mirror であり、直接編集しません。

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
