---
name: zoom-out
description: Tell the agent to zoom out and give broader context or a higher-level perspective. Use when you're unfamiliar with a section of code or need to understand how it fits into the bigger picture.
disable-model-invocation: true
---

> 謝辞: この skill は [mattpocock/skills](https://github.com/mattpocock/skills) をもとに Pi / Mekann 向けに翻案したものです。元の発想・構成・ワークフローは Matt Pocock 氏によるものです。

## Language policy

Use Japanese explicitly for all interaction with the user: questions, recommendations, explanations, summaries, issue/PRD/report text, and documentation updates created during the session. Keep existing project terms, code identifiers, file names, labels, and quoted text in their original language when needed, but explain them in Japanese.


I don't know this area of code well. Go up a layer of abstraction. Give me a map of all the relevant modules and callers, using the project's domain glossary vocabulary.
