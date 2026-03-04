/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/theme.ts
 * @role テーマ設定APIルート
 * @why テーマ設定のHTTP API
 * @related services/theme-service.ts, schemas/theme.schema.ts
 * @public_api themeRoutes
 * @invariants なし
 * @side_effects ファイル読み書き
 * @failure_modes ファイルシステムエラー
 *
 * @abdd.explain
 * @overview テーマ設定のHTTPエンドポイント
 * @what_it_does GET/POST でテーマを取得・保存
 * @why_it_exists フロントエンドからのテーマ設定
 */

import { Hono } from "hono";
import { z } from "zod";
import { getThemeService } from "../services/theme-service.js";
import { ThemeIdSchema, ThemeModeSchema } from "../schemas/theme.schema.js";
import type { SuccessResponse } from "../schemas/common.schema.js";
import type { ThemeSettings } from "../schemas/theme.schema.js";

/**
 * テーマ更新スキーマ
 */
const UpdateThemeSchema = z.object({
  themeId: ThemeIdSchema.optional(),
  mode: ThemeModeSchema.optional(),
});

/**
 * テーマルート
 */
export const themeRoutes = new Hono();

/**
 * GET / - 現在のテーマ設定を取得
 */
themeRoutes.get("/", (c) => {
  const service = getThemeService();
  const theme = service.get();

  return c.json<SuccessResponse<ThemeSettings>>({
    success: true,
    data: theme,
  });
});

/**
 * POST / - テーマ設定を更新
 */
themeRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    console.log("[theme] Received body:", body);

    const parsed = UpdateThemeSchema.safeParse(body);

    if (!parsed.success) {
      // Zod v4 uses .issues instead of .errors
      const issues = parsed.error.issues || [];
      console.error("[theme] Validation error:", issues);
      return c.json(
        {
          success: false,
          error: "Invalid theme settings",
          details: issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')
        },
        400
      );
    }

    const service = getThemeService();
    const updated = service.set(parsed.data);

    return c.json<SuccessResponse<ThemeSettings>>({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("[theme] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to update theme", details: message }, 500);
  }
});
