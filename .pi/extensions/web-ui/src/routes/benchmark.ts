/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/benchmark.ts
 * @role agent benchmark API ルート
 * @why Web UI から loop/subagent の比較結果を取得するため
 * @related services/benchmark-service.ts, schemas/benchmark.schema.ts, server/app.ts
 * @public_api benchmarkRoutes
 */

import { Hono } from "hono";
import { z } from "zod";
import type { SuccessResponse } from "../schemas/common.schema.js";
import type { BenchmarkStatusDto } from "../schemas/benchmark.schema.js";
import { loadBenchmarkStatus } from "../services/benchmark-service.js";

const BenchmarkQuerySchema = z.object({
  cwd: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  variantId: z.string().optional(),
});

export const benchmarkRoutes = new Hono();

benchmarkRoutes.get("/", async (c) => {
  try {
    const query = BenchmarkQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ success: false, error: "Invalid query", details: query.error.message }, 400);
    }

    const data = await loadBenchmarkStatus({
      cwd: query.data.cwd,
      limit: query.data.limit,
      variantId: query.data.variantId,
    });

    return c.json<SuccessResponse<BenchmarkStatusDto>>({
      success: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get benchmark status", details: message }, 500);
  }
});
