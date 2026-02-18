#!/bin/bash
# グローバルにインストールされたpi-coding-agentのロックファイル問題を修正
# 複数プロセス同時使用時のデッドロックを防ぐため、ロック取得失敗時は警告して続行

set -e

PI_AGENT_DIR="$(npm root -g)/@mariozechner/pi-coding-agent/dist/core"

if [ ! -d "$PI_AGENT_DIR" ]; then
    echo "pi-coding-agent not found in global npm packages"
    exit 0
fi

# settings-manager.jsを修正
SETTINGS_FILE="$PI_AGENT_DIR/settings-manager.js"
if grep -q "ELOCKED" "$SETTINGS_FILE" 2>/dev/null; then
    echo "settings-manager.js already patched"
else
    # withLock関数を修正：ロック失敗時は警告して続行
    # Node.jsのsedでマルチライン置換は複雑なので、Node.jsスクリプトを使用
    node -e "
const fs = require('fs');
const content = fs.readFileSync('$SETTINGS_FILE', 'utf-8');

const oldWithLock = \`withLock(scope, fn) {
        const path = scope === \"global\" ? this.globalSettingsPath : this.projectSettingsPath;
        const dir = dirname(path);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        let release;
        try {
            release = lockfile.lockSync(path, { realpath: false });
            const current = existsSync(path) ? readFileSync(path, \"utf-8\") : undefined;
            const next = fn(current);
            if (next !== undefined) {
                writeFileSync(path, next, \"utf-8\");
            }
        }
        finally {
            if (release) {
                release();
            }
        }
    }\`;

const newWithLock = \`withLock(scope, fn) {
        const path = scope === \"global\" ? this.globalSettingsPath : this.projectSettingsPath;
        const dir = dirname(path);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        let release;
        let locked = false;
        try {
            release = lockfile.lockSync(path, { realpath: false, stale: 5000 });
            locked = true;
        }
        catch (e) {
            if (e.code === 'ELOCKED') {
                console.error(\\\`Warning (\\\${scope}): Settings file locked by another process, proceeding without lock\\\`);
            }
            else {
                throw e;
            }
        }
        try {
            const current = existsSync(path) ? readFileSync(path, \"utf-8\") : undefined;
            const next = fn(current);
            if (next !== undefined) {
                writeFileSync(path, next, \"utf-8\");
            }
        }
        finally {
            if (release && locked) {
                release();
            }
        }
    }\`;

const newContent = content.replace(oldWithLock, newWithLock);
fs.writeFileSync('$SETTINGS_FILE', newContent);
console.log('Patched settings-manager.js');
"
fi

# auth-storage.jsを修正
AUTH_FILE="$PI_AGENT_DIR/auth-storage.js"
if grep -q "ELOCKED" "$AUTH_FILE" 2>/dev/null; then
    echo "auth-storage.js already patched"
else
    node -e "
const fs = require('fs');
const content = fs.readFileSync('$AUTH_FILE', 'utf-8');

const oldWithLock = \`withLock(fn) {
        this.ensureParentDir();
        this.ensureFileExists();
        let release;
        try {
            release = lockfile.lockSync(this.authPath, { realpath: false });
            const current = existsSync(this.authPath) ? readFileSync(this.authPath, \"utf-8\") : undefined;
            const { result, next } = fn(current);
            if (next !== undefined) {
                writeFileSync(this.authPath, next, \"utf-8\");
                chmodSync(this.authPath, 0o600);
            }
            return result;
        }
        finally {
            if (release) {
                release();
            }
        }
    }\`;

const newWithLock = \`withLock(fn) {
        this.ensureParentDir();
        this.ensureFileExists();
        let release;
        let locked = false;
        try {
            release = lockfile.lockSync(this.authPath, { realpath: false, stale: 5000 });
            locked = true;
        }
        catch (e) {
            if (e.code === 'ELOCKED') {
                console.error('Warning (auth): Auth file locked by another process, proceeding without lock');
            }
            else {
                throw e;
            }
        }
        try {
            const current = existsSync(this.authPath) ? readFileSync(this.authPath, \"utf-8\") : undefined;
            const { result, next } = fn(current);
            if (next !== undefined) {
                writeFileSync(this.authPath, next, \"utf-8\");
                chmodSync(this.authPath, 0o600);
            }
            return result;
        }
        finally {
            if (release && locked) {
                release();
            }
        }
    }\`;

const newContent = content.replace(oldWithLock, newWithLock);
fs.writeFileSync('$AUTH_FILE', newContent);
console.log('Patched auth-storage.js');
"
fi

echo "Global pi-coding-agent lock patch applied successfully"
