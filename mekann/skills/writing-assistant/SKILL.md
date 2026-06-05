---
name: writing-assistant
description: Use for creating and improving Japanese technical documents, academic papers, and research writing. Draft the structure and initial text in the language the LLM handles best, usually English and sometimes Chinese, then translate and edit into Japanese with attention to technical accuracy, logical structure, Japanese style, and academic writing conventions.
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
- The request requires inventing research results, numbers, citations, or prior work without evidence.
- The required conference, university, or lab formatting rules are unknown and strongly affect the deliverable.
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
5. Separate uncertainties about facts, numbers, citations, and proper nouns.

Do not normally show the internal draft to the user. Include it only if the user asks for it.

## Initial questions

Ask brief questions only when missing information would significantly affect the quality of the deliverable.

- Document type: technical article, README, undergraduate thesis, master's thesis, paper, abstract, proposal, etc.
- Audience: general developers, specialists, reviewers, supervisors, or reviewers outside the field
- Medium and format: conference template, lab rules, punctuation style, length, LaTeX / Word
- Style: academic Japanese usually uses direct style; general-audience writing may use polite style
- Required elements: background, objective, method, results, discussion, contribution, limitations, references
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
2. Read the relevant reference unit files.
3. Create an outline if needed.
4. Internally generate the logical structure and initial draft in the strongest working language.
5. Translate into Japanese and remove translationese.
6. Review the result as a technical document or academic paper: structure, notation, citations, figures, tables, formulas, and expression.
7. Keep uncertain facts, citations, numbers, and proper nouns out of the main text; list them separately as items to verify.

## Quality priorities for technical and academic writing

- The problem statement, proposal, results, and conclusion correspond to each other.
- Facts, claims, hypotheses, and discussion are clearly separated.
- Subjects, predicates, and objects are clear.
- The text is reproducible and verifiable by the reader.
- Qualitative statements are made quantitative and objective where possible.
- Figures, tables, formulas, and references are explained in the body text.
- The writing is specific to the research content, not generic AI-sounding boilerplate.

## Output policy

- Prefer immediately usable final text.
- Prefer final text, outlines, revision proposals, and checklists over long explanations.
- When multiple options are useful, provide only 2-3 options.
- Follow the user's existing style and any lab or conference rules when available.
- Do not mix unknowns into the main text; separate them at the end as items to verify.

## Editing files

When directly editing writing files, use Pi's normal tools.

- Read content: `read`
- Search and list files: `bash` with `rg`, `find`, `ls`
- Precise replacement: `edit`
- New files or full rewrites: `write`

Do not modify existing files that the user did not specify.
