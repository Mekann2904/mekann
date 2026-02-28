# Detached Server Implementation

## Overview

Web UIサーバーをdetached子プロセスとして起動することで、piインスタンスの終了に依存せずにサーバーを継続動作させる。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ~/.pi-shared/                             │
│  ├── instances.json     (アクティブなpiインスタンス情報)      │
│  ├── web-ui-server.json (サーバーPIDとポート)                │
│  └── context-history-*.json (コンテキスト履歴)               │
└─────────────────────────────────────────────────────────────┘
         ↑                              ↑
         │ 登録/ハートビート            │ 読み取り
         │                              │
┌────────┴────────┐              ┌──────┴──────┐
│  pi instance 1  │              │  pi instance 2  │
│  (index.ts)     │              │  (index.ts)     │
└────────┬────────┘              └──────┬──────┘
         │ 起動                         │ 起動
         ↓                              ↓
┌─────────────────────────────────────────────────────────────┐
│           standalone-server.ts (detached process)           │
│  - HTTP server on port 3000                                 │
│  - 30秒ごとにインスタンス数をチェック                         │
│  - インスタンス0で自動終了                                   │
└─────────────────────────────────────────────────────────────┘
```

## Lifecycle

### Server Start
1. 最初のpiインスタンス起動 (`session_start`)
2. `ServerRegistry.isRunning()` で既存サーバーをチェック
3. なければ `startStandaloneServerProcess()` でdetached子プロセス起動
4. サーバーは `ServerRegistry.register()` で自身のPIDを登録

### Instance Registration
1. 各piインスタンスは `InstanceRegistry.register()` で自身を登録
2. 5秒間隔でハートビート更新
3. 60秒以上ハートビートがないと stale 扱いで削除

### Server Stop
1. piインスタンス終了時 (`session_shutdown`)
2. `InstanceRegistry.unregister()` で自身を削除
3. 1秒待機（他インスタンスのハートビートを待つ）
4. `InstanceRegistry.getCount()` で残りインスタンス数をチェック
5. 0なら `stopStandaloneServerProcess()` でSIGTERM送信

### Automatic Cleanup
- サーバー側でも30秒ごとにインスタンス数をチェック
- 安全策として、インスタンス0で自動終了

## Testing

```bash
# ターミナル1: piを起動
cd /path/to/project
pi

# ターミナル2: 別のpiを起動
cd /path/to/project
pi

# 確認: サーバーが動いている
curl http://localhost:3000/api/instances

# ターミナル1を終了 (Ctrl+D)
# → サーバーは生き残る（ターミナル2のpiがまだ動いているため）

# ターミナル2を終了 (Ctrl+D)
# → サーバーも終了（全インスタンスが終了したため）
```

## Files

| File | Purpose |
|------|---------|
| `standalone-server.ts` | Detached HTTP server |
| `index.ts` | Extension entry point |
| `lib/instance-registry.ts` | Shared storage management |
| `server.ts` | Legacy in-process server (still exists but unused) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_WEB_UI_PORT` | 3000 | Server port |
| `PI_WEB_UI_AUTO_START` | true | Auto-start on session start |
