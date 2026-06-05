# Vendor sources

`vendor/` is for local upstream mirrors only. Do not commit mirrored upstream repositories to GitHub.

The Pi-maintained copies that are actually loaded by Pi live under `mekann/skills/`. Update scripts may fetch upstream repositories into `vendor/` temporarily or for local inspection, then copy/adapt selected files into `mekann/skills/`.

## Vendor list

| Local mirror | Upstream | Update command | Pi-maintained output |
|---|---|---|---|
| `vendor/mattpocock-skills/` | `https://github.com/mattpocock/skills` | `npm run update:mattpocock-skills` | selected skills in `mekann/skills/` |
| `vendor/cursor-plugins/` | `https://github.com/cursor/plugins` | `npm run update:cursor-plugins-skills` | selected skills in `mekann/skills/` |
| `vendor/greensock-gsap-skills/` | `https://github.com/greensock/gsap-skills` | `npm run update:gsap-skills` | `mekann/skills/gsap-*` |
| `vendor/alchaincyf-darwin-skill/` | `https://github.com/alchaincyf/darwin-skill` | `npm run update:self-evolving-skill` | `mekann/skills/self-evolving-skill/` |
| `vendor/oss/` | assorted OSS reference clones | `npm run update:oss` | reference-only, not loaded as Pi skills |

## Rules

- Treat `vendor/` as disposable local cache.
- Do not edit `vendor/` directly for Pi behavior.
- Do not depend on `vendor/` at runtime.
- Commit only the Pi-maintained outputs under `mekann/skills/` and the update scripts/docs needed to recreate mirrors.
