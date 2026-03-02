/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/types/preact-router.d.ts
 * @role Type declarations for preact-router
 * @why Provide TypeScript types for preact-router's Route component and path prop
 * @related ../app.tsx
 * @public_api RouteProps, Route
 * @invariants None
 * @side_effects None
 * @failure_modes None
 *
 * @abdd.explain
 * @overview Type augmentations for preact-router
 * @what_it_does Adds type definitions for Route component and path prop
 * @why_it_exists preact-router lacks built-in TypeScript types
 * @scope(in) None
 * @scope(out) Type definitions
 */

import { ComponentType, VNode } from "preact";

declare module "preact-router" {
  /**
   * Props for Route component
   * @summary ルートプロパティ
   */
  export interface RouteProps<P = {}> {
    /** Path pattern for this route */
    path?: string;
    /** Whether this is the default route */
    default?: boolean;
    /** Component to render for this route */
    component?: ComponentType<P>;
  }

  /**
   * Route component for declarative routing
   * @summary ルートコンポーネント
   */
  export function Route<P extends RouteProps>(props: P): VNode | null;

  /**
   * Router component that renders the matched route
   * @summary ルーターコンポーネント
   */
  export function Router(props: { children?: VNode[] }): VNode;

  /**
   * Programmatically navigate to a path
   * @summary パスに移動
   */
  export function route(url: string, replace?: boolean): void;

  /**
   * Get current URL path
   * @summary 現在のパスを取得
   */
  export function getCurrentUrl(): string;
}

// Extend JSX to allow path prop on components
declare global {
  namespace preact.JSX {
    interface IntrinsicAttributes {
      /** Route path pattern */
      path?: string;
      /** Whether this is the default route */
      default?: boolean;
    }
  }
}

export {};
