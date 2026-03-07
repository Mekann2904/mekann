// Path: .pi/extensions/web-ui/types/ambient.d.ts
// What: web-ui の型検査で不足している外部モジュール宣言を補う
// Why: root tsconfig-check から web-ui を検査する際に express と JS モジュールの型欠落を埋めるため
// Related: .pi/extensions/web-ui/tsconfig.json, .pi/extensions/web-ui/src/routes/analytics.ts, tsconfig-check.json, .pi/extensions/web-ui/src/server/index.ts

declare module "express" {
  export interface SocketLike {
    on(event: string, handler: (...args: unknown[]) => void): void;
  }

  export interface Request {
    [key: string]: unknown;
    path: string;
    params: Record<string, string | undefined>;
    query: Record<string, string | string[] | undefined>;
    body: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    socket: SocketLike;
    on(event: string, handler: (...args: unknown[]) => void): void;
  }

  export interface Response {
    [key: string]: unknown;
    write(chunk: unknown): boolean;
    end(chunk?: unknown): void;
    json(body: unknown): Response;
    status(code: number): Response;
    setHeader(name: string, value: string): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
  }

  export interface NextFunction {
    (error?: unknown): void;
  }

  export interface Express {
    get(path: string, ...handlers: Array<(req: Request, res: Response, next?: NextFunction) => unknown>): void;
    post(path: string, ...handlers: Array<(req: Request, res: Response, next?: NextFunction) => unknown>): void;
    put(path: string, ...handlers: Array<(req: Request, res: Response, next?: NextFunction) => unknown>): void;
    patch(path: string, ...handlers: Array<(req: Request, res: Response, next?: NextFunction) => unknown>): void;
    delete(path: string, ...handlers: Array<(req: Request, res: Response, next?: NextFunction) => unknown>): void;
    use(...handlers: Array<(req: Request, res: Response, next?: NextFunction) => unknown>): void;
  }
}

declare module "../../lib/analytics/behavior-storage.js" {
  export const behaviorStorage: unknown;
  export const getBehaviorStorage: (...args: unknown[]) => unknown;
}

declare module "../../lib/analytics/aggregator.js" {
  export const aggregateBehaviorMetrics: (...args: unknown[]) => unknown;
}

declare module "../../lib/analytics/efficiency-analyzer.js" {
  export const analyzeEfficiency: (...args: unknown[]) => unknown;
}

declare module "../../lib/analytics/anomaly-detector.js" {
  export const detectAnomalies: (...args: unknown[]) => unknown;
}

declare module ".pi/extensions/web-ui/lib/analytics/behavior-storage.js" {
  export const behaviorStorage: unknown;
  export const getBehaviorStorage: (...args: unknown[]) => unknown;
}

declare module ".pi/extensions/web-ui/lib/analytics/aggregator.js" {
  export const aggregateBehaviorMetrics: (...args: unknown[]) => unknown;
}

declare module ".pi/extensions/web-ui/lib/analytics/efficiency-analyzer.js" {
  export const analyzeEfficiency: (...args: unknown[]) => unknown;
}

declare module ".pi/extensions/web-ui/lib/analytics/anomaly-detector.js" {
  export const detectAnomalies: (...args: unknown[]) => unknown;
}
