/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/ui/drawer.tsx
 * @role Drawerコンポーネント（vaulベース）
 * @why ボトムシートなどでコンテンツを表示するため
 * @related dashboard-page.tsx
 * @public_api Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose
 * @invariants なし
 * @side_effects なし
 * @failure_modes なし
 *
 * @abdd.explain
 * @overview vaulライブラリを使用したDrawerコンポーネント
 * @what_it_does ボトムシート・サイドシートを提供
 * @why_it_exists モーダルの代わりにスライドイン panel を提供するため
 */

import { h } from "preact";
import { ComponentChildren } from "preact";
import { Drawer as VaulDrawer } from "vaul";

interface DrawerProps {
  children?: ComponentChildren;
  direction?: "top" | "right" | "bottom" | "left";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * @summary Drawer root component
 */
export function Drawer({ children, direction, open, onOpenChange }: DrawerProps) {
  return (
    <VaulDrawer.Root direction={direction} open={open} onOpenChange={onOpenChange}>
      {children}
    </VaulDrawer.Root>
  );
}

interface DrawerTriggerProps {
  children?: ComponentChildren;
  asChild?: boolean;
  className?: string;
}

/**
 * @summary Drawer trigger button
 */
export function DrawerTrigger({ children, className }: DrawerTriggerProps) {
  return (
    <VaulDrawer.Trigger asChild className={className}>
      {children}
    </VaulDrawer.Trigger>
  );
}

interface DrawerContentProps {
  children?: ComponentChildren;
  className?: string;
}

/**
 * @summary Drawer content container
 */
export function DrawerContent({ children, className }: DrawerContentProps) {
  return (
    <VaulDrawer.Portal>
      <VaulDrawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
      <VaulDrawer.Content
        className={`
          fixed z-50 bg-zinc-900 border-t border-zinc-700
          bottom-0 left-0 right-0
          rounded-t-xl
          h-[90vh]
          flex flex-col
          ${className || ""}
        `}
      >
        {/* Handle bar */}
        <div class="flex justify-center pt-2 pb-1 shrink-0">
          <div class="h-1 w-10 rounded-full bg-zinc-600" />
        </div>
        {/* Visually hidden title for accessibility */}
        <VaulDrawer.Title style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
          Plan Viewer
        </VaulDrawer.Title>
        {children}
      </VaulDrawer.Content>
    </VaulDrawer.Portal>
  );
}

interface DrawerHeaderProps {
  children?: ComponentChildren;
  className?: string;
}

/**
 * @summary Drawer header section
 */
export function DrawerHeader({ children, className }: DrawerHeaderProps) {
  return (
    <div class={`px-4 py-3 border-b border-zinc-800 ${className || ""}`}>
      {children}
    </div>
  );
}

interface DrawerTitleProps {
  children?: ComponentChildren;
  className?: string;
}

/**
 * @summary Drawer title
 */
export function DrawerTitle({ children, className }: DrawerTitleProps) {
  return (
    <VaulDrawer.Title className={`text-lg font-semibold text-zinc-100 ${className || ""}`}>
      {children}
    </VaulDrawer.Title>
  );
}

interface DrawerDescriptionProps {
  children?: ComponentChildren;
  className?: string;
}

/**
 * @summary Drawer description
 */
export function DrawerDescription({ children, className }: DrawerDescriptionProps) {
  return (
    <VaulDrawer.Description className={`text-sm text-zinc-400 mt-1 ${className || ""}`}>
      {children}
    </VaulDrawer.Description>
  );
}

interface DrawerFooterProps {
  children?: ComponentChildren;
  className?: string;
}

/**
 * @summary Drawer footer section
 */
export function DrawerFooter({ children, className }: DrawerFooterProps) {
  return (
    <div class={`px-4 py-3 border-t border-zinc-800 mt-auto ${className || ""}`}>
      {children}
    </div>
  );
}

interface DrawerCloseProps {
  children?: ComponentChildren;
  className?: string;
}

/**
 * @summary Drawer close button
 */
export function DrawerClose({ children, className }: DrawerCloseProps) {
  return (
    <VaulDrawer.Close className={className}>
      {children}
    </VaulDrawer.Close>
  );
}
