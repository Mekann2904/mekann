/**
 * @abdd.meta
 * path: .pi/extensions/pi-ai-abort-fix.ts
 * role: pi-aiランタイム互換性パッチ適用モジュール
 * why: 実行中のpi本体が古い場合、pi-aiパッケージ内のJSファイルに対してabort stop reason変換処理を動的に追加するため
 * related: docs/patches/pi-ai-abort-fix.md, .pi/lib/error-utils.ts, package.json
 * public_api: default function
 * invariants: セッション開始時に1回だけ適用を試みる
 * side_effects: node_modules内のpi-ai配布JSファイルを直接書き換える
 * failure_modes: 置換対象コード（before文字列）が変更されている場合、パッチが適用されない
 * @abdd.explain
 * overview: pi-aiパッケージの配布JSファイルに対し、abort終了理由を変換するケース文を追加するパッチ処理を実装する。
 * what_it_does:
 *   - 複数のプロバイダ（Google, Anthropic, OpenAI）JSファイル内のswitch文にabortケースを追加する
 *   - ファイル読み込み、文字列置換、書き込みを実行し、既適用かどうかを判定する
 *   - require解決のベースパスを収集し、パッチ対象ファイルのパスを特定する
 * why_it_exists:
 *   - pi本体の更新を待たずに、古い環境でもabort機能を利用可能にするため
 *   - ユーザー環境のnode_modules directlyを修正することで、即座に動作を変化させるため
 * scope:
 *   in: なし（ファイルシステムとモジュール解決情報のみを使用）
 *   out: pi-aiパッケージ内のJSファイル変更、またはステータスログ
 */

/**
 * .pi/extensions/pi-ai-abort-fix.ts
 * pi-aiのstop reason変換にabort対応を追加するランタイム互換パッチ実装。
 * 原則は上流更新で解消するが、古いpi本体実行環境でのみ必要時に適用する。
 * 関連: docs/patches/pi-ai-abort-fix.md, .pi/lib/error-utils.ts, package.json
 */
/**
 * @abdd.meta
 * path: .pi/extensions/pi-ai-abort-fix.ts
 * role: pi-ai runtime compatibility patch
 * why: 実行中pi本体が古い場合にのみabort stop reason未対応を補正する
 * related: docs/patches/pi-ai-abort-fix.md
 * public_api: default function
 * invariants: セッション開始時に1回だけパッチ適用
 * side_effects: pi-aiパッケージの配布JSをテキスト置換
 * failure_modes: 置換対象コードが変更された場合は未適用のままになる
 */

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type PatchTarget = {
  modulePath: string;
  marker: string;
  before: string;
  after: string;
};

const PATCH_TARGETS: PatchTarget[] = [
  {
    modulePath: "@mariozechner/pi-ai/dist/providers/google-shared.js",
    marker: 'case "abort":',
    before: '        case FinishReason.NO_IMAGE:\n            return "error";',
    after:
      '        case FinishReason.NO_IMAGE:\n            return "error";\n        case "abort":\n            return "aborted";',
  },
  {
    modulePath: "@mariozechner/pi-ai/dist/providers/anthropic.js",
    marker: 'case "abort":',
    before: '        case "sensitive": // Content flagged by safety filters (not yet in SDK types)\n            return "error";',
    after:
      '        case "sensitive": // Content flagged by safety filters (not yet in SDK types)\n            return "error";\n        case "abort":\n            return "aborted";',
  },
  {
    modulePath: "@mariozechner/pi-ai/dist/providers/openai-completions.js",
    marker: 'case "abort":',
    before: '        case "content_filter":\n            return "error";',
    after: '        case "content_filter":\n            return "error";\n        case "abort":\n            return "aborted";',
  },
  {
    modulePath: "@mariozechner/pi-ai/dist/providers/openai-responses-shared.js",
    marker: 'case "abort":',
    before: '        case "failed":\n        case "cancelled":\n            return "error";',
    after:
      '        case "failed":\n        case "cancelled":\n            return "error";\n        case "abort":\n            return "aborted";',
  },
];

async function patchFile(requireFn: NodeRequire, target: PatchTarget): Promise<"patched" | "already" | "skip"> {
  let resolvedPath: string;
  try {
    resolvedPath = requireFn.resolve(target.modulePath);
  } catch {
    return "skip";
  }

  const source = await readFile(resolvedPath, "utf-8");
  if (source.includes(target.marker)) {
    return "already";
  }

  const patched = source.replace(target.before, target.after);
  if (patched === source) {
    return "skip";
  }

  await writeFile(resolvedPath, patched, "utf-8");
  return "patched";
}

async function patchResolvedFilePath(path: string, target: PatchTarget): Promise<"patched" | "already" | "skip"> {
  const source = await readFile(path, "utf-8");
  if (source.includes(target.marker)) {
    return "already";
  }
  const patched = source.replace(target.before, target.after);
  if (patched === source) {
    return "skip";
  }
  await writeFile(path, patched, "utf-8");
  return "patched";
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function safeCreateRequire(basePath: string): NodeRequire | undefined {
  try {
    return createRequire(basePath);
  } catch {
    return undefined;
  }
}

function collectResolverBases(requireFn: NodeRequire): string[] {
  const bases: string[] = [];
  bases.push(import.meta.url);
  bases.push(join(process.cwd(), "package.json"));

  const argv1 = String(process.argv?.[1] || "");
  if (argv1) {
    const argv1Dir = dirname(argv1);
    bases.push(join(argv1Dir, "package.json"));
    bases.push(join(argv1Dir, "..", "package.json"));
  }

  try {
    const codingAgentPkg = requireFn.resolve("@mariozechner/pi-coding-agent/package.json");
    const codingAgentDir = dirname(codingAgentPkg);
    bases.push(codingAgentPkg);
    bases.push(join(codingAgentDir, "..", "..", "package.json"));
    bases.push(join(codingAgentDir, "..", "package.json"));
  } catch {
    // ignore
  }

  try {
    const piAiPkg = requireFn.resolve("@mariozechner/pi-ai/package.json");
    const piAiDir = dirname(piAiPkg);
    bases.push(piAiPkg);
    bases.push(join(piAiDir, "..", "..", "package.json"));
    bases.push(join(piAiDir, "..", "package.json"));
  } catch {
    // ignore
  }

  return uniqueNonEmpty(
    bases.filter((candidate) => {
      if (candidate.startsWith("file:")) return true;
      return existsSync(candidate);
    }),
  );
}

function collectResolvers(requireFn: NodeRequire): NodeRequire[] {
  const resolvers: NodeRequire[] = [requireFn];
  for (const base of collectResolverBases(requireFn)) {
    const resolver = safeCreateRequire(base);
    if (resolver) resolvers.push(resolver);
  }
  return [...new Set(resolvers)];
}

async function listDirsSafe(path: string): Promise<string[]> {
  try {
    const entries = await (await import("node:fs/promises")).readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name));
  } catch {
    return [];
  }
}

async function collectDirectNodeModulesRoots(): Promise<string[]> {
  const roots = new Set<string>();

  const cwd = process.cwd();
  roots.add(cwd);
  if (process.argv?.[1]) {
    roots.add(dirname(process.argv[1]));
  }

  const home = homedir();
  roots.add(join(home, ".npm-global"));
  roots.add("/opt/homebrew/lib");
  roots.add("/usr/local/lib");

  // nvm install roots: ~/.config/nvm/versions/node/<ver>/lib
  const nvmVersionsDir = join(home, ".config", "nvm", "versions", "node");
  const versionDirs = await listDirsSafe(nvmVersionsDir);
  for (const versionDir of versionDirs) {
    roots.add(join(versionDir, "lib"));
  }

  return [...roots];
}

function resolveCandidatePiAiProviderPaths(root: string): string[] {
  const baseCandidates = [
    join(root, "node_modules", "@mariozechner", "pi-ai", "dist", "providers"),
    join(root, "node_modules", "@mariozechner", "pi-coding-agent", "node_modules", "@mariozechner", "pi-ai", "dist", "providers"),
  ];

  const files = ["google-shared.js", "anthropic.js", "openai-completions.js", "openai-responses-shared.js"];
  const paths: string[] = [];
  for (const dir of baseCandidates) {
    for (const file of files) {
      paths.push(join(dir, file));
    }
  }
  return paths;
}

export default function (pi: ExtensionAPI) {
  let initialized = false;

  pi.on("session_start", async (_event, ctx) => {
    if (initialized) return;
    initialized = true;

    const requireFn = createRequire(import.meta.url);
    const resolvers = collectResolvers(requireFn);
    const directRoots = await collectDirectNodeModulesRoots();
    const directPaths = uniqueNonEmpty(
      directRoots.flatMap((root) => resolveCandidatePiAiProviderPaths(root)).filter((path) => existsSync(path)),
    );
    let patchedCount = 0;
    let alreadyCount = 0;
    let skipCount = 0;

    for (const resolver of resolvers) {
      for (const target of PATCH_TARGETS) {
        try {
          const result = await patchFile(resolver, target);
          if (result === "patched") patchedCount++;
          else if (result === "already") alreadyCount++;
          else skipCount++;
        } catch {
          skipCount++;
        }
      }
    }

    const directTargetByName = new Map<string, PatchTarget>(
      PATCH_TARGETS.map((target) => [target.modulePath.split("/").pop() || "", target]),
    );
    for (const path of directPaths) {
      const name = path.split("/").pop() || "";
      const target = directTargetByName.get(name);
      if (!target) continue;
      try {
        const result = await patchResolvedFilePath(path, target);
        if (result === "patched") patchedCount++;
        else if (result === "already") alreadyCount++;
        else skipCount++;
      } catch {
        skipCount++;
      }
    }

    if (ctx?.hasUI && ctx?.ui) {
      ctx.ui.notify(
        `pi-ai-abort-fix: patched=${patchedCount}, already=${alreadyCount}, skip=${skipCount}, directPaths=${directPaths.length}`,
        patchedCount > 0 ? "warning" : "info",
      );
    }

    pi.events.emit("pi-ai-abort-fix:status", {
      patchedCount,
      alreadyCount,
      skipCount,
      resolverCount: resolvers.length,
      directPathsCount: directPaths.length,
    });
  });
}
