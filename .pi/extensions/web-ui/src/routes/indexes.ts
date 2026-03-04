/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/indexes.ts
 * @role インデックス管理APIルート
 * @why LocAgent, RepoGraph, Semanticの状態取得・再構築
 * @related services/index-service.ts, schemas/index.schema.ts
 * @public_api indexesRoutes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { SuccessResponse } from "../schemas/common.schema.js";

/**
 * 再構築リクエストスキーマ
 */
const RebuildSchema = z.object({
  force: z.boolean().default(false),
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
  const { readFile, stat } = await import("fs/promises");
  const { join } = await import("path");

  const indexPaths: Record<string, string> = {
    locagent: join(cwd, ".pi/search/locagent/index.json"),
    repograph: join(cwd, ".pi/search/repograph/index.json"),
    semantic: join(cwd, ".pi/search/semantic-index.jsonl"),
  };

  const indexPath = indexPaths[type];

  try {
    const stats = await stat(indexPath);
    const content = await readFile(indexPath, "utf-8");

    if (type === "locagent") {
      const data = JSON.parse(content);
      return {
        exists: true,
        nodeCount: data.metadata?.nodeCount ?? 0,
        edgeCount: data.metadata?.edgeCount ?? 0,
        fileCount: data.metadata?.fileCount ?? 0,
        indexedAt: data.metadata?.indexedAt,
        size: stats.size,
      };
    }

    if (type === "repograph") {
      const data = JSON.parse(content);
      return {
        exists: true,
        nodeCount: data.metadata?.nodeCount ?? 0,
        edgeCount: data.metadata?.edgeCount ?? 0,
        fileCount: data.metadata?.fileCount ?? 0,
        indexedAt: data.metadata?.indexedAt,
        size: stats.size,
      };
    }

    if (type === "semantic") {
      // JSONLファイルを行数カウント
      const lines = content.trim().split("\n").filter((l: string) => l.length > 0);
      return {
        exists: true,
        entityCount: lines.length,
        size: stats.size,
      };
    }
  } catch {
    return { exists: false };
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
  const cwd = process.cwd();

  const [locagent, repograph, semantic] = await Promise.all([
    getIndexStatus("locagent", cwd),
    getIndexStatus("repograph", cwd),
    getIndexStatus("semantic", cwd),
  ]);

  return c.json<SuccessResponse<{
    locagent: typeof locagent;
    repograph: typeof repograph;
    semantic: typeof semantic;
  }>>({
    success: true,
    data: { locagent, repograph, semantic },
  });
});

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
    const cwd = process.cwd();

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
    const cwd = process.cwd();

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
