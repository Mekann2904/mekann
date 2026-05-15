# Sandbox Extension

macOS Seatbelt (`sandbox-exec`) による bash ツール用コマンドサンドボックス化 Pi 拡張機能。

## スコープ

**このサンドボックスは bash ツールのみを対象とした多層防御レイヤーであり、エージェント全体のセキュリティ境界ではありません。**

- オーバーライドされた bash ツール経由で実行されるコマンドのみがサンドボックス化される
- ファイル編集、パッチ、MCP、拡張機能ツールはサンドボックス化されない
- 詳細は [SECURITY.md](./SECURITY.md) を参照

## 設計原則

- **多層防御**: macOS Seatbelt サンドボックスプロファイルにより、ファイルシステム・ネットワーク・プロセス操作を制限
- **フェイルクローズド**: `sandbox-exec` が利用不可の場合、コマンドは拒否される（サンドボックスなしでのサイレントフォールバックなし）
- **macOS Seatbelt / `sandbox-exec`**: `/usr/bin/sandbox-exec` に依存（絶対パス、PATH 検索なし）

## サンドボックスモード

| モード | 説明 |
|--------|------|
| `read_only` | Workspace は読み取り専用。workspace への書き込みは拒否。実行ごとに隔離された `$TMPDIR` のみ書き込み可能。workspace 外のユーザーデータの読み取りは拒否。 |
| `workspace_write` | Workspace への書き込みを許可。ただし `.git`, `.codex`, `.agents` ディレクトリは保護（書き込み拒否）。シンボリックリンクによる脱出をブロック。 |
| `yolo` | サンドボックスなし。CLI フラグ、`/sandbox-mode` コマンド、またはツール実行プロンプトでのユーザーの明示的な承認が必要。 |

## 主要なセキュリティプロパティ

- **環境変数の秘密情報**（API キー、トークン）は子プロセスに渡されない — 明示的な許可リストのみ
- **`$HOME` は実行ごとに隔離**。workspace/cwd には設定されない — スタートアップファイルの注入を防止
- **Bash スタートアップファイルは読み込まれない**: `/bin/bash --noprofile --norc -c`
- **`mach-lookup` / `sysctl-read`** は現在広めの許可 — 許可リストの強化は今後の課題（SECURITY.md の Future Hardening Issues を参照）
- **プロセスグループの kill**: タイムアウト・中止・出力上限超過時に SIGTERM → 猶予期間 → SIGKILL

## 使い方

```bash
# デフォルト: workspace_write モード
pi -e ./sandbox

# 読み取り専用モード
pi -e ./sandbox --sandbox-mode read_only

# サンドボックスを明示的に無効化（非推奨）
pi -e ./sandbox --no-sandbox

# サンドボックスの状態を表示
/sandbox

# 実行時にモードを変更
/sandbox-mode read_only
```

### LLM からの権限昇格リクエスト

サンドボックスがコマンドをブロックしたとき、LLM は `request_elevation` ツールを使って一時的な権限昇格をリクエストできます。ユーザーに確認ダイアログが表示されます:

1. LLM がブロックされたコマンドと理由を指定して `request_elevation` を呼び出す
2. 確認ダイアログが表示: 「このコマンドをサンドボックス外で実行しますか？」
3. 承認された場合 → コマンドがサンドボックス外で 1 回だけ実行される
4. 拒否された場合 → LLM に代替アプローチの提案が返される

サンドボックスの権限エラーメッセージにはヒントが付加され、LLM は自動的にこのツールの使用を検討します。

## テスト

```bash
cd sandbox

# 依存関係のインストール
npm ci

# 型チェック
npm run typecheck

# テスト実行（macOS の場合、sandbox-exec が利用可能なら統合テストも自動実行）
npm test

# macOS CI: 統合テストの成功を必須にする
RUN_MAC_SANDBOX_TESTS=1 npm test
```

## CI

`.github/workflows/sandbox-ci.yml` を参照:
- **ubuntu-latest**: typecheck + ユニットテスト（統合テストは自動的にスキップ）
- **macos-latest**: typecheck + `RUN_MAC_SANDBOX_TESTS=1` によるフルテスト

## ドキュメント

- [SECURITY.md](./SECURITY.md) — セキュリティモデル、スコープ、制限事項、既知の問題
