/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/indexes.ts
 * @role インデックス管理APIルート
 * @why LocAgent, RepoGraph, Semanticの状態取得・再構築・設定管理
 * @related services/index-settings-service.ts, schemas/index.schema.ts
 * @public_api indexesRoutes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { join } from "node:path";
import type { SuccessResponse } from "../schemas/common.schema.js";
import { getInstanceService } from "../services/instance-service.js";
import { SHARED_DIR } from "../lib/storage.js";
import {
  loadIndexSettings,
  updateIndexEnabled,
  type IndexSettings,
} from "../services/index-settings-service.js";
import {
  readJsonState,
} from "../../../../lib/storage/sqlite-state-store.js";
import {
  readStrictJsonState,
  deleteStrictJsonState,
} from "../../../../lib/storage/sqlite-state-store-strict.js";

interface GraphLikeIndex {
  nodes?: unknown[] | [string, unknown][];
  edges?: unknown[];
  metadata?: {
    nodeCount?: number;
    edgeCount?: number;
    fileCount?: number;
    indexedAt?: number;
  };
}

interface SemanticMeta {
  totalEmbeddings?: number;
  totalFiles?: number;
  updatedAt?: number;
}

function getLocAgentStateKey(cwd: string): string {
  return `locagent:index:${cwd}`;
}

function getRepoGraphStateKey(cwd: string): string {
  return `repograph:index:${cwd}`;
}

function getSemanticIndexStateKey(cwd: string): string {
  return `semantic_code_index:${cwd}`;
}

function getSemanticMetaStateKey(cwd: string): string {
  return `semantic_code_meta:${cwd}`;
}

/**
 * インデックス対象の作業ディレクトリを解決
 */
function resolveIndexesCwd(): string {
  const instances = getInstanceService().list();
  if (instances.length > 0) {
    // web-ui から見えている最新のアクティブインスタンスを優先する
    const latest = [...instances].sort((a, b) => b.lastHeartbeat - a.lastHeartbeat)[0];
    return latest.cwd || process.cwd();
  }

  // アクティブな instance が無い場合でも、最後に登録されていた cwd を使う
  const knownInstances = readJsonState<Record<number, { cwd?: string; lastHeartbeat?: number }>>({
    stateKey: "webui_instances",
    fallbackPath: join(SHARED_DIR, "instances.json"),
    createDefault: () => ({}),
  });
  const persisted = Object.values(knownInstances).sort(
    (a, b) => (b.lastHeartbeat || 0) - (a.lastHeartbeat || 0)
  )[0];

  return persisted?.cwd || process.cwd();
}

/**
 * 再構築リクエストスキーマ
 */
const RebuildSchema = z.object({
  force: z.boolean().default(false),
});

/**
 * 有効/無効更新スキーマ
 */
const EnabledSchema = z.object({
  enabled: z.boolean(),
});

/**
 * インデックス状態を取得
 */
async function getIndexStatus(
  type: "locagent" | "repograph" | "semantic",
  cwd: string
): Promise<{
  exists: boolean;
  nodeCount?: number;
  edgeCount?: number;
  fileCount?: number;
  entityCount?: number;
  indexedAt?: number;
  size?: number;
  error?: string;
}> {
  try {
    if (type === "locagent") {
      const data = readStrictJsonState<GraphLikeIndex>(getLocAgentStateKey(cwd));
      if (!data) return { exists: false };

      const payload = JSON.stringify(data);
      const nodeCount = data.metadata?.nodeCount ?? (data.nodes?.length ?? 0);
      const edgeCount = data.metadata?.edgeCount ?? (data.edges?.length ?? 0);
      const fileCount = data.metadata?.fileCount;

      return {
        exists: true,
        nodeCount,
        edgeCount,
        fileCount,
        indexedAt: data.metadata?.indexedAt,
        size: Buffer.byteLength(payload, "utf-8"),
      };
    }

    if (type === "repograph") {
      const data = readStrictJsonState<GraphLikeIndex>(getRepoGraphStateKey(cwd));
      if (!data) return { exists: false };

      const payload = JSON.stringify(data);
      const nodeCount = data.metadata?.nodeCount ?? (data.nodes?.length ?? 0);
      const edgeCount = data.metadata?.edgeCount ?? (data.edges?.length ?? 0);
      const fileCount = data.metadata?.fileCount;

      return {
        exists: true,
        nodeCount,
        edgeCount,
        fileCount,
        indexedAt: data.metadata?.indexedAt,
        size: Buffer.byteLength(payload, "utf-8"),
      };
    }

    if (type === "semantic") {
      const embeddings = readStrictJsonState<unknown[]>(getSemanticIndexStateKey(cwd));
      if (!embeddings) return { exists: false };
      const metadata = readStrictJsonState<SemanticMeta>(getSemanticMetaStateKey(cwd));
      const payload = JSON.stringify(embeddings);

      return {
        exists: true,
        entityCount: metadata?.totalEmbeddings ?? embeddings.length,
        fileCount: metadata?.totalFiles,
        indexedAt: metadata?.updatedAt,
        size: Buffer.byteLength(payload, "utf-8"),
      };
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { exists: false, error };
  }

  return { exists: false };
}

/**
 * インデックスを再構築
 */
async function rebuildIndex(
  type: "locagent" | "repograph" | "semantic",
  force: boolean,
  cwd: string
): Promise<{ success: boolean; error?: string; stats?: Record<string, unknown> }> {
  try {
    if (type === "locagent") {
      const { locagentIndex } = await import("../../../search/tools/locagent_index.js");
      const result = await locagentIndex({ force }, cwd);
      return {
        success: result.success,
        error: result.error,
        stats: {
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
          fileCount: result.fileCount,
        },
      };
    }

    if (type === "repograph") {
      const { repographIndex } = await import("../../../search/tools/repograph_index.js");
      const result = await repographIndex({ force }, cwd);
      return {
        success: result.success,
        error: result.error,
        stats: {
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
          fileCount: result.fileCount,
        },
      };
    }

    if (type === "semantic") {
      const { semanticIndex } = await import("../../../search/tools/semantic_index.js");
      const result = await semanticIndex({ path: cwd, force }, cwd);
      return {
        success: !result.error,
        error: result.error,
        stats: {
          indexed: result.indexed,
          files: result.files,
        },
      };
    }

    return { success: false, error: "Unknown index type" };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * インデックスルート
 */
export const indexesRoutes = new Hono();

/**
 * GET /api/indexes - 全インデックス状態
 */
indexesRoutes.get("/", async (c) => {
  const cwd = resolveIndexesCwd();

  const [locagent, repograph, semantic, settings] = await Promise.all([
    getIndexStatus("locagent", cwd),
    getIndexStatus("repograph", cwd),
    getIndexStatus("semantic", cwd),
    loadIndexSettings(cwd),
  ]);

  // 各インデックスの状態にenabledを追加
  const data = {
    locagent: { ...locagent, enabled: settings.locagent },
    repograph: { ...repograph, enabled: settings.repograph },
    semantic: { ...semantic, enabled: settings.semantic },
  };

  return c.json<SuccessResponse<typeof data>>({
    success: true,
    data,
  });
});

/**
 * PATCH /api/indexes/:type/enabled - インデックスの有効/無効を設定
 * 注: インデックス自体は削除されず、設定のみ更新される
 */
indexesRoutes.patch(
  "/:type/enabled",
  zValidator(
    "param",
    z.object({ type: z.enum(["locagent", "repograph", "semantic"]) })
  ),
  zValidator("json", EnabledSchema),
  async (c) => {
    const { type } = c.req.valid("param");
    const { enabled } = c.req.valid("json");
    const cwd = resolveIndexesCwd();

    const settings = await updateIndexEnabled(cwd, type, enabled);

    return c.json<SuccessResponse<{ type: typeof type; enabled: boolean; settings: IndexSettings }>>({
      success: true,
      data: { type, enabled, settings },
    });
  }
);

/**
 * GET /api/indexes/:type - 特定インデックス状態
 */
indexesRoutes.get(
  "/:type",
  zValidator(
    "param",
    z.object({ type: z.enum(["locagent", "repograph", "semantic"]) })
  ),
  async (c) => {
    const { type } = c.req.valid("param");
    const cwd = resolveIndexesCwd();

    const status = await getIndexStatus(type, cwd);

    return c.json<SuccessResponse<typeof status>>({
      success: true,
      data: status,
    });
  }
);

/**
 * POST /api/indexes/:type/rebuild - インデックス再構築
 */
indexesRoutes.post(
  "/:type/rebuild",
  zValidator(
    "param",
    z.object({ type: z.enum(["locagent", "repograph", "semantic"]) })
  ),
  zValidator("json", RebuildSchema),
  async (c) => {
    const { type } = c.req.valid("param");
    const { force } = c.req.valid("json");
    const cwd = resolveIndexesCwd();

    const result = await rebuildIndex(type, force, cwd);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        500
      );
    }

    return c.json<SuccessResponse<typeof result>>({
      success: true,
      data: result,
    });
  }
);

/**
 * DELETE /api/indexes/:type - インデックス削除
 */
indexesRoutes.delete(
  "/:type",
  zValidator(
    "param",
    z.object({ type: z.enum(["locagent", "repograph", "semantic"]) })
  ),
  async (c) => {
    const { type } = c.req.valid("param");
    const cwd = resolveIndexesCwd();

    try {
      if (type === "locagent") {
        deleteStrictJsonState(getLocAgentStateKey(cwd));
      } else if (type === "repograph") {
        deleteStrictJsonState(getRepoGraphStateKey(cwd));
      } else {
        deleteStrictJsonState(getSemanticIndexStateKey(cwd));
        deleteStrictJsonState(getSemanticMetaStateKey(cwd));
      }

      return c.json<SuccessResponse<{ deleted: true }>>({
        success: true,
        data: { deleted: true },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return c.json(
        {
          success: false,
          error: `インデックスの削除に失敗: ${error}`,
        },
        500
      );
    }
  }
);
