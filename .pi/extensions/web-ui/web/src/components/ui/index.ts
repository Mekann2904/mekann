/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/ui/index.ts
 * @role UI component exports
 * @why Centralized access to all UI components
 * @related alert-dialog.tsx, button.tsx, card.tsx, etc.
 * @public_api All UI components
 * @invariants None
 * @side_effects None
 * @failure_modes None
 *
 * @abdd.explain
 * @overview UI component library entry point
 * @what_it_does Exports all reusable UI components
 * @why_it_exists Simplifies imports across the application
 * @scope(in/out) All UI components
 */

// Basic UI components
export { Button, type ButtonProps } from "./button";
export { Input, type InputProps } from "./input";
export { Card, CardHeader, CardContent, CardFooter, type CardProps } from "./card";
export { Progress } from "./progress";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
export { Switch, type SwitchProps } from "./switch";

// Dialog components
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "./alert-dialog";

// Drawer component
export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "./drawer";

// Chart components
export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
} from "./chart";

// Toast components
export { ToastContainer, ToastItem, TOAST_STYLES, type ToastItemProps } from "./toast";

// Shortcut help dialog
export { ShortcutHelpDialog, type ShortcutHelpDialogProps } from "./shortcut-help";
