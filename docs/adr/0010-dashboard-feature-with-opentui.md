# Dashboard feature uses OpenTUI and separates GitHub activity from local git activity

Mekann will add `/dashboard` as a human-facing terminal dashboard implemented by a dedicated `mekann/utils/dashboard/` utility feature, with `terminal-shortcuts` acting only as the launch surface. The Dashboard feature will use OpenTUI directly inside this repo because the goal is an interactive dashboard experience rather than a text command report, and it will treat GitHub activity as GitHub API/GraphQL-backed data instead of inferring it from local `git log`.

## Considered Options

- Put all behavior in `terminal-shortcuts`: rejected because GitHub data collection, local repo collection, Codex usage summarization, and OpenTUI rendering are a real feature boundary rather than a simple alias.
- Build a separate dashboard CLI package: rejected for the MVP because it adds a package boundary before the OpenTUI integration risk is understood.
- Infer GitHub contribution data from local git history: rejected because local git activity and GitHub activity are different concepts and should not be presented as the same data.

## Consequences

- `mekann/utils/dashboard/` owns dashboard data collection and OpenTUI rendering.
- `/dashboard` is launched as a terminal shortcut, defaulting to pass-through while still allowing the existing Kitty split strategy by configuration.
- GitHub identity and activity are resolved from `gh` CLI first, with `GITHUB_TOKEN` fallback.
- The MVP overview focuses on profile, contribution graph, activity summary, current repo, and Codex usage summary.
- Network or authentication failures should be shown as panel-level errors rather than preventing the entire dashboard from opening.
