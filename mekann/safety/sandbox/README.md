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
| `yolo` | サンドボックスなし。デフォルト。実行時にユーザーの明示的な承認が必要。 |

## 主要なセキュリティプロパティ

- **環境変数の秘密情報**（API キー、トークン）は子プロセスに渡されない — 明示的な許可リストのみ
- **`$HOME` は実行ごとに隔離**。workspace/cwd には設定されない — スタートアップファイルの注入を防止
- **Bash スタートアップファイルは読み込まれない**: `/bin/bash --noprofile --norc -c`
- **`mach-lookup` / `sysctl-read`** は現在広めの許可 — 許可リストの強化は今後の課題（SECURITY.md の Future Hardening Issues を参照）
- **プロセスグループの kill**: タイムアウト・中止・出力上限超過時に SIGTERM → 猶予期間 → SIGKILL

## 使い方

```bash
# Default: yolo (サンドボックスなし)
pi -e ./sandbox

# 読み取り専用モードで起動
pi -e ./sandbox --sandbox-mode read_only

# サンドボックスなし（明示指定のみ）
pi -e ./sandbox --sandbox-mode yolo

# サンドボックスを明示的に無効化
pi -e ./sandbox --no-sandbox

# Homebrew バイナリ (node, python 等) を sandbox 内で利用可能にする
pi -e ./sandbox --sandbox-allow-homebrew-paths
```

## コマンド

### `/sandbox [mode]`

引数なしで現在のモードを表示。引数付きでモードを変更。Tab で補完。

```
/sandbox              → 現在のモードを表示
/sandbox read_only    → 読み取り専用モードに変更
/sandbox workspace_write  → workspace 書き込みモードに変更
/sandbox yolo         → サンドボックスなしモードに変更（承認必要）
```

### `--sandbox-allow-homebrew-paths`

Homebrew がインストールしたバイナリ（`node`, `python`, `npm` など）をサンドボックス内で利用可能にします。

- **デフォルト**: `false`（Homebrew パスは PATH に含まれず、Seatbelt ポリシーでも読み取り不可）
- **有効化時の影響**:
  - サンドボックスの `$PATH` に `/opt/homebrew/bin` と `/usr/local/bin` が追加される
  - Seatbelt ポリシーで `/opt/homebrew` と `/usr/local` 配下の読み取りが許可される
- **セキュリティ上の注意**: Homebrew 管理下のバイナリやスクリプトがサンドボックス内から実行可能になるため、信頼境界が広がります。Homebrew パッケージの供給連鎖攻撃 (supply chain attack) のリスクが増すことを理解した上で有効化してください。

```bash
# 例: sandbox 内で node を使う場合
pi -e ./sandbox --sandbox-mode workspace_write --sandbox-allow-homebrew-paths
```

### LLM からの権限昇格リクエスト

`read_only` または `workspace_write` モードでサンドボックスがコマンドをブロックしたとき、LLM は `request_elevation` ツールを使って一時的な権限昇格をリクエストできます:

1. LLM がブロックされたコマンドと理由を指定して `request_elevation` を呼び出す
2. 確認ダイアログが表示: 「このコマンドをサンドボックス外で実行しますか？」
3. 承認された場合 → コマンドがサンドボックス外で 1 回だけ実行される
4. 拒否された場合 → LLM に代替アプローチの提案が返される

**注意**: `yolo` モードではサンドボックスが無効なため、`request_elevation` は不要。LLM は直接 bash ツールを使用します。

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

## 拡張間連携 (plan-mode)

`plan-mode` 拡張が plan mode に入ると、`mekann:sandbox:push-profile` イベントを発行します。
sandbox 拡張はこれを受信し、effective mode を `read_only` にオーバーライドします。
plan mode が終了すると `mekann:sandbox:pop-profile` で元のモードに戻ります。

この連携により:
- `plan-mode` が UX レベルで `bash` ツールを表示し、command intent で早期ブロック
- `sandbox` が OS レベルで実際の read-only 強制
- どちらかが未導入でも単独で動作可能

詳細は `policy-core/` の共通定義を参照。
