# Sandbox Extension

macOS Seatbelt (`sandbox-exec`) による bash tool 用コマンドサンドボックス化 extension。

## [!] Important Scope Limitation

**This extension sandboxes ONLY the bash tool in the Pi coding agent.**

It is **NOT** any of the following:
- An agent-wide sandbox
- A Codex-equivalent sandbox
- A production-grade sandbox
- A fully secure environment

It is a **macOS Seatbelt-based defense-in-depth bash command sandbox with documented limitations**.

### What is NOT sandboxed

The following tools and operations are NOT covered by this sandbox:
- File edit tool
- Patch tool
- MCP tools
- Extension tools
- Other plugins' tool registrations
- `localBash` when `--no-sandbox` or approved `yolo`
- Any tool registered by other extensions

Only commands executed through the overridden bash tool are sandboxed.

## Platform Dependency

- **macOS only**: macOS Seatbelt / `sandbox-exec` に依存する。
- **Unsupported OS**: Linux/Windows では sandbox security は提供されない。Bash commands will be REFUSED。
- **Fail-closed**: sandbox-exec が利用不可の場合、`read_only` / `workspace_write` モードでのコマンド実行は **拒否される**。silent fallback はしない。
- 実行するには `--no-sandbox` で明示的に sandbox を無効にするか、承認済み `yolo` モードにする必要がある。

## Peer Dependencies

This extension uses `@earendil-works/pi-coding-agent` as a peer dependency because:
- The host Pi coding agent provides this package at runtime
- The extension imports types (`ExtensionAPI`) and utilities (`createBashTool`) from it
- It is NOT bundled with the extension — the host must provide it
- This ensures version compatibility with the host agent

## Sandbox Modes

| Mode | Workspace 読み取り | Workspace 書き込み | Isolated Temp 書き込み | Isolated HOME | Network |
|------|----------|----------|-----------|---------|---------|
| `read_only` | ON | OFF | ON (per-run isolated) | ON (per-run isolated) | OFF |
| `workspace_write` | ON | ON (.git/.codex/.agents 除く) | ON (per-run isolated) | ON (per-run isolated) | opt-in |
| `yolo` | 制限なし | 制限なし | N/A | N/A | 制限なし |

### read_only の正確な意味

- **Workspace は read-only**: workspace roots 配下のファイルは読めるが書けない
- **Isolated temp は writable**: command ごとに作成される専用 temp directory (`$TMPDIR`) へのみ書き込み可能
  - これは workspace 外に作成される独立した directory である
  - command 終了後に自動削除される
  - system TMPDIR 全体への広い許可ではない
- **Isolated HOME**: `$HOME` は workspace/cwd ではなく per-run temp 配下の isolated directory に設定される
- **System paths は読める**: `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin`, `/usr/lib`, `/usr/libexec`, `/usr/share`, `/System`, `/etc`, `/dev`
- **/Users は読めない**: `/Users` 全体は read path に含まれない

### workspace_write の正確な意味

- Workspace 内への書き込みを許可
- ただし repo metadata は保護: `.git`, `.codex`, `.agents` 配下への書き込みは deny
- `.git` が pointer file の場合、resolved gitdir への書き込みも deny
- symlink 経由で workspace 外に書き込むことはできない (Seatbelt が canonical path を評価)
- **Isolated HOME**: `$HOME` は workspace/cwd ではなく isolated temp に設定される

### yolo の正確な意味

- **Sandbox を完全に外す**: macOS Seatbelt による制限が一切ない
- すべてのファイル、ネットワーク、コマンドに無制限アクセス
- **ユーザーの明示的承認が必要**: CLI flag, `/sandbox` コマンド, tool 実行時のいずれかで承認が必要
- 承認なしではコマンド実行不可

### network=false の正確な意味と限界

- `network=false` は SBPL で `(deny default)` の下で network rule を追加しないことで実現
- Seatbelt は coarse-grained な network 制御のみ: 全ての outbound/inbound を block
- 個別ホストやポートの制限はしない
- DNS 解決に必要な `mach-lookup` は許可されているため、DNS クエリ自体は出る可能性があるが、TCP/UDP 接続は block される

## Bash Startup Files

**This sandbox explicitly prevents loading of bash startup files:**

- Commands are executed via `/bin/bash --noprofile --norc -c <command>`
- This means the following files are NOT loaded:
  - `/etc/profile`
  - `~/.bash_profile`
  - `~/.bash_login`
  - `~/.profile`
  - `~/.bashrc`
  - Any `.bash_profile` or `.profile` in the workspace directory
- `$HOME` is set to a per-run isolated temp directory, not the workspace or user home
- This prevents workspace-controlled startup file injection

## Approval System

**The approval layer is a UX convenience, NOT a security boundary.**

- 危険コマンド検出 regex は簡単に bypass 可能である
- これは user confirmation friction を追加するためだけのもの
- regex に過度な安全性を持たせる設計ではない
- **Actual security enforcement は macOS Seatbelt sandbox が担当する**
- `yolo` では必ず明示承認を要求する (regex に関係なく)
- Approval regex は security boundary ではなく UX/consent layer である

## Workspace Root Validation

**Fail-closed on unsafe workspace roots:**

- `/` as workspace root → REFUSED (all modes)
- `$HOME` (user home directory) as workspace root → REFUSED (all modes)
- `/Users` as workspace root → REFUSED (all modes)
- `/Users/<username>` as workspace root → REFUSED (all modes)
- This validation applies to both `read_only` and `workspace_write` modes
- `validatePolicy()` also validates workspaceRoots for these unsafe paths
- Warning-only continuation is NOT allowed — unsafe root means sandbox stays disabled

## Key Security Properties

1. **Fail-closed**: sandbox-exec 利用不可時はコマンド実行を拒否。silent fallback しない。
2. **Fail-closed on unsafe root**: `/`, `$HOME`, `/Users` を workspace root にすると sandbox 無効化＋コマンド拒否。
3. **Environment secrets**: 子プロセスには allowlist 方式で環境変数を渡す。`OPENAI_API_KEY`, `GITHUB_TOKEN`, `AWS_*`, `ANTHROPIC_*`, `NPM_TOKEN`, `SSH_AUTH_SOCK`, `NODE_AUTH_TOKEN` などは渡さない。
4. **PATH 固定**: 子プロセスの PATH は `/usr/bin:/bin:/usr/sbin:/sbin` に固定。Homebrew 系パスは `allowHomebrewPaths=true` のみ追加。
5. **Process group kill**: timeout/abort 時には process group 全体を SIGTERM → SIGKILL する。background process も終了。Normal close 時も safety net として SIGKILL を送る。
6. **Per-run isolated temp**: command ごとに専用 temp dir を作成・終了後に削除。system TMPDIR は広く許可しない。
7. **Per-run isolated HOME**: `$HOME` は workspace/cwd にしない。per-run temp 配下の isolated directory に設定。startup file injection を防止。
8. **No bash startup files**: `/bin/bash --noprofile --norc -c` で実行。`.bash_profile`, `.profile` 等は読み込まれない。
9. **yolo は明示承認が必要**: CLI option, session_start, tool execution のいずれでも承認が必要。
10. **Workspace root validation**: `/`, `$HOME`, `/Users` などを workspace root にできない。fail-closed。
11. **Writable root validation**: writableRoots は workspaceRoots 配下のみ。realpath で symlink を解決。
12. **/usr 細分化**: `/usr` 全体ではなく `/usr/bin`, `/usr/sbin`, `/usr/lib`, `/usr/libexec`, `/usr/share` のみ許可。`/usr/local` は `allowHomebrewPaths=true` のみ。
13. **.git pointer 対応**: `.git` が file (pointer file) の場合、gitdir を解決して write deny rule を追加。
14. **Combined output limit**: `maxOutputBytes` は stdout + stderr の合計で制限。個別に 2 倍保持できない。
15. **Shell string API**: `runSandboxedShellMac(command: string, ...)` で shell string runner であることを型と名前で明示。
16. **LLM output truncation**: sandbox tool results は `truncateForLlm()` で最大 50KB / 2000 行に短縮される。長いコマンド出力が LLM context を肥大化させない。Error message も同様に短縮される。

## Recommended Safe Defaults

```bash
# Default: workspace_write (safe for most development)
pi -e ./sandbox

# Most restrictive: read-only
pi -e ./sandbox --sandbox-mode read_only

# yolo requires explicit opt-in (NOT the default)
pi -e ./sandbox --sandbox-mode yolo

# If you need Homebrew tools (node, python, etc.)
# Set allowHomebrewPaths in policy or extension config
```

## Startup Hard Block

If sandbox initialization fails, a `startupBlockedReason` is set that prevents
**all** bash execution (both sandboxed bash tool and direct `user_bash` hook).
Only `--no-sandbox` (explicit opt-out) bypasses this hard block.

### Blocked scenarios

| Scenario | Blocks yolo? | Reason |
|----------|-------------|--------|
| Unsafe workspace root (`/`, `$HOME`, `/Users`, `/Users/<username>`) | **Yes** | Cannot enforce write boundaries on unsafe root. |
| `sandbox-exec` unavailable + non-yolo mode | **No** | If effective mode is `yolo`, sandbox enforcement is not needed. |

### Order of checks in session_start

1. `--no-sandbox` → early return, explicitly disabled
2. `--sandbox-mode` flag parsing
3. `validateWorkspaceRoot()` → hard block if unsafe (**before** yolo approval)
4. `resolveRealPaths()` → resolve workspace paths
5. Yolo approval prompt (only if `effectiveMode() === "yolo"`)
6. `sandbox-exec` availability check → hard block if unavailable and non-yolo

This ordering ensures yolo approval is never requested for an unsafe workspace root.

## Relationship with plan-mode

`plan-mode` 拡張は plan mode 入場時に `mekann:sandbox:push-profile` イベントを発行し、sandbox の effective mode を `read_only` にオーバーライドする。plan mode 終了時に `mekann:sandbox:pop-profile` で元のモードに復元する。

重要事項:
- `read_only` モードの強制は **OS-level Seatbelt policy** による。plan-mode の command intent 正規表現に依存しない。
- plan-mode の `classifyCommandIntent()` は UX フィルタであり、security boundary ではない。
- sandbox が未導入または `--no-sandbox` の場合、plan-mode は単独で command intent 分類による保守的なガードを提供する。
- plan override 中に `/sandbox yolo` しても、effective mode は `read_only` のまま。plan 終了後に base mode へ戻る。

## Known Limitations

1. **Bash tool only**: sandbox が及ぶのは bash tool のみ。file edit tool, patch tool, MCP tool, extension tool は sandbox 外。
2. **Not agent-wide**: この sandbox は Pi coding agent 全体を sandbox 化するものではない。bash tool のみを対象とする。
3. **mach-lookup は無制限**: DNS 解決、IPC などのために許可。個別サービス制限は将来課題。
4. **sysctl-read は無制限**: カーネルステートのみでユーザーデータは含まないが、特定 sysctl への制限は将来課題。
5. **sandbox-exec は deprecated**: Apple は非推奨としているが、代替 public API がない。
6. **Apple bash 3.x のみ**: `/bin/bash` を使用。Bash 4+ の機能は利用不可。
7. **network は coarse-grained**: 全有効/全無効のみ。ホスト/ポート制限なし。
8. **fork 可能**: sandbox 内でプロセス fork は可能。ただし同じ sandbox profile の制約を受ける。
9. **Per-run temp cleanup の失敗**: cleanup に失敗してもエラーにせず warning 扱い。OS が最終的に削除。
10. **Pi tool registration order**: Pi extension の tool registration 順序に依存する。他の extension が同じ tool を上書きする可能性あり (未確認)。
11. **macOS Seatbelt の限界**: Seatbelt 自体の bypass 可能性は Apple の実装に依存する。この extension は Seatbelt の上に構築される defense-in-depth layer である。
12. **Unsupported OS では sandbox なし**: Linux/Windows では sandbox security は提供されない。コマンド実行は拒否される。
13. **localBash cwd**: unsandboxed execution (`--no-sandbox` / `yolo`) は `session_start` 時の `ctx.cwd` を使用。agent の CWD が変わった場合は session restart が必要。

## Future Hardening Issues

The following items are known security improvements that should be tracked as separate issues:

1. **mach-lookup allowlist**: 現在 `(allow mach-lookup)` で全ての system service への接続を許可している。DNS 解決に必要な service のみに制限するべき。特に `mach-lookup` は system service への接続面を広げるため、production 境界としては改善が必要。
2. **sysctl-read allowlist**: 現在 `(allow sysctl-read)` で全ての sysctl を許可している。CLI tool が必要とする specific sysctl のみに制限するべき。
3. **Seatbelt bypass monitoring**: macOS Seatbelt 自体の bypass 可能性について、Apple security update を追跡する仕組み。
4. **Per-process resource limits**: CPU / memory / file descriptor 数の制限。

## Test Coverage

Unit and integration tests covering:
- SBPL 生成の単体テスト (policy generation, /usr subpaths, Homebrew paths)
- 環境変数 allowlist (PATH 固定, secret 分離, SSH_AUTH_SOCK, NODE_AUTH_TOKEN)
- Policy 検証 (writableRoots, workspaceRoots unsafe path validation)
- .git pointer file 解決
- Approval フロー
- Unsafe workspace root 拒否 (read_only + workspace_write)
- Isolated HOME (workspace/cwd ではない)
- maxOutputBytes combined (stdout + stderr 合計)
- macOS 統合テスト:
  - read_only: 読み取り可、書き込み不可、/Users 不可、per-run temp 書き込み可
  - workspace_write: 書き込み可、.git/.codex/.agents 保護、symlink escape 防止、resolved gitdir 保護
  - network: false で通信不可
  - env: secret が子プロセスに渡らない
  - timeout / output cap
  - process group kill (background process も終了)
  - AbortSignal 伝播
  - bash startup files が読み込まれない (.bash_profile, .profile)
  - $HOME が isolated temp を指す
