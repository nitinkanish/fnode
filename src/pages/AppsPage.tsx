import { useMemo, useState } from "react";
import { ExternalLink, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBytes, formatPercent, localhostUrl } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { LocalhostApp, SoftwareGroup } from "@/types";

type StopTarget =
  | { kind: "app"; group: SoftwareGroup }
  | { kind: "local"; app: LocalhostApp };

export function AppsPage() {
  const overview = useAppStore((s) => s.overview);
  const query = useAppStore((s) => s.query);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const [confirm, setConfirm] = useState<StopTarget | null>(null);

  const guiApps = overview?.guiApps ?? [];
  const localhost = overview?.localhostApps ?? [];

  const filteredApps = useMemo(() => {
    const q = query.toLowerCase();
    return guiApps.filter((app) =>
      `${app.name} ${app.kind} ${app.pids.join(" ")}`.toLowerCase().includes(q),
    );
  }, [guiApps, query]);

  const filteredLocal = useMemo(() => {
    const q = query.toLowerCase();
    return localhost.filter((app) =>
      `${app.name} ${app.software} ${app.port} ${app.cwd ?? ""}`.toLowerCase().includes(q),
    );
  }, [localhost, query]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="apps">
        <TabsList>
          <TabsTrigger value="apps">Running applications ({filteredApps.length})</TabsTrigger>
          <TabsTrigger value="localhost">Localhost ({filteredLocal.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="apps">
          {filteredApps.length === 0 ? (
            <EmptyState
              title="No running applications"
              description="GUI apps with a .app bundle show up here. System processes stay on the Processes page."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Application</th>
                    <th className="px-3 py-2 font-medium">CPU</th>
                    <th className="px-3 py-2 font-medium">Memory</th>
                    <th className="px-3 py-2 font-medium">Processes</th>
                    <th className="px-3 py-2 font-medium">Ports</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.map((app) => (
                    <tr key={app.id} className="border-t border-border/70">
                      <td className="px-3 py-2">
                        <div className="font-medium">{app.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {app.pids.slice(0, 4).join(", ")}
                          {app.pids.length > 4 ? "…" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2">{formatPercent(app.cpu)}</td>
                      <td className="px-3 py-2">{formatBytes(app.memoryBytes)}</td>
                      <td className="px-3 py-2">{app.processCount}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {app.ports.length ? app.ports.join(", ") : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!app.canStop}
                          onClick={() => setConfirm({ kind: "app", group: app })}
                        >
                          <Square className="h-3.5 w-3.5" />
                          Stop
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="localhost">
          {filteredLocal.length === 0 ? (
            <EmptyState
              title="No localhost apps"
              description="Nothing is listening on loopback right now."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Port</th>
                    <th className="px-3 py-2 font-medium">App</th>
                    <th className="px-3 py-2 font-medium">Software</th>
                    <th className="px-3 py-2 font-medium">CPU</th>
                    <th className="px-3 py-2 font-medium">Memory</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filteredLocal.map((app) => (
                    <tr key={`${app.pid}-${app.port}-${app.address}`} className="border-t border-border/70">
                      <td className="px-3 py-2 font-mono text-primary">{app.port}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{app.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          PID {app.pid} · {app.address}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary">{app.software}</Badge>
                      </td>
                      <td className="px-3 py-2">{formatPercent(app.cpu)}</td>
                      <td className="px-3 py-2">{formatBytes(app.memoryBytes)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void api.openUrl(localhostUrl(app.port, app.address))}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!app.canStop}
                            onClick={() => setConfirm({ kind: "local", app })}
                          >
                            <Square className="h-3.5 w-3.5" />
                            Stop
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "app"
            ? `Stop ${confirm.group.name}?`
            : `Stop ${confirm?.app.name ?? "localhost app"}?`
        }
        description={
          confirm?.kind === "app"
            ? `${confirm.group.processCount} process${confirm.group.processCount === 1 ? "" : "es"} will receive SIGTERM. System apps cannot be stopped from FNode.`
            : `PID ${confirm?.app.pid} on port ${confirm?.app.port} will receive SIGTERM.`
        }
        confirmLabel="Stop"
        onConfirm={() => {
          if (confirm?.kind === "app") {
            void api.killProcesses(confirm.group.pids).then(refreshLive);
          } else if (confirm?.kind === "local") {
            void api.killProcess(confirm.app.pid).then(refreshLive);
          }
          setConfirm(null);
        }}
      />
    </div>
  );
}
