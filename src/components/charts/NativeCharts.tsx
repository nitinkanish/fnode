import type { ReactNode } from "react";

export interface AreaSeries {
  key: string;
  label: string;
  color: string;
  fill?: string;
}

interface HistoryLike {
  [key: string]: number | undefined;
}

export function NativeAreaChart({
  data,
  series,
  max,
  height = 180,
  formatTip,
}: {
  data: HistoryLike[];
  series: AreaSeries[];
  max?: number;
  height?: number;
  formatTip?: (key: string, value: number) => string;
}) {
  const width = 600;
  const pad = { t: 8, r: 8, b: 8, l: 8 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const ceiling =
    max ??
    Math.max(
      1,
      ...series.flatMap((item) => data.map((row) => Number(row[item.key] ?? 0))),
    );

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" role="img">
        {[0.25, 0.5, 0.75].map((tick) => (
          <line
            key={tick}
            x1={pad.l}
            x2={width - pad.r}
            y1={pad.t + innerH * (1 - tick)}
            y2={pad.t + innerH * (1 - tick)}
            stroke="currentColor"
            className="text-border"
            strokeWidth="1"
          />
        ))}
        {series.map((item) => {
          const values = data.map((row) => Number(row[item.key] ?? 0));
          const line = toLine(values, ceiling, pad.l, pad.t, innerW, innerH);
          const area = `${line} L ${pad.l + innerW} ${pad.t + innerH} L ${pad.l} ${pad.t + innerH} Z`;
          return (
            <g key={item.key}>
              <path d={area} fill={item.fill ?? item.color} fillOpacity={0.16} />
              <path d={line} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>
      {data.length > 0 && formatTip && (
        <div className="pointer-events-none absolute right-2 top-2 flex gap-3 text-[11px] text-muted-foreground">
          {series.map((item) => {
            const value = Number(data[data.length - 1]?.[item.key] ?? 0);
            return (
              <span key={item.key} className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                {formatTip(item.key, value)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CoreBars({ values }: { values: number[] }) {
  return (
    <div className="flex h-full items-end gap-1">
      {values.map((cpu, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <div className="relative h-full w-full overflow-hidden rounded-sm bg-secondary">
            <div
              className="absolute bottom-0 left-0 right-0 rounded-sm bg-primary/90"
              style={{ height: `${Math.min(100, Math.max(2, cpu))}%` }}
            />
          </div>
          <span className="text-[9px] tabular-nums text-muted-foreground">{index}</span>
        </div>
      ))}
    </div>
  );
}

export function UsageBar({
  value,
  label,
  detail,
  icon,
}: {
  value: number;
  label: string;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{detail}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </div>
      </div>
    </div>
  );
}

function toLine(values: number[], max: number, x: number, y: number, w: number, h: number): string {
  if (values.length === 0) return `M ${x} ${y + h}`;
  const last = Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const px = x + (index / last) * w;
      const py = y + (1 - Math.min(1, Math.max(0, value / max))) * h;
      return `${index === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(" ");
}
