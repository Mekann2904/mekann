import { type ComponentChildren } from "preact";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ComponentChildren;
  class?: string;
}

export function Card({ children, class: className }: CardProps) {
  return (
    <div
      class={cn(
        "rounded-xl border bg-card text-card-foreground shadow",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, class: className }: CardProps) {
  return <div class={cn("flex flex-col space-y-1.5 p-6", className)}>{children}</div>;
}

export function CardTitle({ children, class: className }: CardProps) {
  return (
    <h3 class={cn("font-semibold leading-none tracking-tight", className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, class: className }: CardProps) {
  return <p class={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function CardContent({ children, class: className }: CardProps) {
  return <div class={cn("p-6 pt-0", className)}>{children}</div>;
}

export function CardFooter({ children, class: className }: CardProps) {
  return <div class={cn("flex items-center p-6 pt-0", className)}>{children}</div>;
}
