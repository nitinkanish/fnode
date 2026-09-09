import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AppIcon } from "@/components/shared/AppIcon";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LogViewer } from "@/components/shared/LogViewer";
import { PathDetails } from "@/components/shared/PathDetails";
import { formatBytes, formatPercent, formatStartedAt } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { DevProcess, LogResult } from "@/types";

export function ProcessesPage() {
  const processes = useAppStore((s) => s.processes);
  const query = useAppStore((s) => s.query);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const home = useAppStore((s) => s.settings?.paths.homeDir ?? s.overview?.paths.homeDir);
  const [devOnly, setDevOnly] = useState(false);
  const [selected, setSelected] = useState<DevProcess | null>(null);
  const [confirm, setConfirm] = useState<DevProcess | null>(null);
  const [logs, setLogs] = useState<LogResult | null>(null);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return processes
      .filter((proc) => (devOnly ? proc.isDevService : true))
      .filter((proc) =>
        `${proc.displayName} ${proc.name} ${proc.software} ${proc.command} ${proc.cwd ?? ""} ${proc.framework ?? ""} ${proc.runtime ?? ""}`
          .toLowerCase()
          .includes(q),
      );
  }, [processes, query, devOnly]);

  useEffect(() => {
    if (!selected) return;
    const next = processes.find((proc) => proc.pid === selected.pid);
    if (next) setSelected(next);
  }, [processes, selected]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={devOnly} onCheckedChange={setDevOnly} id="dev-only" />
          <Label htmlFor="dev-only">Developer services only</Label>
        </div>
        <p className="text-xs text-muted-foreground">{rows.length} processes · snapshot, not live CPU graphs</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Process</th>
                <th className="px-3 py-2 font-medium">Stack</th>
                <th className="px-3 py-2 font-medium">CPU</th>
                <th className="px-3 py-2 font-medium">Memory</th>
                <th className="px-3 py-2 font-medium">Ports</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((proc) => (
                <tr
                  key={proc.pid}
                  onClick={() => setSelected(proc)}
                  className="cursor-pointer border-t border-border/70 hover:bg-secondary/40"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <AppIcon src={proc.icon} name={proc.software || proc.displayName} size="sm" />
                      <div>
                        <div className="font-medium">{proc.displayName}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {proc.software} · PID {proc.pid}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {proc.framework && <Badge>{proc.framework}</Badge>}
                      <Badge variant="secondary">{proc.runtime ?? proc.name}</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2">{formatPercent(proc.cpu)}</td>
                  <td className="px-3 py-2">{formatBytes(proc.memoryBytes)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{proc.ports.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="p-4">
              <EmptyState title="No matching processes" description="Try turning off the developer-only filter." />
            </div>
          )}
        </div>
        <aside className="rounded-xl border border-border bg-card p-4">
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <AppIcon src={selected.icon} name={selected.software} size="lg" />
                <div>
                  <h2 className="text-lg font-semibold leading-tight">{selected.displayName}</h2>
                  <p className="text-xs text-muted-foreground">{selected.software}</p>
                </div>
              </div>
              <Meta label="Framework" value={selected.framework ?? "—"} />
              <Meta label="Runtime" value={selected.runtime ?? selected.name} />
              <Meta label="Status" value={selected.status} />
              <Meta label="Binary" value={selected.exe ?? "—"} mono />
              {selected.cwd ? (
                <PathDetails path={selected.cwd} home={home} />
              ) : (
                <Meta label="Location" value="—" />
              )}
              <Meta label="Command" value={selected.command} mono />
              <Meta label="Started" value={formatStartedAt(selected.startedAt)} />
              <Meta label="Parent PID" value={selected.parentPid ? String(selected.parentPid) : "—"} />
              {selected.safeEnv.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Safe environment</div>
                  <div className="mt-1 space-y-1">
                    {selected.safeEnv.map((env) => (
                      <div key={env.key} className="font-mono text-[11px] text-muted-foreground">
                        {env.key}={env.value}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => setLogs(await api.logs({ pid: selected.pid, cwd: selected.cwd ?? undefined }))}
                >
                  Logs
                </Button>
                <Button size="sm" variant="outline" onClick={() => void api.restartProcess(selected.pid).then(refreshLive)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restart
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirm(selected)}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a process to see framework, command, and controls.</p>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Stop ${confirm?.displayName ?? "process"}?`}
        description={`PID ${confirm?.pid} will receive SIGTERM. This cannot be undone.`}
        confirmLabel="Stop process"
        onConfirm={() => {
          if (confirm) void api.killProcess(confirm.pid).then(refreshLive);
          setConfirm(null);
        }}
      />
      <LogViewer
        open={Boolean(logs)}
        onOpenChange={(open) => !open && setLogs(null)}
        logs={logs}
        follow={selected ? { pid: selected.pid, cwd: selected.cwd ?? undefined } : undefined}
      />
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "break-all font-mono text-xs" : "text-sm"}>{value}</div>
    </div>
  );
}
