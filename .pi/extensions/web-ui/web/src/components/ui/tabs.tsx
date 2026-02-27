import { type ComponentChildren } from "preact";
import { cn } from "@/lib/utils";

interface TabsProps {
  children: ComponentChildren;
  class?: string;
}

export function Tabs({ children, class: className }: TabsProps) {
  return <div class={cn("w-full", className)}>{children}</div>;
}

interface TabsListProps {
  children: ComponentChildren;
  class?: string;
}

export function TabsList({ children, class: className }: TabsListProps) {
  return (
    <div
      class={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  children: ComponentChildren;
  active?: boolean;
  onClick?: () => void;
  class?: string;
}

export function TabsTrigger({
  children,
  active,
  onClick,
  class: className,
}: TabsTriggerProps) {
  return (
    <button
      class={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active
          ? "bg-background text-foreground shadow"
          : "hover:bg-background/50",
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  children: ComponentChildren;
  class?: string;
}

export function TabsContent({ children, class: className }: TabsContentProps) {
  return (
    <div
      class={cn(
        "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </div>
  );
}
