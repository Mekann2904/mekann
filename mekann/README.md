# mekann

`mekann` は、pi coding agent 向けの複数の拡張機能を安定した順序で読み込む統合拡張です。

## スイート

| スイート | 機能 |
|---|---|
| core | `cache-friendly-prompt`, `agent-guidelines`, `prompt-core` |
| safety | `sandbox`, `plan-mode`, `policy-core` |
| autonomy | `goal`, `subagent`, `autoresearch` |
| utils | `zip-repo` |

## 読み込み順

`sandbox` は `plan-mode` より先に初期化されます。これにより、plan mode の読み取り専用プロファイル変更イベントを sandbox 側で一貫して扱えます。

## 使い方

`~/.pi/agent/settings.json` の `extensions` にこのディレクトリを追加します。

```json
{
  "extensions": ["/path/to/repo/mekann"]
}
```
