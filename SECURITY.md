# Security Policy

Mekann は Pi coding agent の tool 実行、subagent、context 管理、terminal integration に触れるため、安全境界に関する報告を重視します。

## Reporting a vulnerability

公開 issue に書くと悪用可能性がある内容は、GitHub の private vulnerability reporting を使って報告してください。使えない場合は maintainer に非公開で連絡し、再現手順、影響範囲、対象 commit、期待される安全境界を含めてください。

公開してよい bug、documentation gap、hardening 提案は通常の GitHub issue で構いません。

## Supported versions

現在サポート対象は `main` branch の最新状態です。`0.x` の間は過去 version への backport を保証しません。

## Security boundaries

- `sandbox` は `bash` tool の実行制御を対象にします。agent 全体、Node process 全体、terminal emulator 全体を隔離するものではありません。
- macOS Seatbelt integration は macOS 上でのみ完全な integration test を実行できます。
- approval UI は UX layer であり、hard security boundary ではありません。
- `subagent` が返す patch proposal は信頼済みではありません。scope、base hash、metadata、validation hint を確認してから扱います。
- Web/API を使う feature は外部サービスの認証、rate limit、利用規約の影響を受けます。

## Handling expectations

安全境界に関わる修正では、該当 feature README、[CONTEXT.md](./CONTEXT.md)、必要に応じた ADR、regression test を更新してください。
