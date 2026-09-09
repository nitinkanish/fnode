import { Progress } from "@/components/ui/progress";

export function UsageRow({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Progress className="h-1 flex-1" value={percent} />
      <span className="min-w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

export const compactGrid = "grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
