---
name: grill-with-docs
description: Stress-test a plan against the project's existing domain language and documented decisions. Use when the user wants a grilling session that sharpens terminology, checks code reality, and updates CONTEXT.md or ADRs.
---

# grill-with-docs for Pi

This is a Pi-facing wrapper for the vendored upstream skill.

Before acting, read the upstream skill instructions:

- `../../../vendor/mattpocock-skills/skills/engineering/grill-with-docs/SKILL.md`
- `../../../vendor/mattpocock-skills/skills/engineering/grill-with-docs/CONTEXT-FORMAT.md`
- `../../../vendor/mattpocock-skills/skills/engineering/grill-with-docs/ADR-FORMAT.md`

Follow the upstream instructions, with these Pi-specific rules:

## Pi adaptation

- Do not edit files under `vendor/mattpocock-skills`.
- Use Pi/Mekann's available read/search/code exploration tools instead of assuming Claude Code-specific tools.
- If a question can be answered by inspecting the codebase, inspect the codebase before asking the user.
- Ask one question at a time.
- When a domain term is resolved, update the appropriate `CONTEXT.md` immediately.
- If no `CONTEXT.md` exists, create it lazily only when the first project-specific term is resolved.
- If an ADR is warranted, create it under `docs/adr/` using the upstream ADR format.

## Domain document rule

`CONTEXT.md` is a glossary only. It must not become a spec, scratchpad, implementation note, or architecture decision log.
