/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/experiments.ts
 * @role 実験イベントSSE連携API
 * @why autoresearch-e2eからの実験イベントをSSEでブロードキャスト
 * @related unified-server.ts, sse-bus.ts
 * @public_api experimentsRoutes
 * @invariants 実験イベントタイプはexperiment_*のみ
 * @side_effects SSEイベントのブロードキャスト
 * @failure_modes 無効なイベントタイプ
 *
 * @abdd.explain
 * @overview 実験イベントを受信してSSEでブロードキャストするAPI
 * @what_it_does autoresearchプロセスからのHTTP POSTでイベントを受信し、接続中のSSEクライアントにブロードキャスト
 * @why_it_exists プロセス分離されたautoresearch実験とWeb UIのリアルタイム連携を実現
 * @scope(in) 実験イベントJSON
 * @scope(out) SSEイベントブロードキャスト
 */

import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validator.js";
import { broadcastSSEEvent } from "../../unified-server.js";

/**
 * 実験イベントタイプ（SSEEventTypeと整合）
 */
const ExperimentEventTypeSchema = z.enum([
  "experiment_start",
  "experiment_baseline",
  "experiment_run",
  "experiment_improved",
  "experiment_regressed",
  "experiment_timeout",
  "experiment_crash",
  "experiment_stop",
]);

/**
 * 実験イベントペイロードスキーマ
 */
const ExperimentEventSchema = z.object({
  type: ExperimentEventTypeSchema,
  data: z.record(z.unknown()),
  timestamp: z.number().optional(),
});

/**
 * ルーター定義
 */
export const experimentsRoutes = new Hono();

/**
 * POST /experiments/events
 * 実験イベントを受信してSSEでブロードキャスト
 */
experimentsRoutes.post(
  "/events",
  validateBody(ExperimentEventSchema),
  (c) => {
    const event = c.get("validatedBody") as z.infer<typeof ExperimentEventSchema>;

    // SSEイベントとしてブロードキャスト
    broadcastSSEEvent({
      type: event.type,
      data: event.data,
      timestamp: event.timestamp ?? Date.now(),
    });

    return c.json({
      success: true,
      data: {
        broadcast: true,
        type: event.type,
        timestamp: event.timestamp ?? Date.now(),
      },
    });
  }
);

/**
 * GET /experiments/health
 * 実験APIのヘルスチェック
 */
experimentsRoutes.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      status: "ok",
      service: "experiments-api",
      timestamp: new Date().toISOString(),
    },
  });
});
