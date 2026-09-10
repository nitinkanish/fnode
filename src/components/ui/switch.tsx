import { cn } from "@/lib/utils";

interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function Switch({ checked = false, onCheckedChange, className, id, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "group inline-flex h-[21px] w-[40px] shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--switch)] data-[state=unchecked]:bg-[var(--switch-off)]",
        className,
      )}
      onClick={() => onCheckedChange?.(!checked)}
    >
      <span className="pointer-events-none block h-[19px] w-[19px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] ring-0 transition-transform group-data-[state=checked]:translate-x-[19px] group-data-[state=unchecked]:translate-x-px" />
    </button>
  );
}
