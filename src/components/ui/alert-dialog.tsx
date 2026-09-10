import { createContext, useContext, useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface AlertContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("AlertDialog components must be used within AlertDialog");
  return ctx;
}

export function AlertDialog({
  open = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const setOpen = onOpenChange ?? (() => {});
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  return <AlertContext.Provider value={{ open, onOpenChange: setOpen }}>{children}</AlertContext.Provider>;
}

export function AlertDialogContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open } = useAlert();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" />
      <div
        role="alertdialog"
        aria-modal="true"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-[360px] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-[14px] border border-border bg-card p-5 shadow-[0_10px_40px_rgba(0,0,0,0.22)]",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-2 text-left", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex justify-end gap-2", className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold", className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function AlertDialogAction({ className, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onOpenChange } = useAlert();
  return (
    <button
      type="button"
      className={cn(buttonVariants(), className)}
      onClick={(event) => {
        onClick?.(event);
        onOpenChange(false);
      }}
      {...props}
    />
  );
}

export function AlertDialogCancel({ className, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onOpenChange } = useAlert();
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant: "outline" }), className)}
      onClick={(event) => {
        onClick?.(event);
        onOpenChange(false);
      }}
      {...props}
    />
  );
}
