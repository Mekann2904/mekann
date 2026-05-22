---
name: improve-codebase-architecture
description: Review a codebase for architectural friction, shallow modules, poor seams, weak locality, and low leverage. Use when the user asks to improve architecture, refactor structure, or make a codebase more testable and AI-navigable.
---

# improve-codebase-architecture for Pi

This is a Pi-facing wrapper for the vendored upstream skill.

Before acting, read the upstream skill instructions:

- `../../../vendor/mattpocock-skills/skills/engineering/improve-codebase-architecture/SKILL.md`
- `../../../vendor/mattpocock-skills/skills/engineering/improve-codebase-architecture/LANGUAGE.md`
- `../../../vendor/mattpocock-skills/skills/engineering/improve-codebase-architecture/HTML-REPORT.md`
- `../../../vendor/mattpocock-skills/skills/engineering/improve-codebase-architecture/INTERFACE-DESIGN.md`
- `../../../vendor/mattpocock-skills/skills/engineering/grill-with-docs/CONTEXT-FORMAT.md`
- `../../../vendor/mattpocock-skills/skills/engineering/grill-with-docs/ADR-FORMAT.md`

Follow the upstream instructions, with these Pi-specific rules:

## Pi adaptation

- Do not edit files under `vendor/mattpocock-skills`.
- When upstream says to use `Agent tool` with `subagent_type=Explore`, use Pi/Mekann's available code exploration mechanisms instead.
- If the Mekann subagent extension is available, use it only for read-only exploration.
- Do not ask subagents to edit files, run git operations, or make architecture decisions.
- If no subagent mechanism is available, perform the exploration directly using normal read/search commands.
- Keep upstream terminology exactly:
  - Module
  - Interface
  - Implementation
  - Depth
  - Seam
  - Adapter
  - Leverage
  - Locality
- Do not substitute these with "component", "service", "API", or "boundary".

## Report behavior

- Generate the architecture report as a temporary HTML file, as upstream instructs.
- Use the OS temp directory.
- Do not write the report into the repository unless the user explicitly asks.
- If opening the file with the OS command fails, report the absolute path instead.

## Decision behavior

- Read `CONTEXT.md`, `CONTEXT-MAP.md`, and `docs/adr/` before proposing architecture changes when they exist.
- If a proposed refactor contradicts an ADR, surface it only when the friction is real enough to revisit the ADR.
- Do not propose interfaces during the initial report phase.
- After presenting candidates, ask which candidate the user wants to explore.
