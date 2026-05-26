---
name: plan-grill-with-docs
description: Use in plan mode when the user is creating, refining, stress-testing, choosing, or validating a plan, design, spec, architecture, or implementation approach. Read-only wrapper around grill-with-docs; produce docs_update_proposal instead of editing docs, and avoid use for simple ask-mode questions.
---

# plan-grill-with-docs

この skill は [grill-with-docs](../grill-with-docs/) の plan mode read-only 版です。
元の `grill-with-docs` がその場で docs を inline 更新するのに対し、plan mode では書き込み制限があるため、docs 更新案を保持し、mode 切替後に実行側へ渡す形をとる。

ユーザーが plan mode 中に計画・設計・仕様・アーキテクチャ・実装方針を作成、精査、選択、検証しようとしている場合に使う。単なる説明依頼、使い方確認、翻訳、軽い ask-mode 質問では使わない。

## 基本方針

- 日本語で対話する。
- 計画をすぐに確定せず、既存の domain language / documented decisions / code facts と照合して詰める。
- ユーザーに質問する前に、コードベースや docs から確認できることは確認する。
- **質問は一度に1つだけ行い、ユーザーの回答を待ってから次に進む。**
- 各質問には推奨回答を添える。
- fuzzy / overloaded な用語は、より正確な canonical term を提案する。
- `CONTEXT.md` や ADR と矛盾する用語・説明があれば、その場で指摘する。
- 実装者が追加意思決定しなくてよい状態になるまで、未解決の依存関係を潰す。

## grill-with-docs からの差分

元の `grill-with-docs` と同じワークフローに従うが、plan mode の read-only 制約により以下を読み替える：

- `CONTEXT.md` / `docs/adr/` / 関連 docs は必要に応じて読む。
- **ファイル編集、作成、削除はしない。** 元 skill の「CONTEXT.md を inline 更新する」指示は適用しない。
- 用語や決定が固まり、docs 更新が必要になった場合は、実ファイルを変更せず `<docs_update_proposal>` ブロックを出す。
- ADR は、本当に必要な場合だけ提案する。
- 最終的に mode を抜けたら docs 更新を実行できるよう、`<docs_update_proposal>` の内容を `<implementation_brief>` に含めて handoff する。

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

調査時は次を確認する。

- root `CONTEXT.md`
- root `CONTEXT-MAP.md` がある場合は、対象 context の `CONTEXT.md`
- `docs/adr/` と context-specific `docs/adr/`
- ユーザーの説明と矛盾しうる実装箇所

`CONTEXT.md` は glossary として扱い、実装詳細や scratch pad として扱わない。

## Output: implementation handoff

`<implementation_brief>` はこの skill のデフォルト応答形式ではない。最終 handoff artifact である。

次の条件をすべて満たす場合だけ出す：

- ユーザーが実装へ移す意図を示している、または実装 handoff が自然な段階まで合意が進んでいる
- コード / docs で確認できる事実は確認済み
- scope / non-scope / decisions / implementation steps / validation が具体化されている
- **未解決の設計判断がない**

**未解決の設計判断がある場合は `<implementation_brief>` を出さない。**
代わりに、次に解くべき質問を1つだけ提示し、推奨回答を添える。

方針整理、用語整理、docs 更新提案だけで終わる場合は brief は不要。

`<implementation_brief>` は次の構造を使う：

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

ルール：

- 開始タグと終了タグはそれぞれ単独の行に配置する
- brief 内容は人間とエージェントの両方が理解できること
- 実装者がすぐに作業できる詳細さにすること
- 簡潔に: goal、scope、decisions、implementation steps、validation、open questions を含める
- ファイル単位の目録ではなく、振る舞いごとにグループ化すること
- 「実行しますか？」とは尋ねないこと
- 1ターンに1つの `<implementation_brief>` のみ
- 改訂時は完全な置換として出力すること
- `<docs_update_proposal>` がある場合、brief 内で「mode 切替後に実行する docs 更新」として参照すること
- `<implementation_brief>` は原則 1200〜2000 words 以下に収める。調査ログ、読んだファイル一覧、長いコード引用、重複説明は含めない
