---
name: writing-assistant
description: Use for creating and improving Japanese technical documents, academic papers, and research writing. Draft the structure and initial text in the LLM's strongest working language, then translate and edit into Japanese with attention to technical accuracy, logical structure, Japanese style, and academic writing conventions.
---

# writing-assistant

A Pi-oriented skill for creating and improving Japanese technical documents, academic papers, and research writing.

## When to use

Use this skill when the user's primary goal is a written deliverable. Prioritize these cases:

- Japanese technical documents, design documents, README files, and explanatory articles
- Undergraduate theses, master's theses, journal papers, workshop papers, and abstracts
- Related work, proposed methods, experimental results, discussion, conclusions, and future work
- Revising, summarizing, translating, tone adjustment, and structural editing of existing text
- Figure and table captions, reference-related text, and paper review checklists

## When not to use

- The primary task is code implementation, debugging, or test creation.
- The request requires inventing research results, numbers, citations, venues, author names, or prior work without evidence.
- The user keeps asking for fabricated evidence after a refusal and safe alternatives.
- The required conference, university, or lab formatting rules are unknown and strongly affect the deliverable and the user does not allow assumptions.
- The request would support plagiarism, self-plagiarism, unattributed reuse, or false authorship/contribution claims.
- The request asks the agent to substitute for high-risk legal, medical, or financial judgment.

## Core principle

Even when the final output is Japanese, do not default to composing directly in Japanese.

1. Clarify the requirements in Japanese.
2. Internally generate the structure and first draft in the language the LLM writes best.
   - Default to English.
   - Use another language, such as Chinese, if the model or task is clearly stronger in that language.
3. Translate the draft into Japanese.
4. Edit it as a Japanese technical document or academic paper.
5. Apply the source-integrity rules for uncertain facts, numbers, citations, and proper nouns.

Do not normally show the internal draft to the user. Include it only if the user asks for it.

## Initial questions

Ask brief questions only when missing information would significantly affect the quality of the deliverable. If the user provides text and asks for revision, usually revise first and put non-blocking uncertainties in `要確認`.

- Document type: technical article, README, undergraduate thesis, master's thesis, paper, abstract, proposal, etc.
- Audience: general developers, specialists, reviewers, supervisors, or reviewers outside the field
- Medium and format: conference template, lab rules, punctuation style, length, LaTeX / Word
- Style: academic Japanese usually uses direct style; general-audience writing may use polite style
- Required elements: background, objective, method, results, discussion, contribution, limitations, references
- Source material: provided manuscript, notes, papers, datasets, experiment results, and citation rules
- Citation mode: keep existing citations, use only provided sources, or leave citation placeholders
- Style-guide authority: provided lab, university, conference, or journal rules; otherwise state assumptions
- Prohibited content: expressions to avoid, unpublished information, claims that cannot be asserted

If the user asks for a first proposal immediately, state assumptions and provide a draft.

## Reference units

Read the following reference files as needed. Do not read all of them every time.

- `references/multilingual-drafting.md`: drafting in a strong working language, then finishing in Japanese
- `references/japanese-technical-style.md`: Japanese notation, punctuation, character types, and wording
- `references/academic-writing-checklist.md`: paper structure, chapters, sections, paragraphs, and abstracts
- `references/figures-formulas-citations.md`: figures, tables, formulas, references, citations, and plagiarism prevention
- `references/expression-rewrite-rules.md`: fixing vague wording, casual wording, noun-ending sentences, and passive voice

## Workflow

1. Identify the purpose, audience, document type, and constraints.
2. Read only the relevant reference unit files:
   - style / notation issues: `japanese-technical-style.md` or `expression-rewrite-rules.md`
   - academic structure: `academic-writing-checklist.md`
   - figures, formulas, citations, or plagiarism risk: `figures-formulas-citations.md`
   - multilingual drafting decisions: `multilingual-drafting.md`
3. Create an outline if needed.
4. Internally generate the logical structure and initial draft in the strongest working language.
5. Translate into Japanese and remove translationese.
6. Review the result as a technical document or academic paper: structure, notation, citations, figures, tables, formulas, and expression.
7. List unverifiable facts, citations, numbers, and proper nouns separately as `要確認` items.

## Quality priorities for technical and academic writing

- For abstracts and introductions, make the chain explicit: background → problem → objective → method → result or expected contribution → conclusion.
- The problem statement, proposal, results, and conclusion correspond to each other.
- Facts, claims, hypotheses, and discussion are clearly separated.
- Tense and aspect are chosen from the claim type: established facts use present tense, completed experiments use past tense, paper contents often use present tense, and future work uses future/intent expressions.
- For past judgments or design decisions, make the time and agent explicit: use forms like `当時は〜と判断した`, `当時の条件では〜と考えた`, or `そのため〜を採用した`; avoid rewriting them as timeless facts such as `〜である` unless the claim is still valid.
- Subjects, predicates, and objects are clear.
- The text is reproducible and verifiable by the reader.
- Qualitative statements are made quantitative and objective where possible.
- Figures, tables, formulas, and references are explained in the body text.
- The writing is specific to the research content, not generic AI-sounding boilerplate.
- In related-work sections, classify prior work and state the difference from the user's work; do not merely list papers.
- Avoid AI-like hype, decorative formatting, and generic filler; replace them with concrete mechanisms, conditions, numbers, and evidence.

## Output policy

- Prefer immediately usable final text.
- Prefer final text, outlines, revision proposals, and checklists over long explanations.
- When multiple options are useful, provide only 2-3 options.
- Follow the user's existing style and any lab or conference rules when available.
- Preserve domain terms, notation, variable names, API names, commands, citations, formulas, and coined terms unless they are clearly wrong or the user asks to standardize them.
- When translating into Japanese, do not mechanically mirror English tense; choose natural Japanese tense/aspect from the meaning and document section.
- If a sentence means "we judged/decided X at that time," keep it as a past judgment or decision, not as a current universal claim; preserve hedges such as `当時`, `その時点では`, `判断した`, `考えた`, and `採用した`.
- Keep one Japanese translation per technical term within the same document unless the source text intentionally distinguishes terms.
- Do not mix unknowns into the main text; use the `要確認` convention from Source integrity.
- Use only the output blocks relevant to the request; omit empty or unnecessary sections.
- Do not provide a full sentence-by-sentence explanation unless the user asks for review comments or teaching-oriented feedback.

Choose one concise response shape:

- Revision: `改稿` → `主な修正` → `要確認` when needed.
- Sparse new draft: `前提` → `構成案` → `本文案` → `要確認`.
- Unsafe request: `対応できません` → `代替案` with a source-based rewrite, citation-free placeholder, or search plan.

## Anti-AI writing rules

When drafting or revising, reduce AI-like style:

- Do not use emoji, decorative list markers, bold-prefix labels like `**重要**`, or attention-grabbing icons.
- Avoid hype words such as `革命的`, `ゲームチェンジャー`, `世界初`, `究極`, `完全`, `完璧`, `最高`, `最先端`, `大幅`, `魔法のように`, `奇跡的`, `驚異的`, `可能性を解き放つ`, `未来を変える`, `パラダイムシフト`, and `根本的に変革` unless the source evidence justifies them.
- Replace hype with concrete changes, mechanisms, benefits, numbers, comparison targets, or evaluation criteria.
- Avoid boilerplate phrases such as `まず最初に`, `あらかじめ予測`, `することができます`, `する必要があります`, and `言うまでもなく`; write the core statement directly.
- Avoid colon-led continuations such as `実行します:` or `次のように〜します。`; use natural Japanese sentence endings.
- Prefer active, specific verbs: `実行する`, `処理する`, `変更する`, `実装する`; avoid vague forms such as `行われる`, `変更を行う`, or `実装を実施する`.
- Keep terminology, page names, and style consistent within the same document; do not mix `です・ます` and `だ・である` without a reason.
- Avoid repeated `また、` and bullet fragments immediately after connective phrases like `例えば。` or `具体的には。`.

## Source integrity

- Never invent research results, numbers, citations, venues, author names, or prior work.
- If sources are missing, write a citation-free draft, a placeholder structure, or a search plan instead of fabricated evidence.
- When revising supplied text, preserve the author's claims unless explicitly asked to weaken, qualify, or reorganize them.
- Mark unverifiable claims as `要確認` rather than presenting them as facts.

Use this compact verification block when uncertainty remains:

```text
要確認:
- <claim / number / citation / proper noun>: <what source or user input is needed>
```

## Editing files

When directly editing writing files, use Pi's normal tools.

- Read content: `read`
- Search and list files: `bash` with `rg`, `find`, `ls`
- Precise replacement: `edit`
- New files or full rewrites: `write`

When editing Markdown or LaTeX drafts, preserve the user's existing structure, headings, labels, citations, and code/formula blocks unless the requested revision specifically targets them.

Do not modify existing files that the user did not specify.
