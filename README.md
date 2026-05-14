# pi extensions by mekann

Custom extensions for [pi](https://pi.dev) coding agent.

## Extensions

### [plan-mode](./plan-mode/)

Codex-inspired plan mode — 実装前に考えさせるための読み取り専用モード。

- `/plan` または `Cmd+P` で main ↔ plan をトグル
- Plan mode: read-only（`bash` は安全なコマンドのみ許可）
- 計画が `<proposed_plan>` で提示され、main に戻ると実行プロンプトとして注入
- 連続ブロックで段階的に警告を強化するエスカレーション機構
- `pi --plan` で plan mode から起動可能
- main / plan それぞれにモデルと thinking effort を設定・永続化可能

```bash
# Install — add to settings.json
{
  "extensions": ["/path/to/this/repo/plan-mode"]
}
```

See [plan-mode/README.md](./plan-mode/README.md) for full documentation.

### [sandbox](./sandbox/)

macOS Seatbelt-based defense-in-depth bash command sandbox for Pi's bash tool.

**Note: This sandboxes ONLY the bash tool, NOT the entire agent.**

- 3 段階の sandbox mode (read_only / workspace_write / danger_full_access)
- default deny: 必要な許可だけを明示的に付与
- `/Users` 全体は read path に含まれない（read_only / workspace_write）
- `.git` / `.codex` / `.agents` 配下は書き込み deny
- 環境変数は allowlist 方式（secret は子プロセスに渡さない）
- `danger_full_access` はユーザーの明示的承認が必要
- sandbox-exec は絶対パス固定（PATH 探索回避）
- Isolated HOME: `$HOME` は workspace ではなく per-run isolated temp に設定
- Bash startup files は読み込まれない (`--noprofile --norc`)
- Unsafe workspace root (`/`, `$HOME`, `/Users`) は fail-closed で拒否
- approval regex は UX layer であり security boundary ではない

See [sandbox/SECURITY.md](./sandbox/SECURITY.md) for full security documentation.

```bash
# Install — add to settings.json
{
  "extensions": ["/path/to/this/repo/sandbox"]
}
```
