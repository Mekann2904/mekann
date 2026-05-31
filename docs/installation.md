# Installation

Mekann は Pi coding agent に読み込ませる extension suite です。root package の `pi.extensions` と `pi.skills` は `./mekann` と `./mekann/skills` を指します。

## Requirements

- Node.js `>=22.19.0`
- npm
- Pi coding agent
- macOS sandbox integration を使う場合は macOS
- Kitty split や image rendering を使う場合は Kitty と `kitten`

## Setup

```bash
git clone git@github.com:Mekann2904/mekann.git
cd mekann
nvm use
npm ci --workspaces --include-workspace-root
npm run typecheck:prod
```

`~/.pi/agent/settings.json` に extension path を追加します。

```json
{
  "extensions": ["/path/to/mekann/mekann"]
}
```

既存の extension がある場合は配列に追加してください。

```json
{
  "extensions": [
    "/path/to/other-extension",
    "/path/to/mekann/mekann"
  ]
}
```

Pi を再起動すると Mekann が読み込まれます。

## First checks

Pi の session で次を確認します。

- `/sandbox`: bash sandbox mode を表示できる。
- `/dashboard`: dashboard feature が有効なら dashboard を開ける。
- `/goal`: goal feature が有効なら goal status を表示できる。
- `/mekann-settings`: settings editor を開ける。

問題が出た場合は [Configuration](./configuration.md) と該当 feature README を確認してください。

## Development install

開発中は repository checkout をそのまま `extensions` に指定します。変更後に再起動が必要な feature と不要な feature は設定 schema の `restartRequired` に従います。

```bash
npm run typecheck
npm test
```
