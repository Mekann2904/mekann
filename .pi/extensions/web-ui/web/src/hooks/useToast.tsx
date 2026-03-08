/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useToast.ts
 * @role Global toast notification system
 * @why Provide user feedback for actions and errors
 * @related ../components/ui/toast.tsx, app.tsx
 * @public_api useToast, ToastProvider, ToastType, Toast
 * @invariants Maximum 5 toasts displayed at once
 * @side_effects Renders toasts in portal, manages auto-dismiss timers
 * @failure_modes None (graceful degradation)
 *
 * @abdd.explain
 * @overview Toast notification context and hook
 * @what_it_does Provides global toast state management via context
 * @why_it_exists Centralized notification system for user feedback
 * @scope(in) Toast requests from components
 * @scope(out) Toast state, show/dismiss functions
 */

import { createContext } from "preact";
import { useState, useCallback, useContext, useEffect, useRef } from "preact/hooks";

/**
 * Toast type discriminator
 */
export type ToastType = "success" | "warning" | "error" | "info";

/**
 * Toast notification object
 */
export interface Toast {
  /** Unique identifier */
  id: string;
  /** Toast type for styling */
  type: ToastType;
  /** Message to display */
  message: string;
  /** Duration in milliseconds (default: 5000) */
  duration?: number;
  /** Timestamp when created */
  createdAt: number;
}

/**
 * Context value type
 */
export interface ToastContextValue {
  /** Current toasts */
  toasts: Toast[];
  /** Show a new toast */
  show: (type: ToastType, message: string, duration?: number) => void;
  /** Dismiss a specific toast */
  dismiss: (id: string) => void;
  /** Dismiss all toasts */
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Maximum number of toasts to display */
const MAX_TOASTS = 5;

/** Default toast duration in milliseconds */
const DEFAULT_DURATION = 5000;

/**
 * Hook to access toast functionality
 * @summary トースト通知フック
 * @returns トースト表示関数
 * @throws Error if used outside ToastProvider
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

/**
 * Props for ToastProvider
 */
interface ToastProviderProps {
  children: preact.ComponentChildren;
}

/**
 * Provider component for toast notifications
 * @summary トーストプロバイダー
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Show a new toast notification
   */
  const show = useCallback((type: ToastType, message: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const actualDuration = duration ?? DEFAULT_DURATION;

    const newToast: Toast = {
      id,
      type,
      message,
      duration: actualDuration,
      createdAt: Date.now(),
    };

    setToasts((prev) => {
      // Add new toast and limit to MAX_TOASTS
      const updated = [...prev, newToast];
      if (updated.length > MAX_TOASTS) {
        // Remove oldest toast and its timer
        const removed = updated.shift();
        if (removed) {
          const timer = timersRef.current.get(removed.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(removed.id);
          }
        }
      }
      return updated;
    });

    // Set auto-dismiss timer
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, actualDuration);

    timersRef.current.set(id, timer);
  }, []);

  /**
   * Dismiss a specific toast
   */
  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Dismiss all toasts
   */
  const dismissAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss, dismissAll }}>
      {children}
    </ToastContext.Provider>
  );
}

/**
 * Convenience functions for common toast types
 */
export const toast = {
  /** Show success toast */
  success: (ctx: ToastContextValue, message: string, duration?: number) =>
    ctx.show("success", message, duration),
  /** Show warning toast */
  warning: (ctx: ToastContextValue, message: string, duration?: number) =>
    ctx.show("warning", message, duration),
  /** Show error toast */
  error: (ctx: ToastContextValue, message: string, duration?: number) =>
    ctx.show("error", message, duration),
  /** Show info toast */
  info: (ctx: ToastContextValue, message: string, duration?: number) =>
    ctx.show("info", message, duration),
};
