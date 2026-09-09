import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Box, Cpu, FolderGit2, HardDrive, Radio, Sparkles, Wifi } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  chartTooltip,
  formatBytes,
  formatPercent,
  formatRate,
  formatUptime,
  localhostUrl,
} from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";

const CORE_COLORS = ["#f38064", "#818cf8", "#38bdf8", "#34d399", "#fbbf24", "#f472b6"];

export function DashboardPage() {
  const overview = useAppStore((s) => s.overview);
  const history = useAppStore((s) => s.history);
  const setPage = useAppStore((s) => s.setPage);
  const loading = useAppStore((s) => s.loading);

  if (!overview) {
    return (
      <p className="text-sm text-muted-foreground">
        {loading ? "Reading local system…" : "Waiting for backend."}
      </p>
    );
  }

  const { system } = overview;
  const memPct = system.memoryTotal ? (system.memoryUsed / system.memoryTotal) * 100 : 0;
  const diskPct = system.diskTotal ? (system.diskUsed / system.diskTotal) * 100 : 0;
  const swapPct = system.swapTotal ? (system.swapUsed / system.swapTotal) * 100 : 0;
  const cores = system.cpuPerCore.map((cpu, index) => ({
    name: `${index}`,
    cpu: Number(cpu.toFixed(1)),
  }));
  const topCpu = overview.topCpu.map((proc) => ({
    name: proc.name.length > 16 ? `${proc.name.slice(0, 16)}…` : proc.name,
    cpu: Number(proc.cpu.toFixed(1)),
    memory: proc.memoryBytes,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="CPU"
          value={formatPercent(system.cpuUsage)}
          hint={`${system.cpuCores} cores · ${system.arch} · load ${system.loadAvg1.toFixed(2)}`}
          percent={system.cpuUsage}
        />
        <MetricCard
          title="Memory"
          value={formatBytes(system.memoryUsed)}
          hint={`${formatBytes(system.memoryTotal)} · swap ${formatPercent(swapPct)}`}
          percent={memPct}
        />
        <MetricCard
          title="Disk"
          value={formatBytes(system.diskUsed)}
          hint={`${system.diskMount} · ${formatBytes(system.diskTotal)}`}
          percent={diskPct}
        />
        <Card>
          <CardHeader>
            <CardTitle>Host</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight">{system.hostname}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {system.osName} {system.osVersion} · Darwin {system.kernel} · up {formatUptime(system.uptimeSeconds)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{system.cpuBrand}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <CountCard icon={Cpu} label="Processes" value={system.processCount} onClick={() => setPage("processes")} />
        <CountCard icon={Radio} label="Open ports" value={overview.openPorts} onClick={() => setPage("ports")} />
        <CountCard
          icon={Box}
          label="Docker"
          value={overview.dockerRunning}
          hint={overview.dockerAvailable ? `${overview.dockerContainers} total` : "Desktop not running"}
          onClick={() => setPage("docker")}
        />
        <CountCard icon={Sparkles} label="AI services" value={overview.aiServices} onClick={() => setPage("ai")} />
        <CountCard
          icon={FolderGit2}
          label="Projects"
          value={overview.projectCount}
          onClick={() => setPage("projects")}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>CPU, memory, swap</CardTitle>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span className="text-primary">CPU</span>
              <span className="text-sky-400">RAM</span>
              <span className="text-amber-300">Swap</span>
            </div>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                <Tooltip contentStyle={chartTooltip} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, String(name)]} />
                <Area type="monotone" dataKey="cpu" name="CPU" stroke="#f38064" fill="#f38064" fillOpacity={0.18} />
                <Area type="monotone" dataKey="memory" name="RAM" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.1} />
                <Area type="monotone" dataKey="swap" name="Swap" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.08} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-3.5 w-3.5" /> Network
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Down</div>
                <div className="font-semibold">{formatRate(system.networkRxPerSec)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Up</div>
                <div className="font-semibold">{formatRate(system.networkTxPerSec)}</div>
              </div>
            </div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <Tooltip
                    contentStyle={chartTooltip}
                    formatter={(value, name) => [formatRate(Number(value)), String(name)]}
                  />
                  <Area type="monotone" dataKey="rx" name="Down" stroke="#34d399" fill="#34d399" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="tx" name="Up" stroke="#818cf8" fill="#818cf8" fillOpacity={0.12} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Total {formatBytes(system.networkRxBytes)} in · {formatBytes(system.networkTxBytes)} out
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Per-core CPU</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cores}>
                <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={chartTooltip} formatter={(value) => [`${value}%`, "CPU"]} />
                <Bar dataKey="cpu" radius={[4, 4, 0, 0]}>
                  {cores.map((_, index) => (
                    <Cell key={index} fill={CORE_COLORS[index % CORE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hottest processes</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCpu} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltip} formatter={(value) => [`${value}%`, "CPU"]} />
                <Bar dataKey="cpu" fill="#f38064" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Load average</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["1 min", system.loadAvg1],
              ["5 min", system.loadAvg5],
              ["15 min", system.loadAvg15],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span>{Number(value).toFixed(2)}</span>
                </div>
                <Progress value={Math.min(100, (Number(value) / Math.max(system.cpuCores, 1)) * 100)} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Listening now</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setPage("ports")}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.topPorts.length === 0 && (
              <p className="text-xs text-muted-foreground">No listening TCP ports detected.</p>
            )}
            {overview.topPorts.map((port) => (
              <div
                key={`${port.pid}-${port.port}-${port.address}`}
                className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">{port.displayName}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {port.address}:{port.port} · PID {port.pid}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void api.openUrl(localhostUrl(port.port, port.address))}>
                  Open
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  percent,
}: {
  title: string;
  value: string;
  hint: string;
  percent: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <Progress className="mt-3" value={Math.min(100, percent)} />
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function CountCard({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: typeof HardDrive;
  label: string;
  value: number;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-lg font-semibold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
            {hint && <Badge variant="secondary" className="mt-1">{hint}</Badge>}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
