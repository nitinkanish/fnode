import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] text-[13px] font-medium transition-[background,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0";

const variants = {
  default: "bg-primary text-primary-foreground hover:brightness-110 active:brightness-95",
  destructive: "bg-destructive text-white hover:brightness-110",
  outline: "border border-border bg-card hover:bg-secondary",
  secondary: "bg-secondary text-secondary-foreground hover:bg-fill",
  ghost: "hover:bg-secondary",
  link: "text-primary hover:underline",
} as const;

const sizes = {
  default: "h-7 px-3",
  sm: "h-6 rounded-[5px] px-2 text-[12px]",
  lg: "h-8 px-4",
  icon: "h-7 w-7",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  className?: string;
} = {}) {
  return cn(base, variants[variant ?? "default"], sizes[size ?? "default"], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonVariants({ variant, size, className })} {...props} />;
}
