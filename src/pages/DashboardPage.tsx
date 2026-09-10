import { useEffect, useState } from "react";
import { AppWindow, BatteryCharging, Box, Camera, Cpu, DollarSign, FolderGit2, HardDrive, HeartPulse, Mic, Radio, Sparkles, Wifi } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppIcon } from "@/components/shared/AppIcon";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CoreBars, NativeAreaChart, UsageBar } from "@/components/charts/NativeCharts";
import { HistoryCharts } from "@/components/charts/HistoryCharts";
import { dbKind, dbLabel, openListener } from "@/lib/databases";
import { formatBytes, formatPercent, formatRate, formatTokens, formatUsd, formatUptime } from "@/lib/format";
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
  const metricsHistory = useAppStore((s) => s.metricsHistory);
  const metricsRange = useAppStore((s) => s.metricsRange);
  const loadMetrics = useAppStore((s) => s.loadMetrics);
  const setPage = useAppStore((s) => s.setPage);
  const loading = useAppStore((s) => s.loading);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const [stopOffer, setStopOffer] = useState<{ title: string; pids: number[] } | null>(null);

  useEffect(() => {
    void loadMetrics(metricsRange);
  }, [loadMetrics, metricsRange]);

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

      {(overview.automationAlerts?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {overview.automationAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
            >
              <div>
                <div className="font-medium">{alert.title}</div>
                <p className="mt-0.5 text-xs opacity-80">{alert.body}</p>
              </div>
              {alert.action === "stop" && alert.pids.length > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 shrink-0"
                  onClick={() => setStopOffer({ title: alert.title, pids: alert.pids })}
                >
                  Offer stop
                </Button>
              )}
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

      <div className="grid gap-3 xl:grid-cols-3">
        <PrivacyPanel />
        <BatteryPanel />
        <UsagePanel />
      </div>

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
            <CardTitle>CPU, memory, disk</CardTitle>
            <Tabs value={metricsRange} onValueChange={(value) => void loadMetrics(value === "30d" ? "30d" : "7d")}>
              <TabsList>
                <TabsTrigger value="7d">7 days</TabsTrigger>
                <TabsTrigger value="30d">30 days</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="h-56">
            {metricsHistory.length > 0 ? (
              <HistoryCharts data={metricsHistory} kind="system" />
            ) : (
              <NativeAreaChart
                data={history}
                max={100}
                height={220}
                formatTip={(key, value) => `${key === "cpu" ? "CPU" : key === "memory" ? "RAM" : "Swap"} ${value.toFixed(0)}%`}
                series={[
                  { key: "cpu", label: "CPU", color: "#007AFF" },
                  { key: "memory", label: "RAM", color: "#34C759" },
                  { key: "swap", label: "Swap", color: "#FF9F0A" },
                ]}
              />
            )}
            {metricsHistory.length === 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">Live window until SQLite has 7-day samples.</p>
            )}
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
              {metricsHistory.length > 0 ? (
                <HistoryCharts data={metricsHistory} kind="network" />
              ) : (
                <NativeAreaChart
                  data={history}
                  height={140}
                  formatTip={(key, value) => `${key === "rx" ? "Down" : "Up"} ${formatRate(value)}`}
                  series={[
                    { key: "rx", label: "Down", color: "#34C759" },
                    { key: "tx", label: "Up", color: "#007AFF" },
                  ]}
                />
              )}
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
            {overview.topPorts.map((port) => {
              const kind = dbKind(port);
              return (
                <div
                  key={`${port.pid}-${port.port}-${port.address}`}
                  className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{port.displayName}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {port.address}:{port.port} · PID {port.pid}
                      {kind ? ` · ${dbLabel(kind)}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void openListener(port)}>
                    {kind ? `Open ${dbLabel(kind)}` : "Open"}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(stopOffer)}
        onOpenChange={(open) => !open && setStopOffer(null)}
        title={`Stop ${stopOffer?.title ?? "process"}?`}
        description="Idle servers are only stopped after you confirm. SIGTERM first, then SIGKILL if they stay alive."
        confirmLabel="Stop"
        onConfirm={() => {
          const pids = stopOffer?.pids ?? [];
          void api.quitCompletely(pids).then(refreshLive);
          setStopOffer(null);
        }}
      />
    </div>
  );
}

function PrivacyPanel() {
  const privacy = useAppStore((s) => s.overview?.privacy);
  const enabled = useAppStore((s) => s.settings?.privacySensorsEnabled ?? true);
  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-3.5 w-3.5" /> Camera & microphone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Sensor watch is off in Settings.</p>
        </CardContent>
      </Card>
    );
  }
  const camera = privacy?.cameraApps ?? [];
  const mic = privacy?.microphoneApps ?? [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-3.5 w-3.5" /> Camera & microphone
        </CardTitle>
        <div className="flex gap-1">
          <Badge variant={privacy?.cameraActive ? "danger" : "secondary"}>{privacy?.cameraActive ? "Cam on" : "Cam idle"}</Badge>
          <Badge variant={privacy?.microphoneActive ? "warning" : "secondary"}>{privacy?.microphoneActive ? "Mic on" : "Mic idle"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {camera.length === 0 && mic.length === 0 && (
          <p className="text-xs text-muted-foreground">No app is holding a camera or mic device in this snapshot.</p>
        )}
        {camera.map((app) => (
          <div key={`cam-${app.pid}`} className="flex items-center gap-2 text-sm">
            <AppIcon src={app.icon} name={app.software} size="sm" />
            <Camera className="h-3 w-3 text-red-400" />
            <span className="truncate">{app.software}</span>
          </div>
        ))}
        {mic.map((app) => (
          <div key={`mic-${app.pid}`} className="flex items-center gap-2 text-sm">
            <AppIcon src={app.icon} name={app.software} size="sm" />
            <Mic className="h-3 w-3 text-amber-400" />
            <span className="truncate">{app.software}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function BatteryPanel() {
  const battery = useAppStore((s) => s.overview?.battery);
  if (!battery?.present) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BatteryCharging className="h-3.5 w-3.5" /> Battery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No internal battery reported (desktop, or ioreg unavailable).</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <BatteryCharging className="h-3.5 w-3.5" /> Battery
        </CardTitle>
        <Badge
          variant={
            battery.condition === "Normal"
              ? "success"
              : battery.condition === "Fair"
                ? "warning"
                : battery.condition === "Unknown"
                  ? "secondary"
                  : "danger"
          }
        >
          {battery.condition}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-lg font-semibold">{battery.percent != null ? `${battery.percent.toFixed(0)}%` : "—"}</div>
            <p className="text-[11px] text-muted-foreground">{battery.charging ? "Charging" : "Charge"}</p>
          </div>
          <div>
            <div className="text-lg font-semibold">{battery.maxCapacityPct != null ? `${battery.maxCapacityPct.toFixed(0)}%` : "—"}</div>
            <p className="text-[11px] text-muted-foreground">Max capacity</p>
          </div>
          <div>
            <div className="text-lg font-semibold">{battery.cycleCount ?? "—"}</div>
            <p className="text-[11px] text-muted-foreground">Cycles</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Drain ranking uses CPU share from the live snapshot. macOS Energy Impact needs sudo powermetrics.
        </p>
        {battery.drainers.map((row) => (
          <UsageBar
            key={row.name}
            value={Math.min(100, row.cpu)}
            label={row.name}
            detail={formatPercent(row.cpu)}
            icon={<AppIcon src={row.icon} name={row.name} size="sm" />}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function UsagePanel() {
  const usage = useAppStore((s) => s.overview?.usage);
  const setPage = useAppStore((s) => s.setPage);
  const refreshUsage = useAppStore((s) => s.refreshUsage);
  if (!usage?.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5" /> API spend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Cost tracking is off. Turn it on in Settings to estimate Cursor / OpenAI spend from local logs.
          </p>
          <Button size="sm" variant="outline" onClick={() => setPage("settings")}>
            Settings
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-3.5 w-3.5" /> API spend
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => void refreshUsage()}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-lg font-semibold">{formatUsd(usage.todayUsd)}</div>
            <p className="text-[11px] text-muted-foreground">Today · {formatTokens(usage.todayTokens)} tok</p>
          </div>
          <div>
            <div className="text-lg font-semibold">{formatUsd(usage.monthUsd)}</div>
            <p className="text-[11px] text-muted-foreground">30 days · {formatTokens(usage.monthTokens)} tok</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Estimates from Cursor logs under your home folder. OpenAI org costs are optional and never echo the key.
        </p>
      </CardContent>
    </Card>
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
