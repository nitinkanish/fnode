import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBytes, formatPercent } from "@/lib/format";
import type { MetricsPoint } from "@/types";

const tooltipStyle = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  fontSize: 12,
};

export function HistoryCharts({
  data,
  kind,
}: {
  data: MetricsPoint[];
  kind: "system" | "network";
}) {
  const rows = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        label: formatTick(row.ts),
      })),
    [data],
  );

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No stored samples yet. Keep FNode open — history writes every ~20s.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 10 }} minTickGap={24} />
        <YAxis
          tick={{ fill: "#a1a1aa", fontSize: 10 }}
          width={40}
          domain={kind === "system" ? [0, 100] : ["auto", "auto"]}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => {
            const n = Number(value ?? 0);
            if (name === "rx" || name === "tx") return [formatBytes(n) + "/s", name === "rx" ? "Down" : "Up"];
            return [formatPercent(n), String(name).toUpperCase()];
          }}
        />
        {kind === "system" ? (
          <>
            <Area type="monotone" dataKey="cpu" name="cpu" stroke="#f38064" fill="#f38064" fillOpacity={0.16} strokeWidth={2} />
            <Area type="monotone" dataKey="memory" name="memory" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.12} strokeWidth={2} />
            <Area type="monotone" dataKey="disk" name="disk" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.1} strokeWidth={2} />
          </>
        ) : (
          <>
            <Area type="monotone" dataKey="rx" name="rx" stroke="#34d399" fill="#34d399" fillOpacity={0.16} strokeWidth={2} />
            <Area type="monotone" dataKey="tx" name="tx" stroke="#818cf8" fill="#818cf8" fillOpacity={0.12} strokeWidth={2} />
          </>
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function formatTick(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
