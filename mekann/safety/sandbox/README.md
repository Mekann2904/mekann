# sandbox

`sandbox` は、`bash` tool の実行を制限する safety feature です。主に macOS Seatbelt などの OS-level policy を使います。

## 重要な境界

`sandbox` が守るのは `bash` tool の実行です。agent 全体を隔離するものではありません。

## Mode

| Mode | 意味 |
|---|---|
| `read_only` | 読み取り中心。書き込みや危険な実行を制限する |
| `workspace_write` | workspace への書き込みを許可し、それ以外を制限する |
| `yolo` | sandbox なし |

## 主な機能

- `/sandbox` command で mode 表示・変更
- blocked command に対する `request_elevation` flow
- default deny に近い allowlist policy
- secret を子プロセスに渡しにくくする environment handling
- isolated HOME / shell startup file 無効化

## plan-mode との関係

`plan-mode` は UX-level の read-only planning mode です。実際の command execution boundary は `sandbox` が担います。
