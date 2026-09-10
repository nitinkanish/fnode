import { NativeAreaChart } from "@/components/charts/NativeCharts";
import { formatPercent, formatRate } from "@/lib/format";
import type { MetricsPoint } from "@/types";

export function HistoryCharts({
  data,
  kind,
}: {
  data: MetricsPoint[];
  kind: "system" | "network";
}) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No stored samples yet. Keep FNode open — history writes every ~20s.
      </p>
    );
  }
  if (kind === "system") {
    return (
      <NativeAreaChart
        data={data}
        max={100}
        height={220}
        formatTip={(key, value) =>
          `${key === "cpu" ? "CPU" : key === "memory" ? "RAM" : "Disk"} ${formatPercent(value)}`
        }
        series={[
          { key: "cpu", label: "CPU", color: "#007AFF" },
          { key: "memory", label: "RAM", color: "#34C759" },
          { key: "disk", label: "Disk", color: "#AF52DE" },
        ]}
      />
    );
  }
  return (
    <NativeAreaChart
      data={data}
      height={140}
      formatTip={(key, value) => `${key === "rx" ? "Down" : "Up"} ${formatRate(value)}`}
      series={[
        { key: "rx", label: "Down", color: "#34C759" },
        { key: "tx", label: "Up", color: "#007AFF" },
      ]}
    />
  );
}
