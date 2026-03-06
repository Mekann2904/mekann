// path: tests/unit/extensions/web-ui-benchmark-route.test.ts
// what: Web UI benchmark route の HTTP 契約を検証する
// why: query parsing と service 呼び出しを安定化するため
// related: .pi/extensions/web-ui/src/routes/benchmark.ts, .pi/extensions/web-ui/src/services/benchmark-service.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const loadBenchmarkStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../../../.pi/extensions/web-ui/src/services/benchmark-service.js", () => ({
  loadBenchmarkStatus: loadBenchmarkStatusMock,
}));

import { benchmarkRoutes } from "../../../.pi/extensions/web-ui/src/routes/benchmark.js";

describe("web-ui benchmark route", () => {
  beforeEach(() => {
    loadBenchmarkStatusMock.mockReset();
    loadBenchmarkStatusMock.mockResolvedValue({
      cwd: "/repo/test",
      variants: [],
      recentRuns: [],
      bestVariant: null,
    });
  });

  it("cwd, limit, variantId を service に渡す", async () => {
    const response = await benchmarkRoutes.request(
      "http://localhost/?cwd=%2Frepo%2Ftest&limit=5&variantId=sonnet",
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(loadBenchmarkStatusMock).toHaveBeenCalledWith({
      cwd: "/repo/test",
      limit: 5,
      variantId: "sonnet",
    });
    expect(payload.success).toBe(true);
  });

  it("不正な query では 400 を返す", async () => {
    const response = await benchmarkRoutes.request("http://localhost/?limit=0");
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
  });
});
