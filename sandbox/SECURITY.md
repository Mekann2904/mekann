# Sandbox Extension

macOS Seatbelt (`sandbox-exec`) によるコマンドサンドボックス化 extension。

## Platform Dependency

- **macOS only**: macOS Seatbelt / `sandbox-exec` に依存する。
- **Unsupported OS**: Linux/Windows では sandbox security は提供されない。
- **Fail-closed**: sandbox-exec が利用不可の場合、`read_only` / `workspace_write` モードでのコマンド実行は **拒否される**。silent fallback はしない。
- 実行するには `--no-sandbox` で明示的に sandbox を無効にするか、承認済み `danger_full_access` モードにする必要がある。

## Scope

**This extension sandboxes ONLY the bash tool.**

The following are NOT sandboxed:
- File edit tool
- Patch tool
- MCP tools
- Extension tools
- Other plugins' tool registrations
- `localBash` when `--no-sandbox` or approved `danger_full_access`

Sandbox active 時は `user_bash` イベントもブロックされる。
すべてのコマンドは sandboxed bash tool を経由しなければならない。

## Sandbox Modes

| Mode | Workspace 読み取り | Workspace 書き込み | Isolated Temp 書き込み | Network |
|------|----------|----------|-----------|---------|
| `read_only` | ✓ | ✗ | ✓ (per-run isolated) | ✗ |
| `workspace_write` | ✓ | ✓ (.git/.codex/.agents 除く) | ✓ (per-run isolated) | opt-in |
| `danger_full_access` | 制限なし | 制限なし | N/A | 制限なし |

### read_only の正確な意味

- **Workspace は read-only**: workspace roots 配下のファイルは読めるが書けない
- **Isolated temp は writable**: command ごとに作成される専用 temp directory (`$TMPDIR`) へのみ書き込み可能
  - これは workspace 外に作成される独立した directory である
  - command 終了後に自動削除される
  - system TMPDIR 全体への広い許可ではない
- **System paths は読める**: `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin`, `/usr/lib`, `/usr/libexec`, `/usr/share`, `/System`, `/etc`, `/dev`
- **/Users は読めない**: `/Users` 全体は read path に含まれない

### workspace_write の正確な意味

- Workspace 内への書き込みを許可
- ただし repo metadata は保護: `.git`, `.codex`, `.agents` 配下への書き込みは deny
- `.git` が pointer file の場合、resolved gitdir への書き込みも deny
- symlink 経由で workspace 外に書き込むことはできない (Seatbelt が canonical path を評価)

### network=false の正確な意味と限界

- `network=false` は SBPL で `(deny default)` の下で network rule を追加しないことで実現
- Seatbelt は coarse-grained な network 制御のみ: 全ての outbound/inbound を block
- 個別ホストやポートの制限はしない
- DNS 解決に必要な `mach-lookup` は許可されているため、DNS クエリ自体は出る可能性があるが、TCP/UDP 接続は block される

## Approval System

**The approval layer is a UX convenience, NOT a security boundary.**

- 危険コマンド検出 regex は簡単に bypass 可能である
- これは user confirmation friction を追加するためだけのもの
- regex に過度な安全性を持たせる設計ではない
- **Actual security enforcement は Seatbelt sandbox が担当する**
- `danger_full_access` では必ず明示承認を要求する (regex に関係なく)

## Key Security Properties

1. **Fail-closed**: sandbox-exec 利用不可時はコマンド実行を拒否。silent fallback しない。
2. **Environment secrets**: 子プロセスには allowlist 方式で環境変数を渡す。`OPENAI_API_KEY`, `GITHUB_TOKEN`, `AWS_*`, `ANTHROPIC_*`, `NPM_TOKEN`, `SSH_AUTH_SOCK`, `NODE_AUTH_TOKEN` などは渡さない。
3. **PATH 固定**: 子プロセスの PATH は `/usr/bin:/bin:/usr/sbin:/sbin` に固定。Homebrew 系パスは `allowHomebrewPaths=true` のみ追加。
4. **Process group kill**: timeout/abort 時には process group 全体を SIGTERM → SIGKILL する。background process も終了。
5. **Per-run isolated temp**: command ごとに専用 temp dir を作成・終了後に削除。system TMPDIR は広く許可しない。
6. **danger_full_access は明示承認が必要**: CLI option, session_start, tool execution のいずれでも承認が必要。
7. **Workspace root validation**: `/`, `$HOME`, `/Users` などを workspace root にできない。
8. **Writable root validation**: writableRoots は workspaceRoots 配下のみ。realpath で symlink を解決。
9. **/usr 細分化**: `/usr` 全体ではなく `/usr/bin`, `/usr/sbin`, `/usr/lib`, `/usr/libexec`, `/usr/share` のみ許可。`/usr/local` は `allowHomebrewPaths=true` のみ。
10. **.git pointer 対応**: `.git` が file (pointer file) の場合、gitdir を解決して write deny rule を追加。

## Recommended Safe Defaults

```bash
# Default: workspace_write (safe for most development)
pi -e ./sandbox

# Most restrictive: read-only
pi -e ./sandbox --sandbox-mode read_only

# If you need Homebrew tools (node, python, etc.)
# Set allowHomebrewPaths in policy or extension config
```

## Known Limitations

1. **Bash tool only**: sandbox が及ぶのは bash tool のみ。他の tool は sandbox 外。
2. **mach-lookup は無制限**: DNS 解決、IPC などのために許可。個別サービス制限は将来課題。
3. **sysctl-read は無制限**: カーネルステートのみでユーザーデータは含まないが、特定 sysctl への制限は将来課題。
4. **sandbox-exec は deprecated**: Apple は非推奨としているが、代替 public API がない。
5. **Apple bash 3.x のみ**: `/bin/bash` を使用。Bash 4+ の機能は利用不可。
6. **network は coarse-grained**: 全有効/全無効のみ。ホスト/ポート制限なし。
7. **fork 可能**: sandbox 内でプロセス fork は可能。ただし同じ sandbox profile の制約を受ける。
8. **Per-run temp cleanup の失敗**: cleanup に失敗してもエラーにせず warning 扱い。OS が最終的に削除。
9. **Pi tool registration order**: Pi extension の tool registration 順序に依存する。他の extension が同じ tool を上書きする可能性あり (未確認)。

## Test Coverage

113 tests including:
- SBPL 生成の単体テスト (policy generation, /usr subpaths, Homebrew paths)
- 環境変数 allowlist (PATH 固定, secret 分離, SSH_AUTH_SOCK, NODE_AUTH_TOKEN)
- Policy 検証 (writableRoots, workspace root validation)
- .git pointer file 解決
- Approval フロー
- macOS 統合テスト:
  - read_only: 読み取り可、書き込み不可、/Users 不可、per-run temp 書き込み可
  - workspace_write: 書き込み可、.git/.codex/.agents 保護、symlink escape 防止、resolved gitdir 保護
  - network: false で通信不可
  - env: secret が子プロセスに渡らない
  - timeout / output cap
  - process group kill (background process も終了)
  - AbortSignal 伝播
