# mattpocock-skills vendor policy

This repository vendors `mattpocock/skills` under `vendor/mattpocock-skills`.

## Rules

- Do not edit files under `vendor/mattpocock-skills` directly.
- Treat that directory as an upstream mirror.
- Pi-specific adaptation should live in Mekann-owned skills under `mekann/skills`.
- Update upstream with:

```bash
npm run update:mattpocock-skills
```

## Exposed skills

The Pi package currently exposes:

* `grill-with-docs`
* `improve-codebase-architecture`

Other upstream skills are vendored but not exposed unless added to `package.json` under `pi.skills`.
