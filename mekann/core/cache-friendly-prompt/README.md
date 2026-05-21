# cache-friendly-prompt

`cache-friendly-prompt` は最終的なプロンプトオーケストレーター拡張です。他の拡張からフラグメントを収集し、システムプロンプトに安定/半安定なコンテキストを前置し、動的コンテキストを末尾に配置します。また、`stablePrefixHash` と警告をログに記録します。キャッシュフレンドリさを向上させますが、プロバイダーのキャッシュヒットを保証するものではありません。

```text
拡張機能群 -> prompt-core レジストリ -> cache-friendly-prompt -> プロバイダー
```

## 自動レポート

`logRequests` が有効な場合、カレントディレクトリの `.pi-cache-friendly/` に以下を自動生成します。

| ファイル | 内容 |
|---|---|
| `requests.jsonl` | リクエストごとの stable prefix / total prompt / warning ログ |
| `summary.json` | 総リクエスト数、直近同一 hash 継続数、provider/model 別集計 |
| `trend.svg` | `stablePrefixChars` と `totalPromptChars` の推移グラフ |
| `efficiency.svg` | `stablePrefixChars / totalPromptChars` のキャッシュ効率グラフ |
| `report.md` | Zed などのエディタで開きやすい Markdown レポート |

`report.md` を開くと、安定プレフィックスが維持されているか、総プロンプト量がどのように増えているか、hash 変化や warning がいつ発生したかを確認できます。

### レポート内の主な用語

| 用語 | 説明 |
|---|---|
| stable prefix | provider に送るプロンプトの先頭に置かれる、変化しにくい部分 |
| stablePrefixHash | stable prefix の内容から計算した hash。同じ値が続くほど安定しています |
| stablePrefixChars | stable prefix の文字数 |
| totalPromptChars | provider に送られるプロンプト全体の文字数 |
| cache efficiency | `stablePrefixChars / totalPromptChars`。安定部分が全体に占める割合 |
| hash change | stablePrefixHash が前回から変わった地点 |
| warning | cache-friendly-prompt が検出した注意点 |

## 制限事項

- キャッシュヒットを保証するものではありません
- プロバイダーの TTL を把握しません
- `cache_control` を挿入しません
- キャッシュオブジェクトを管理しません
- トークン数は推定値です
- プライバシー保護のため、プロンプト全体はログに記録されません
- 安定プレフィックスのログ状態は、利用可能なセッション/ラン識別子（ベストエフォート）に基づき、次にカレントディレクトリ（cwd）をキーとして使用します。Pi が安定したラン ID を公開していない場合も、ログの紐付けはベストエフォートとなります。
