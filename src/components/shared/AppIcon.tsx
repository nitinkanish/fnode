import { cn } from "@/lib/utils";

export function AppIcon({
  src,
  name,
  size = "md",
}: {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-[11px]";
  if (src) {
    return <img src={src} alt="" className={cn("shrink-0 rounded-[9px] object-cover", dim)} />;
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[9px] bg-primary/15 font-semibold text-primary",
        dim,
      )}
    >
      {initials(name)}
    </div>
  );
}

function initials(name: string) {
  const parts = name.replace(/\.app$/i, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
