/**
 * @path .pi/extensions/web-ui/web/src/components/ui/switch.tsx
 * @role shadcn/ui準拠のスイッチコンポーネント
 * @why トグル操作のUI統一
 * @related button.tsx, card.tsx
 * @public_api Switch
 */

import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  class?: string;
  "aria-label"?: string;
}

export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  id,
  name,
  class: className,
  "aria-label": ariaLabel,
}: SwitchProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internalChecked;
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (disabled) return;
    const newValue = !isChecked;
    if (!isControlled) {
      setInternalChecked(newValue);
    }
    onCheckedChange?.(newValue);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-label={ariaLabel}
      id={id}
      name={name}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={handleKeyDown}
      class={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "transition-colors duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        isChecked ? "bg-primary" : "bg-input",
        className
      )}
    >
      <span
        class={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0",
          "transition-transform duration-200 ease-in-out",
          isChecked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
