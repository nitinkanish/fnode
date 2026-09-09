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
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-[11px]";
  if (src) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        className={cn("shrink-0 object-contain drop-shadow-sm", dim)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[11px] bg-primary/15 font-semibold text-primary",
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
