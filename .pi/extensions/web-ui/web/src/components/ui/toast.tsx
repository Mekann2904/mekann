/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/ui/toast.tsx
 * @role Toast notification UI component
 * @why Render toast notifications in a fixed position container
 * @related ../../hooks/useToast.ts
 * @public_api ToastContainer, ToastItem
 * @invariants Toasts are positioned at bottom-right
 * @side_effects None (display only)
 * @failure_modes None
 *
 * @abdd.explain
 * @overview Toast notification display component
 * @what_it_does Renders toast notifications with appropriate styling
 * @why_it_exists Visual feedback for user actions
 * @scope(in) Toast data from context
 * @scope(out) Rendered toast notifications
 */

import { h } from "preact";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-preact";
import { cn } from "@/lib/utils";
import { useToast, type ToastType, type Toast } from "../../hooks/useToast";

/**
 * Icon and color configuration per toast type
 */
const TOAST_CONFIG: Record<
  ToastType,
  {
    icon: typeof CheckCircle2;
    bgClass: string;
    iconClass: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    bgClass: "bg-green-500/10 border-green-500/30",
    iconClass: "text-green-500",
  },
  warning: {
    icon: AlertTriangle,
    bgClass: "bg-yellow-500/10 border-yellow-500/30",
    iconClass: "text-yellow-500",
  },
  error: {
    icon: XCircle,
    bgClass: "bg-red-500/10 border-red-500/30",
    iconClass: "text-red-500",
  },
  info: {
    icon: Info,
    bgClass: "bg-blue-500/10 border-blue-500/30",
    iconClass: "text-blue-500",
  },
};

/**
 * Props for ToastItem component
 */
interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

/**
 * Individual toast notification component
 * @summary トーストアイテム
 */
function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;

  return (
    <div
      class={cn(
        "flex items-start gap-3 p-3 rounded-lg border shadow-lg",
        "bg-card backdrop-blur-sm",
        "animate-in slide-in-from-right-full fade-in duration-300",
        "group relative",
        config.bgClass
      )}
      role="alert"
    >
      {/* Icon */}
      <Icon class={cn("h-5 w-5 shrink-0 mt-0.5", config.iconClass)} />

      {/* Message */}
      <p class="flex-1 text-sm text-foreground leading-snug pr-6">
        {toast.message}
      </p>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(toast.id)}
        class={cn(
          "absolute right-2 top-2 p-1 rounded",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
        )}
        aria-label="閉じる"
      >
        <X class="h-3.5 w-3.5" />
      </button>

      {/* Progress bar */}
      <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-muted/30 rounded-b-lg overflow-hidden">
        <div
          class={cn("h-full", config.iconClass.replace("text-", "bg-"))}
          style={{
            animation: `shrink ${toast.duration ?? 5000}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Container for toast notifications
 * @summary トーストコンテナ
 */
export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      class={cn(
        "fixed bottom-4 right-4 z-50",
        "flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
      )}
      aria-live="polite"
      aria-label="通知"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}

/**
 * CSS for toast animations
 * Add to globals.css or use inline style
 */
export const TOAST_STYLES = `
@keyframes shrink {
  from { width: 100%; }
  to { width: 0%; }
}

@keyframes slide-in-from-right-full {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.animate-in {
  animation-duration: 300ms;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: forwards;
}

.slide-in-from-right-full {
  animation-name: slide-in-from-right-full;
}

.fade-in {
  animation-name: fade-in;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;
