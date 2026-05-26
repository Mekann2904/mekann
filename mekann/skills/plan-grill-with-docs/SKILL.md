---
name: plan-grill-with-docs
description: Use in plan mode when the user is creating, refining, stress-testing, choosing, or validating a plan, design, spec, architecture, or implementation approach. Read-only wrapper around grill-with-docs; produce docs_update_proposal instead of editing docs, and avoid use for simple ask-mode questions.
---

# plan-grill-with-docs

この skill は、plan mode 専用の `grill-with-docs` workflow です。ユーザーが plan mode 中に計画・設計・仕様・アーキテクチャ・実装方針を作成、精査、選択、検証しようとしている場合に使います。単なる説明依頼、使い方確認、翻訳、軽い ask-mode 質問では使いません。

## 基本方針

- 日本語で対話する。
- 計画をすぐに確定せず、既存の domain language / documented decisions / code facts と照合して詰める。
- ユーザーに質問する前に、コードベースや docs から確認できることは確認する。
- 質問は一度に1つだけ行い、各質問には推奨回答を添える。
- fuzzy / overloaded な用語は、より正確な canonical term を提案する。
- `CONTEXT.md` や ADR と矛盾する用語・説明があれば、その場で指摘する。
- 実装者が追加意思決定しなくてよい状態になるまで、未解決の依存関係を潰す。

## plan mode read-only override

plan mode は read-only です。`grill-with-docs` の「docs を inline 更新する」指示は、この skill では次のように読み替えます。

- `CONTEXT.md` / `docs/adr/` / 関連 docs は必要に応じて読む。
- ファイル編集、作成、削除はしない。
- 用語や決定が固まり、docs 更新が必要になった場合は、実ファイルを変更せず `<docs_update_proposal>` ブロックを出す。
- ADR は、本当に必要な場合だけ提案する。

`<docs_update_proposal>` は `<implementation_brief>` とは独立したブロックにする。

```md
<docs_update_proposal>
## CONTEXT.md
- Add term: ...
  - Definition: ...

## ADR candidates
- Title: ...
  - Context: ...
  - Decision: ...
  - Consequences: ...
</docs_update_proposal>
```

## Domain-doc grounding

調査時は次を確認します。

- root `CONTEXT.md`
- root `CONTEXT-MAP.md` がある場合は、対象 context の `CONTEXT.md`
- `docs/adr/` と context-specific `docs/adr/`
- ユーザーの説明と矛盾しうる実装箇所

`CONTEXT.md` は glossary として扱い、実装詳細や scratch pad として扱わない。

## Output: implementation handoff

実装に移す合意があり、十分な決定が揃った場合だけ `<implementation_brief>` を出します。方針整理、用語整理、docs 更新提案だけで終わる場合は出さなくてよい。

`<implementation_brief>` は次の構造を使う。

```md
<implementation_brief>
## Goal
...

## Scope
- Change:
- Do not change:

## Decisions
- ...

## Implementation steps
1. ...

## Validation
- ...

## Open questions
- None
</implementation_brief>
```

`Open questions` が残る場合は、原則として implementation brief を出さず、次に解くべき質問を1つだけ提示する。
