import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  class?: string;
}

export function Progress({ value, class: className }: ProgressProps) {
  return (
    <div
      class={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
    >
      <div
        class="h-full w-full flex-1 bg-primary transition-all"
        style={`transform: translateX(-${100 - value}%)`}
      />
    </div>
  );
}
