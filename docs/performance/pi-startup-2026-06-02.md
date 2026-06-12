# Pi startup measurement — 2026-06-02

## Scope

Measured Pi CLI startup up to `--help` rendering in this repository, with `PI_OFFLINE=1` to avoid startup network variance.

Commands:

```bash
# Default extension discovery, Mekann profiling enabled
MEKANN_STARTUP_PROFILE="$PWD/.pi/perf/pi-startup-profile.jsonl" PI_OFFLINE=1 pi --help >/dev/null

# Pi baseline without discovered extensions
PI_OFFLINE=1 pi --no-extensions --help >/dev/null
```

Each command was run 7 times from `/Users/mekann/github/pi-plugin/mekann`.
Raw measurements are in:

- `.pi/perf/pi-startup-times.tsv`
- `.pi/perf/pi-startup-profile.jsonl`

## Wall-clock results

| Mode | n | Mean | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| default | 7 | 3758.0 ms | 3650.7 ms | 3365.4 ms | 4287.6 ms |
| `--no-extensions` | 7 | 818.8 ms | 811.0 ms | 762.5 ms | 898.3 ms |

Observed extension-discovery overhead for this setup is roughly **2939 ms mean** (`default - --no-extensions`).

## Mekann startup profile breakdown

`MEKANN_STARTUP_PROFILE` records JSONL events only when explicitly set. Normal startup does not write these events.

| Step | n | Mean | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `suite-imports` | 7 | 113.3 ms | 104.0 ms | 82.6 ms | 192.5 ms |
| `suite-core` | 7 | 539.4 ms | 562.1 ms | 460.8 ms | 604.2 ms |
| `suite-safety` | 7 | 260.2 ms | 263.4 ms | 246.7 ms | 269.9 ms |
| `suite-autonomy` | 7 | 1134.7 ms | 1152.2 ms | 983.8 ms | 1316.1 ms |
| `suite-utils` | 7 | 441.8 ms | 456.7 ms | 379.0 ms | 495.4 ms |
| `suite-context` | 7 | 237.7 ms | 230.7 ms | 200.6 ms | 310.7 ms |

Import-only substeps show that most suite time is module import cost:

| Import step | n | Mean | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `core-imports` | 7 | 535.4 ms | 557.1 ms | 456.9 ms | 600.9 ms |
| `safety-imports` | 7 | 258.2 ms | 260.1 ms | 245.5 ms | 268.6 ms |
| `autonomy-imports` | 7 | 1132.0 ms | 1149.6 ms | 981.8 ms | 1312.6 ms |
| `utils-imports` | 7 | 440.5 ms | 455.5 ms | 378.0 ms | 494.3 ms |
| `context-imports` | 7 | 235.8 ms | 229.1 ms | 198.5 ms | 308.7 ms |

## Findings

- Biggest Mekann startup contributor is `suite-autonomy` / `autonomy-imports` at about **1.13 s mean**.
- Next largest contributors are `suite-core` at about **0.54 s mean** and `suite-utils` at about **0.44 s mean**.
- Suite execution overhead after import is small; the profile indicates the current hot path is TypeScript/ESM module loading and top-level imports, not registration logic.
- The earlier lazy settings-enabled path is important: feature enabled checks should not import the settings schema registry on startup.

## After optimization

A second run after startup-path changes was measured with the same command shape, 5 runs:

- `.pi/perf/pi-startup-times-after3.tsv`
- `.pi/perf/pi-startup-profile-after3.jsonl`

| Mode | n | Mean | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| default after optimization | 5 | 2994.4 ms | 3082.8 ms | 2354.6 ms | 3658.1 ms |

Compared with the initial default mean of 3758.0 ms, this is about **763.6 ms faster** on this machine.

A follow-up optimization lazily loads Dashboard rendering internals only when `/dashboard` is executed. A 3-run detail profile then measured:

- `.pi/perf/pi-startup-times-detail2.tsv`
- `.pi/perf/pi-startup-profile-detail2.jsonl`

| Mode | n | Mean | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| default after dashboard lazy-load | 3 | 2595.1 ms | 2677.1 ms | 2208.8 ms | 2899.3 ms |

Compared with the initial default mean of 3758.0 ms, this is about **1162.9 ms faster** on this machine.

Post-change Mekann profile means:

| Step | Mean | Median |
| --- | ---: | ---: |
| `suite-imports` | 101.3 ms | 83.6 ms |
| `suite-core` | 293.2 ms | 301.4 ms |
| `suite-safety` | 639.6 ms | 516.9 ms |
| `suite-autonomy` | 415.9 ms | 402.7 ms |
| `suite-utils` | 411.9 ms | 424.6 ms |
| `suite-context` | 203.5 ms | 195.2 ms |

Changes responsible:

- Feature enabled checks and hot startup settings reads now avoid importing the full settings schema registry.
- `autoresearch` is no longer imported by default unless `features.autoresearch.enabled` is explicitly `true` in Mekann settings. This matches the current autoresearch-off operating policy and removes the previous largest import cost from normal startup.
