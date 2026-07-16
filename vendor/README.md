# Vendor sources

`vendor/` is for local upstream mirrors only. Do not commit mirrored upstream repositories to GitHub.

The Pi-maintained copies that are actually loaded by Pi live under `mekann/skills/`. Update scripts may fetch upstream repositories into `vendor/` temporarily or for local inspection, then copy/adapt selected files into `mekann/skills/`.

## Vendor list

| Local mirror | Upstream | Update command | Pi-maintained output |
|---|---|---|---|
| `vendor/mattpocock-skills/` | `https://github.com/mattpocock/skills` | `npm run update:mattpocock-skills` | selected skills in `mekann/skills/` |
| `vendor/cursor-plugins/` | `https://github.com/cursor/plugins` | `npm run update:cursor-plugins-skills` | selected skills in `mekann/skills/` |
| `vendor/greensock-gsap-skills/` | `https://github.com/greensock/gsap-skills` | `npm run update:gsap-skills` | `mekann/skills/gsap-*` |
| `vendor/k16shikano-japanese-tech-writing/` | `https://gist.github.com/k16shikano/fd287c3133457c4fd8f5601d34aa817d` | `npm run update:k16shikano-writing-skills` | `mekann/skills/writing-assistant/references/japanese-tech-writing.md` |
| `vendor/k16shikano-cognitive-rhythm-writing/` | `https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432` | `npm run update:k16shikano-writing-skills` | `mekann/skills/writing-assistant/references/cognitive-rhythm-writing.md` |
| `vendor/alchaincyf-darwin-skill/` | `https://github.com/alchaincyf/darwin-skill` | `npm run update:self-evolving-skill` | `mekann/skills/self-evolving-skill/` |
| `vendor/oss/` | assorted OSS reference clones | `npm run update:oss` | reference-only, not loaded as Pi skills |

## Rules

- Treat `vendor/` as disposable local cache.
- Do not edit `vendor/` directly for Pi behavior.
- Do not depend on `vendor/` at runtime.
- Commit only the Pi-maintained outputs under `mekann/skills/` and the update scripts/docs needed to recreate mirrors.
