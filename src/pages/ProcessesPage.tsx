import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AppIcon } from "@/components/shared/AppIcon";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LogViewer } from "@/components/shared/LogViewer";
import { UsageRow, compactGrid } from "@/components/shared/UsageRow";
import { formatBytes, formatPercent, formatUptime } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { DevProcess, LogResult } from "@/types";

interface ProcessGroup {
  software: string;
  icon: string | null;
  cpu: number;
  memoryBytes: number;
  processes: DevProcess[];
  pids: number[];
  canStop: boolean;
  frameworks: string[];
  runtimes: string[];
  ports: number[];
  startedAt: number;
}

export function ProcessesPage() {
  const processes = useAppStore((s) => s.processes);
  const guiApps = useAppStore((s) => s.overview?.guiApps ?? []);
  const query = useAppStore((s) => s.query);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const memoryTotal = useAppStore((s) => s.overview?.system.memoryTotal ?? 0);
  const [devOnly, setDevOnly] = useState(false);
  const [confirm, setConfirm] = useState<
    { kind: "group"; group: ProcessGroup } | { kind: "pid"; pid: number; name: string } | null
  >(null);
  const [stopping, setStopping] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogResult | null>(null);
  const [logFollow, setLogFollow] = useState<{ pid: number; cwd?: string } | null>(null);

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const rows = processes
      .filter((proc) => (devOnly ? proc.isDevService : true))
      .filter((proc) =>
        `${proc.displayName} ${proc.name} ${proc.software} ${proc.command} ${proc.cwd ?? ""} ${proc.framework ?? ""} ${proc.runtime ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    const map = new Map<string, ProcessGroup>();
    for (const proc of rows) {
      const key = proc.software || proc.name;
      const entry = map.get(key) ?? {
        software: key,
        icon: proc.icon ?? iconForName(key, guiApps) ?? iconForName(proc.displayName, guiApps),
        cpu: 0,
        memoryBytes: 0,
        processes: [],
        pids: [],
        canStop: false,
        frameworks: [],
        runtimes: [],
        ports: [],
        startedAt: proc.startedAt,
      };
      entry.processes.push(proc);
      entry.cpu += proc.cpu;
      entry.memoryBytes += proc.memoryBytes;
      entry.pids.push(proc.pid);
      if (!entry.icon) entry.icon = proc.icon ?? iconForName(key, guiApps);
      if (proc.framework && !entry.frameworks.includes(proc.framework)) entry.frameworks.push(proc.framework);
      if (proc.runtime && !entry.runtimes.includes(proc.runtime)) entry.runtimes.push(proc.runtime);
      for (const port of proc.ports) {
        if (!entry.ports.includes(port)) entry.ports.push(port);
      }
      if (proc.startedAt && (!entry.startedAt || proc.startedAt < entry.startedAt)) entry.startedAt = proc.startedAt;
      if (!isProtected(proc)) entry.canStop = true;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.cpu - a.cpu || b.memoryBytes - a.memoryBytes);
  }, [processes, query, devOnly, guiApps]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch checked={devOnly} onCheckedChange={setDevOnly} id="dev-only" />
          <Label htmlFor="dev-only">Developer services only</Label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {groups.length} apps · {groups.reduce((sum, group) => sum + group.pids.length, 0)} processes
        </p>
      </div>
      {groups.length === 0 ? (
        <EmptyState title="No matching processes" description="Try turning off the developer-only filter." />
      ) : (
        <div className={compactGrid}>
          {groups.map((group) => {
            const ramShare = memoryTotal ? (group.memoryBytes / memoryTotal) * 100 : 0;
            const tags = [
              ...group.frameworks.slice(0, 2),
              ...group.runtimes.slice(0, 1),
              ...group.ports.slice(0, 4).map((port) => `:${port}`),
            ];
            const extra = Math.max(0, group.ports.length - 4);
            const expanded = openKey === group.software;
            return (
              <Card key={group.software}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <AppIcon src={group.icon} name={group.software} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-tight">{group.software}</div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {group.pids.length} proc · {runningFor(group.startedAt)}
                        {group.ports.length ? ` · ${group.ports.length} ports` : ""}
                        {!group.canStop ? " · protected" : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 shrink-0 px-2"
                      disabled={!group.canStop || stopping}
                      onClick={() => setConfirm({ kind: "group", group })}
                    >
                      <Square className="h-3 w-3" />
                      Quit
                    </Button>
                  </div>
                  <UsageRow label="CPU" value={formatPercent(group.cpu)} percent={Math.min(group.cpu, 100)} />
                  <UsageRow
                    label="RAM"
                    value={`${formatBytes(group.memoryBytes)}${memoryTotal ? ` · ${ramShare.toFixed(0)}%` : ""}`}
                    percent={Math.min(ramShare, 100)}
                  />
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="px-1 py-0 text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                    {extra > 0 && (
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                        +{extra}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px]"
                      onClick={() => setOpenKey(expanded ? null : group.software)}
                    >
                      <ChevronDown className={`h-3 w-3 transition ${expanded ? "rotate-180" : ""}`} />
                      PIDs
                    </Button>
                  </div>
                  {expanded && (
                    <div className="max-h-40 space-y-1 overflow-y-auto border-t border-border pt-2">
                      {group.processes
                        .slice()
                        .sort((a, b) => b.cpu - a.cpu)
                        .slice(0, 12)
                        .map((proc) => (
                          <div key={proc.pid} className="flex items-center gap-1">
                            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                              <span className="font-mono">{proc.pid}</span> · {proc.displayName || proc.name}
                              {proc.cpu ? ` · ${formatPercent(proc.cpu)}` : ""}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={() => void api.restartProcess(proc.pid).then(refreshLive)}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={async () => {
                                setLogFollow({ pid: proc.pid, cwd: proc.cwd ?? undefined });
                                setLogs(await api.logs({ pid: proc.pid, cwd: proc.cwd ?? undefined }));
                              }}
                            >
                              Logs
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-6 px-1.5 text-[11px]"
                              disabled={isProtected(proc) || stopping}
                              onClick={() =>
                                setConfirm({ kind: "pid", pid: proc.pid, name: proc.displayName || proc.name })
                              }
                            >
                              <Square className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      {group.processes.length > 12 && (
                        <p className="text-[10px] text-muted-foreground">+{group.processes.length - 12} more</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "pid"
            ? `Stop ${confirm.name}?`
            : `Quit ${confirm?.group.software ?? "process group"} completely?`
        }
        description={
          confirm?.kind === "pid"
            ? `PID ${confirm.pid} will receive SIGTERM.`
            : `All ${confirm?.group.processes.filter((proc) => !isProtected(proc)).length ?? 0} stoppable processes will receive SIGTERM, then SIGKILL if they stay alive.`
        }
        confirmLabel={confirm?.kind === "pid" ? "Stop process" : "Quit completely"}
        onConfirm={() => {
          if (confirm?.kind === "pid") {
            void api.killProcess(confirm.pid).then(refreshLive);
            setConfirm(null);
            return;
          }
          const pids = confirm?.group.processes.filter((proc) => !isProtected(proc)).map((proc) => proc.pid) ?? [];
          setStopping(true);
          void api
            .quitCompletely(pids)
            .then(refreshLive)
            .finally(() => setStopping(false));
          setConfirm(null);
        }}
      />
      <LogViewer
        open={Boolean(logs)}
        onOpenChange={(open) => !open && setLogs(null)}
        logs={logs}
        follow={logFollow ?? undefined}
      />
    </div>
  );
}

function isProtected(proc: DevProcess): boolean {
  return ["kernel_task", "launchd", "WindowServer", "loginwindow", "FNode", "fnode"].some(
    (name) => name.toLowerCase() === proc.name.toLowerCase() || name.toLowerCase() === proc.software.toLowerCase(),
  );
}

function iconForName(name: string, apps: { name: string; icon: string | null }[]): string | null {
  const lower = name.toLowerCase();
  const exact = apps.find((app) => app.icon && app.name.toLowerCase() === lower);
  if (exact?.icon) return exact.icon;
  const prefix = apps.find(
    (app) => app.icon && (lower.startsWith(app.name.toLowerCase()) || lower.includes(app.name.toLowerCase())),
  );
  return prefix?.icon ?? null;
}

function runningFor(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  const seconds = Math.max(0, Date.now() / 1000 - epochSeconds);
  return formatUptime(seconds);
}
