/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/ui/alert-dialog.tsx
 * @role Reusable alert dialog component for confirmations
 * @why Provide consistent confirmation UI for destructive actions
 * @related button.tsx, tasks-page.tsx
 * @public_api AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel
 * @invariants Dialog is controlled by open state
 * @side_effects None (display only)
 * @failure_modes None
 *
 * @abdd.explain
 * @overview Modal dialog for user confirmations
 * @what_it_does Shows a modal dialog with title, description, and action buttons
 * @why_it_exists Prevent accidental destructive actions like delete
 * @scope(in) open state, children
 * @scope(out) Rendered modal dialog
 */

import { h, Fragment } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { createPortal } from "preact/compat";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface AlertDialogProps {
  children: preact.ComponentChildren;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AlertDialog({ children, open, onOpenChange }: AlertDialogProps) {
  return <>{children}</>;
}

interface AlertDialogTriggerProps {
  children: preact.ComponentChildren;
  asChild?: boolean;
  onClick?: () => void;
}

export function AlertDialogTrigger({ children, asChild, onClick }: AlertDialogTriggerProps) {
  if (asChild && children && typeof children === "object" && "props" in children) {
    const child = children as preact.VNode<{ onClick?: (e: Event) => void }>;
    const ChildComponent = child.type as preact.ComponentType<{ onClick?: (e: Event) => void }>;
    return (
      <ChildComponent
        {...child.props}
        onClick={(e: Event) => {
          onClick?.();
          child.props.onClick?.(e);
        }}
      />
    );
  }
  return <Button onClick={onClick}>{children}</Button>;
}

interface AlertDialogContentProps {
  children: preact.ComponentChildren;
  size?: "sm" | "default" | "lg";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AlertDialogContent({ children, size = "default", open = true, onOpenChange }: AlertDialogContentProps) {
  const handleBackdropClick = useCallback((e: Event) => {
    if (e.target === e.currentTarget) {
      onOpenChange?.(false);
    }
  }, [onOpenChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onOpenChange?.(false);
    }
  }, [onOpenChange]);

  const isOpen = open ?? true;

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    default: "max-w-lg",
    lg: "max-w-2xl",
  };

  return createPortal(
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div class="fixed inset-0 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      
      {/* Content */}
      <div
        class={cn(
          "fixed z-50 grid w-full gap-4 border bg-background p-6 shadow-lg sm:rounded-lg",
          sizeClasses[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function AlertDialogHeader({ children, class: className }: { children: preact.ComponentChildren; class?: string }) {
  return (
    <div class={cn("flex flex-col space-y-2 text-center sm:text-left", className)}>
      {children}
    </div>
  );
}

export function AlertDialogFooter({ children, class: className }: { children: preact.ComponentChildren; class?: string }) {
  return (
    <div class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}>
      {children}
    </div>
  );
}

export function AlertDialogTitle({ children, class: className }: { children: preact.ComponentChildren; class?: string }) {
  return (
    <h2 class={cn("text-lg font-semibold", className)}>
      {children}
    </h2>
  );
}

export function AlertDialogDescription({ children, class: className }: { children: preact.ComponentChildren; class?: string }) {
  return (
    <p class={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

interface AlertDialogActionProps {
  children: preact.ComponentChildren;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  onClick?: () => void;
  class?: string;
}

export function AlertDialogAction({ children, variant = "default", onClick, class: className }: AlertDialogActionProps) {
  return (
    <Button variant={variant} class={className} onClick={onClick}>
      {children}
    </Button>
  );
}

interface AlertDialogCancelProps {
  children: preact.ComponentChildren;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  onClick?: () => void;
  class?: string;
}

export function AlertDialogCancel({ children, variant = "outline", onClick, class: className }: AlertDialogCancelProps) {
  return (
    <Button variant={variant} class={className} onClick={onClick}>
      {children}
    </Button>
  );
}
