---
name: edit-article
description: Edit and improve articles and technical documents by restructuring sections, clarifying dependencies, preserving technical accuracy, and tightening prose. Use when the user wants to edit, revise, or improve an article, guide, reference, design document, proposal, or other technical draft.
---

# Edit Article or Technical Document

Adapted for Pi from Matt Pocock's `skills/personal/edit-article` workflow. Its Japanese writing reference units incorporate skills by k16shikano:

- https://gist.github.com/k16shikano/fd287c3133457c4fd8f5601d34aa817d
- https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432

Use this workflow to improve prose and structure without silently changing the document's meaning or technical claims. Communicate with the Mekann user in Japanese unless they request another language; preserve the document's requested language.

## 1. Inspect the draft

Read the complete draft with Pi's `read` tool. If the document spans linked local files, inspect only the files needed to understand the requested scope.

Identify:

- intended audience and purpose;
- document type, such as article, tutorial, reference, runbook, ADR, design document, or proposal;
- existing headings and the main point of each section;
- terminology, claims, code, commands, links, tables, diagrams, and normative language that must remain accurate;
- any explicit style guide or repository instructions.

Do not invent facts to fill gaps. Mark unsupported, ambiguous, or potentially outdated claims for the user instead.

For Japanese technical articles, explanatory documents, and book chapters, load `references/japanese-tech-writing.md` before proposing substantial edits. It is the primary rule set for paragraph structure, argument rigor, reader load, headings, restrained presentation, and removal of empty LLM-like prose.

When the user asks for stronger rhythm or momentum, or describes accurate prose as flat, also load `references/cognitive-rhythm-writing.md`. Apply it only after factual and logical structure is sound. Never manufacture facts, scenes, uncertainty, or tension to create rhythm.

## 2. Propose the structure

Divide the document into sections based on its headings and purpose. Treat information as a directed acyclic graph: definitions and prerequisites must appear before material that depends on them.

Propose only structural changes that improve that dependency order. Briefly show the planned section order and each section's main point, then confirm it with the user before performing a substantial restructure. If the user requested a narrow copy edit or explicitly supplied the structure, keep that scope and do not add an unnecessary approval step.

## 3. Edit each section

For each section:

1. Rewrite for clarity, coherence, and flow.
2. Prefer one idea per paragraph and concise paragraphs. Treat 240 characters as a prose guideline, not a hard limit; do not distort technical explanations merely to meet it.
3. Preserve established terminology and distinguish requirements, recommendations, examples, and speculation.
4. Preserve the semantics of code, commands, API names, configuration keys, citations, links, tables, and diagrams unless the user asked to change them.
5. Keep prerequisites before procedures, procedures before expected results, and warnings before the action they qualify.
6. Remove repetition while retaining information needed by different reader paths.
7. Match the repository's formatting and the document's existing voice unless the user requests a new style.

Use Pi's `edit` tool for precise changes. Use `write` only for a new document or an explicitly requested complete rewrite.

## 4. Verify and report

Reread the edited document and check:

- headings form a coherent outline;
- references and terminology remain consistent;
- no technical claim or normative strength changed unintentionally;
- code fences, links, lists, tables, and cross-references remain intact;
- all requested sections were handled and unrelated content was not rewritten.

Run relevant documentation checks when the repository provides them. Report the edited file path, the major structural or stylistic changes, any unresolved factual questions, and exactly which checks ran.
