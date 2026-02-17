---
title: Process Utils
category: reference
audience: developer
last_updated: 2026-02-18
tags: [process, shutdown, utilities]
related: []
---

# Process Utils

グレースフルシャットダウン処理用のプロセスユーティリティ。プロセス終了タイムアウト用の共有定数を提供する。

## 定数

### GRACEFUL_SHUTDOWN_DELAY_MS

プロセスを強制終了する前のグレースフルシャットダウン遅延。SIGTERM送信後、この時間待機してからSIGKILLを送信する。

```typescript
export const GRACEFUL_SHUTDOWN_DELAY_MS = 2000;
```

## 使用例

```typescript
import { GRACEFUL_SHUTDOWN_DELAY_MS } from "./process-utils.js";

// プロセス停止処理
process.kill(childPid, "SIGTERM");
setTimeout(() => {
  process.kill(childPid, "SIGKILL");
}, GRACEFUL_SHUTDOWN_DELAY_MS);
```
