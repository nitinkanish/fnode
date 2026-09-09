import { AppWindow, Box, Cpu, FolderGit2, HardDrive, HeartPulse, Radio, Sparkles, Wifi } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/shared/AppIcon";
import { CoreBars, NativeAreaChart, UsageBar } from "@/components/charts/NativeCharts";
import { formatBytes, formatPercent, formatRate, formatUptime, localhostUrl } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";

function HealthStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-semibold tracking-tight">{value}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

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
  const health = overview.health;
  const groups = overview.softwareGroups ?? [];
  const hottest = groups.slice(0, 8);

  return (
    <div className="space-y-6">
      {health?.alerts?.length > 0 && (
        <div className="space-y-2">
          {health.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border px-4 py-3 text-sm ${
                alert.severity === "critical"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-100"
              }`}
            >
              <div className="font-medium">{alert.title}</div>
              <p className="mt-0.5 text-xs opacity-80">{alert.body}</p>
            </div>
          ))}
        </div>
      )}

      {health && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="h-3.5 w-3.5" />
              System health
            </CardTitle>
            <Badge variant={health.status === "healthy" ? "success" : health.status === "watch" ? "warning" : "danger"}>
              {health.status}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div>
                <div className="text-3xl font-semibold tracking-tight">{health.score}</div>
                <p className="text-xs text-muted-foreground">Health score</p>
              </div>
              <HealthStat label="CPU" value={formatPercent(health.cpuPct)} />
              <HealthStat label="Memory" value={formatPercent(health.memoryPct)} />
              <HealthStat
                label="Temperature"
                value={health.temperatureC != null ? `${health.temperatureC.toFixed(0)}°C` : "—"}
              />
              <HealthStat
                label="CPU speed"
                value={health.cpuSpeedLimit != null ? `${health.cpuSpeedLimit}%` : "full"}
              />
            </div>
            <Progress className="mt-4" value={health.score} />
          </CardContent>
        </Card>
      )}

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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <CountCard icon={Cpu} label="Processes" value={system.processCount} onClick={() => setPage("processes")} />
        <CountCard
          icon={AppWindow}
          label="Apps"
          value={(overview.guiApps ?? []).length}
          onClick={() => setPage("apps")}
        />
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
            <p className="text-[11px] text-muted-foreground">Last {history.length} snapshots</p>
          </CardHeader>
          <CardContent className="h-56">
            <NativeAreaChart
              data={history}
              max={100}
              height={220}
              formatTip={(key, value) => `${key === "cpu" ? "CPU" : key === "memory" ? "RAM" : "Swap"} ${value.toFixed(0)}%`}
              series={[
                { key: "cpu", label: "CPU", color: "#f38064" },
                { key: "memory", label: "RAM", color: "#38bdf8" },
                { key: "swap", label: "Swap", color: "#fbbf24" },
              ]}
            />
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
              <NativeAreaChart
                data={history}
                height={140}
                formatTip={(key, value) => `${key === "rx" ? "Down" : "Up"} ${formatRate(value)}`}
                series={[
                  { key: "rx", label: "Down", color: "#34d399" },
                  { key: "tx", label: "Up", color: "#818cf8" },
                ]}
              />
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
            <CoreBars values={system.cpuPerCore.map((cpu) => Number(cpu.toFixed(1)))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Hottest software</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setPage("apps")}>
              Apps
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {hottest.length === 0 ? (
              <p className="text-xs text-muted-foreground">No process groups yet.</p>
            ) : (
              hottest.map((group) => (
                <UsageBar
                  key={group.id}
                  value={Math.min(100, group.cpu)}
                  label={group.name}
                  detail={`${formatPercent(group.cpu)} · ${formatBytes(group.memoryBytes)}`}
                  icon={<AppIcon src={group.icon} name={group.name} size="sm" />}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {groups.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Hottest processes by software</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setPage("processes")}>
              Processes
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.slice(0, 8).map((group) => (
              <div key={group.id} className="flex items-center gap-3">
                <AppIcon src={group.icon} name={group.name} size="sm" />
                <div className="w-36 shrink-0 truncate text-sm">{group.name}</div>
                <div className="min-w-0 flex-1">
                  <Progress value={Math.min(100, group.cpu)} />
                </div>
                <div className="w-16 text-right text-xs tabular-nums">{formatPercent(group.cpu)}</div>
                <div className="w-20 text-right text-xs text-muted-foreground">{formatBytes(group.memoryBytes)}</div>
                <div className="w-16 text-right text-[11px] text-muted-foreground">{group.processCount} proc</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
            <Button variant="ghost" size="sm" onClick={() => setPage("apps")}>
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
