/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/workpads.ts
 * @role workflow workpad API ルート
 * @why web-ui から agent-first workflow の durable progress を参照するため
 * @related ../../lib/workpad-reader.ts, ../server/app.ts, ../../lib/ul-workflow-reader.ts
 * @public_api workpadRoutes
 * @invariants read-only であり、workpad ファイルへ書き込まない
 * @side_effects なし
 * @failure_modes ファイルシステム読み取り失敗は 500 を返す
 */

import { Hono } from "hono";

import {
  findWorkpadsByTask,
  getAllWorkpads,
  getLatestWorkpad,
} from "../../lib/workpad-reader.js";

export const workpadRoutes = new Hono();

workpadRoutes.get("/", (c) => {
  try {
    const items = getAllWorkpads(process.cwd());
    return c.json({ success: true, data: items, total: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to load workpads", details: message }, 500);
  }
});

workpadRoutes.get("/latest", (c) => {
  try {
    const item = getLatestWorkpad(process.cwd());
    return c.json({ success: true, data: item });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to load latest workpad", details: message }, 500);
  }
});

workpadRoutes.get("/match", (c) => {
  try {
    const task = c.req.query("task") ?? "";
    const issueId = c.req.query("issueId") ?? undefined;
    const items = findWorkpadsByTask(process.cwd(), task, issueId);
    return c.json({ success: true, data: items, total: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to match workpads", details: message }, 500);
  }
});
