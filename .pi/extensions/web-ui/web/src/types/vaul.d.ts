/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/types/vaul.d.ts
 * @role Type declarations for vaul drawer library
 * @why Make vaul work with Preact by widening type constraints
 * @related ui/drawer.tsx
 * @public_api None (module augmentation)
 * @invariants None
 * @side_effects None
 * @failure_modes None
 *
 * @abdd.explain
 * @overview Type augmentations for vaul drawer library
 * @what_it_does Widens vaul types to accept Preact ComponentChildren
 * @why_it_exists vaul expects React types, causing TS errors with Preact
 * @scope(in) None
 * @scope(out) Augmented type definitions
 */

declare module "vaul" {
  import { ComponentType, ComponentChildren } from "preact";

  /**
   * Generic props interface
   */
  interface BaseProps {
    children?: ComponentChildren;
    className?: string;
    asChild?: boolean;
  }

  /**
   * Drawer root props
   */
  interface DrawerRootProps {
    children?: ComponentChildren;
    direction?: "top" | "right" | "bottom" | "left";
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    shouldScaleBackground?: boolean;
    setBackgroundColorOnScale?: boolean;
    modal?: boolean;
    snapPoints?: number[];
    activeSnapPoint?: number | null;
    setActiveSnapPoint?: (point: number | null) => void;
    dismissible?: boolean;
    defaultOpen?: boolean;
    onClose?: () => void;
  }

  /**
   * Drawer trigger props
   */
  interface DrawerTriggerProps extends BaseProps {
    asChild?: boolean;
  }

  /**
   * Drawer content props
   */
  interface DrawerContentProps extends BaseProps {
    children?: ComponentChildren;
  }

  /**
   * Drawer title props
   */
  interface DrawerTitleProps extends BaseProps {
    style?: preact.JSX.CSSProperties;
  }

  /**
   * Drawer description props
   */
  interface DrawerDescriptionProps extends BaseProps {}

  /**
   * Drawer close props
   */
  interface DrawerCloseProps extends BaseProps {
    asChild?: boolean;
  }

  /**
   * Drawer portal props
   */
  interface DrawerPortalProps {
    children?: ComponentChildren;
    container?: Element | DocumentFragment;
  }

  /**
   * Drawer overlay props
   */
  interface DrawerOverlayProps extends BaseProps {}

  namespace Drawer {
    export function Root(props: DrawerRootProps): preact.VNode;
    export function Trigger(props: DrawerTriggerProps): preact.VNode;
    export function Content(props: DrawerContentProps): preact.VNode;
    export function Title(props: DrawerTitleProps): preact.VNode;
    export function Description(props: DrawerDescriptionProps): preact.VNode;
    export function Close(props: DrawerCloseProps): preact.VNode;
    export function Portal(props: DrawerPortalProps): preact.VNode | null;
    export function Overlay(props: DrawerOverlayProps): preact.VNode;
  }

  export default Drawer;
  export { Drawer };
}
