import { cn } from "@/lib/utils";

interface InputProps {
  type?: string;
  value?: string;
  onInput?: (e: JSX.TargetedEvent<HTMLInputElement>) => void;
  class?: string;
  placeholder?: string;
}

export function Input({ class: className, ...props }: InputProps) {
  return (
    <input
      class={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
