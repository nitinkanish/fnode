import { useMemo, useState } from "react";
import { ExternalLink, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LogViewer } from "@/components/shared/LogViewer";
import { PathDetails } from "@/components/shared/PathDetails";
import { formatBytes, formatPercent, localhostUrl } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { LogResult, PortInfo } from "@/types";

export function PortsPage() {
  const ports = useAppStore((s) => s.ports);
  const query = useAppStore((s) => s.query);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const home = useAppStore((s) => s.settings?.paths.homeDir ?? s.overview?.paths.homeDir);
  const [selected, setSelected] = useState<PortInfo | null>(null);
  const [confirm, setConfirm] = useState<PortInfo | null>(null);
  const [logs, setLogs] = useState<LogResult | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return ports.filter((port) =>
      `${port.port} ${port.displayName} ${port.processName} ${port.command} ${port.cwd ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [ports, query]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Port</th>
              <th className="px-3 py-2 font-medium">Service</th>
              <th className="px-3 py-2 font-medium">Process</th>
              <th className="px-3 py-2 font-medium">CPU</th>
              <th className="px-3 py-2 font-medium">Memory</th>
              <th className="px-3 py-2 font-medium">Project</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((port) => (
              <tr
                key={`${port.pid}-${port.port}-${port.address}`}
                onClick={() => setSelected(port)}
                className="cursor-pointer border-t border-border/70 hover:bg-secondary/40"
              >
                <td className="px-3 py-2 font-mono text-primary">{port.port}</td>
                <td className="px-3 py-2">{port.displayName}</td>
                <td className="px-3 py-2 font-mono text-xs">{port.processName} · {port.pid}</td>
                <td className="px-3 py-2">{formatPercent(port.cpu)}</td>
                <td className="px-3 py-2">{formatBytes(port.memoryBytes)}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-xs text-muted-foreground">
                  {port.projectName ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-4">
            <EmptyState title="No matching ports" description="Nothing is listening, or the filter hid every row." />
          </div>
        )}
      </div>

      <aside className="rounded-xl border border-border bg-card p-4">
        {selected ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">localhost:{selected.port}</div>
              <h2 className="text-lg font-semibold">{selected.displayName}</h2>
            </div>
            <Meta label="Port" value={String(selected.port)} />
            <Meta label="Protocol" value={selected.protocol} />
            <Meta label="Process" value={selected.processName} />
            <Meta label="PID" value={String(selected.pid)} />
            <Meta label="CPU" value={formatPercent(selected.cpu)} />
            <Meta label="Memory" value={formatBytes(selected.memoryBytes)} />
            <Meta label="Command" value={selected.command} mono />
            {selected.cwd ? (
              <PathDetails path={selected.cwd} home={home} />
            ) : (
              <Meta label="Path" value="—" />
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={() => void api.openUrl(localhostUrl(selected.port, selected.address))}>
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const result = await api.logs({ pid: selected.pid, cwd: selected.cwd ?? undefined });
                  setLogs(result);
                }}
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
          <p className="text-sm text-muted-foreground">Select a port to inspect the owning process.</p>
        )}
      </aside>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Stop ${confirm?.displayName ?? "process"}?`}
        description={`This sends SIGTERM to PID ${confirm?.pid}. Unsaved work in that process will be lost.`}
        confirmLabel="Stop process"
        onConfirm={() => {
          if (confirm) void api.killProcess(confirm.pid).then(refreshLive);
          setConfirm(null);
        }}
      />
      <LogViewer open={Boolean(logs)} onOpenChange={(open) => !open && setLogs(null)} logs={logs} />
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

export function PortBadge({ port }: { port: number }) {
  return <Badge variant="outline" className="font-mono">{port}</Badge>;
}
