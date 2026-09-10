import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FolderOpen, RotateCcw, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppIcon } from "@/components/shared/AppIcon";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LogViewer } from "@/components/shared/LogViewer";
import { UsageRow, compactGrid } from "@/components/shared/UsageRow";
import { dbKind, dbLabel, openListener } from "@/lib/databases";
import { formatBytes, formatPercent } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { LogResult, PortInfo } from "@/types";

interface PortGroup {
  key: string;
  displayName: string;
  processName: string;
  cpu: number;
  memoryBytes: number;
  ports: PortInfo[];
  pids: number[];
  icon: string | null;
  projectName: string | null;
  cwd: string | null;
}

export function PortsPage() {
  const ports = useAppStore((s) => s.ports);
  const processes = useAppStore((s) => s.overview?.processes ?? []);
  const guiApps = useAppStore((s) => s.overview?.guiApps ?? []);
  const query = useAppStore((s) => s.query);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const memoryTotal = useAppStore((s) => s.overview?.system.memoryTotal ?? 0);
  const [confirm, setConfirm] = useState<PortGroup | null>(null);
  const [logs, setLogs] = useState<LogResult | null>(null);
  const [logFollow, setLogFollow] = useState<{ pid: number; cwd?: string } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const icons = new Map<string, string>();
    for (const proc of processes) {
      if (proc.icon) icons.set(String(proc.pid), proc.icon);
    }
    const filtered = ports.filter((port) =>
      `${port.port} ${port.displayName} ${port.processName} ${port.command} ${port.cwd ?? ""} ${port.projectName ?? ""}`
        .toLowerCase()
        .includes(q),
    );
    const map = new Map<string, PortGroup>();
    for (const port of filtered) {
      const key = port.displayName || port.processName;
      const entry = map.get(key) ?? {
        key,
        displayName: port.displayName || port.processName,
        processName: port.processName,
        cpu: 0,
        memoryBytes: 0,
        ports: [],
        pids: [],
        icon:
          icons.get(String(port.pid)) ??
          iconForName(port.displayName, guiApps) ??
          iconForName(port.processName, guiApps) ??
          null,
        projectName: port.projectName,
        cwd: port.cwd,
      };
      entry.ports.push(port);
      if (!entry.pids.includes(port.pid)) {
        entry.pids.push(port.pid);
        entry.cpu += port.cpu;
        entry.memoryBytes += port.memoryBytes;
      }
      if (!entry.icon) {
        entry.icon =
          icons.get(String(port.pid)) ??
          iconForName(port.displayName, guiApps) ??
          iconForName(port.processName, guiApps) ??
          null;
      }
      if (!entry.projectName && port.projectName) entry.projectName = port.projectName;
      if (!entry.cwd && port.cwd) entry.cwd = port.cwd;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.ports[0].port - b.ports[0].port);
  }, [ports, processes, guiApps, query]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        {groups.length} listeners · {groups.reduce((sum, group) => sum + group.ports.length, 0)} ports · Open, restart, or stop
      </p>
      {groups.length === 0 ? (
        <EmptyState title="No matching ports" description="Nothing is listening, or the filter hid every row." />
      ) : (
        <div className={compactGrid}>
          {groups.map((group) => {
            const ramShare = memoryTotal ? (group.memoryBytes / memoryTotal) * 100 : 0;
            const expanded = openKey === group.key;
            const uniquePorts = uniqueBy(group.ports, (port) => `${port.port}-${port.address}`);
            return (
              <Card key={group.key}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <AppIcon src={group.icon} name={group.displayName} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-tight">{group.displayName}</div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {group.pids.length} proc · {uniquePorts.length} port{uniquePorts.length === 1 ? "" : "s"}
                        {group.projectName ? ` · ${group.projectName}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 shrink-0 px-2"
                      disabled={stopping}
                      onClick={() => setConfirm(group)}
                    >
                      <Square className="h-3 w-3" />
                      Stop
                    </Button>
                  </div>
                  <UsageRow label="CPU" value={formatPercent(group.cpu)} percent={Math.min(group.cpu, 100)} />
                  <UsageRow
                    label="RAM"
                    value={`${formatBytes(group.memoryBytes)}${memoryTotal ? ` · ${ramShare.toFixed(0)}%` : ""}`}
                    percent={Math.min(ramShare, 100)}
                  />
                  <div className="flex flex-wrap gap-1">
                    {uniquePorts.slice(0, 8).map((port) => {
                      const kind = dbKind(port);
                      return (
                        <button
                          key={`${port.port}-${port.address}`}
                          type="button"
                          title={
                            kind
                              ? `Open ${dbLabel(kind)} on ${port.address}:${port.port}`
                              : `${port.protocol} ${port.address}:${port.port}`
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-secondary"
                          onClick={() => void openListener(port)}
                        >
                          :{port.port}
                          {kind ? (
                            <Badge variant="outline" className="px-1 py-0 text-[9px]">
                              {dbLabel(kind)}
                            </Badge>
                          ) : (
                            <ExternalLink className="h-3 w-3" />
                          )}
                        </button>
                      );
                    })}
                    {uniquePorts.length > 8 && (
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                        +{uniquePorts.length - 8}
                      </Badge>
                    )}
                    {group.cwd && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() => void api.openFolder(group.cwd!)}
                      >
                        <FolderOpen className="h-3 w-3" />
                        Folder
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px]"
                      onClick={() => setOpenKey(expanded ? null : group.key)}
                    >
                      <ChevronDown className={`h-3 w-3 transition ${expanded ? "rotate-180" : ""}`} />
                      PIDs
                    </Button>
                  </div>
                  {expanded && (
                    <div className="space-y-1 border-t border-border pt-2">
                      {group.pids.map((pid) => {
                        const sample = group.ports.find((port) => port.pid === pid);
                        return (
                          <div key={pid} className="flex items-center gap-1">
                            <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                              {pid}
                              {sample ? ` · ${sample.processName}` : ""}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={() => void api.restartProcess(pid).then(refreshLive)}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Restart
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={async () => {
                                setLogFollow({ pid, cwd: sample?.cwd ?? group.cwd ?? undefined });
                                setLogs(await api.logs({ pid, cwd: sample?.cwd ?? group.cwd ?? undefined }));
                              }}
                            >
                              Logs
                            </Button>
                          </div>
                        );
                      })}
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
        title={`Stop ${confirm?.displayName ?? "process"}?`}
        description={`All ${confirm?.pids.length ?? 0} listening process${(confirm?.pids.length ?? 0) === 1 ? "" : "es"} will receive SIGTERM, then SIGKILL if they stay alive.`}
        confirmLabel="Stop"
        onConfirm={() => {
          const pids = confirm?.pids ?? [];
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

function iconForName(name: string, apps: { name: string; icon: string | null }[]): string | null {
  const lower = name.toLowerCase();
  const exact = apps.find((app) => app.icon && app.name.toLowerCase() === lower);
  if (exact?.icon) return exact.icon;
  const prefix = apps.find(
    (app) => app.icon && (lower.startsWith(app.name.toLowerCase()) || lower.includes(app.name.toLowerCase())),
  );
  return prefix?.icon ?? null;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}
