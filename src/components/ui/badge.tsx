import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-accent text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-foreground",
  success: "bg-[rgba(52,199,89,0.16)] text-[#248a3d] dark:text-[#30d158]",
  warning: "bg-[rgba(255,159,10,0.18)] text-[#c93400] dark:text-[#ff9f0a]",
  danger: "bg-[rgba(255,59,48,0.16)] text-[#d70015] dark:text-[#ff453a]",
} as const;

export type BadgeVariant = keyof typeof variants;

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-[5px] px-1.5 py-px text-[11px] font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
