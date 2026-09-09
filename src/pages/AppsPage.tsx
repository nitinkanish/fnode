import { useMemo, useState } from "react";
import { ExternalLink, FolderGit2, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppIcon } from "@/components/shared/AppIcon";
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
      `${app.name} ${app.kind} ${app.frameworks.join(" ")} ${app.runtimes.join(" ")} ${app.pids.join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [guiApps, query]);

  const filteredLocal = useMemo(() => {
    const q = query.toLowerCase();
    return localhost.filter((app) =>
      `${app.name} ${app.software} ${app.framework ?? ""} ${app.runtime ?? ""} ${app.port} ${app.project ?? ""} ${app.cwd ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [localhost, query]);

  const nextJs = filteredLocal.filter((app) => (app.framework ?? "").toLowerCase().includes("next")).length;
  const python = filteredLocal.filter((app) => (app.runtime ?? "").toLowerCase().includes("python")).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <HintCard label="Mac apps" value={String(filteredApps.length)} detail="GUI bundles you can quit" />
        <HintCard label="Local servers" value={String(filteredLocal.length)} detail="Loopback ports you can stop" />
        <HintCard
          label="Dev stacks"
          value={nextJs || python ? `${nextJs} Next.js · ${python} Python` : "None spotted"}
          detail="Detected from command line and project files"
        />
      </div>

      <Tabs defaultValue="apps">
        <TabsList>
          <TabsTrigger value="apps">Applications ({filteredApps.length})</TabsTrigger>
          <TabsTrigger value="localhost">Local servers ({filteredLocal.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="apps">
          {filteredApps.length === 0 ? (
            <EmptyState
              title="No running applications"
              description="GUI apps with a .app bundle show up here. CLI tools stay on Processes."
            />
          ) : (
            <div className="grid gap-2">
              {filteredApps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3"
                >
                  <AppIcon src={app.icon} name={app.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{app.name}</span>
                      {app.frameworks.map((item) => (
                        <Badge key={item}>{item}</Badge>
                      ))}
                      {app.runtimes.map((item) => (
                        <Badge key={item} variant="secondary">
                          {item}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPercent(app.cpu)} CPU · {formatBytes(app.memoryBytes)} · {app.processCount} processes
                      {app.ports.length ? ` · ports ${app.ports.slice(0, 4).join(", ")}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!app.canStop}
                    onClick={() => setConfirm({ kind: "app", group: app })}
                  >
                    <Square className="h-3.5 w-3.5" />
                    Quit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="localhost">
          {filteredLocal.length === 0 ? (
            <EmptyState
              title="No localhost servers"
              description="Next.js, Vite, FastAPI, and other loopback listeners appear here."
            />
          ) : (
            <div className="grid gap-2">
              {filteredLocal.map((app) => (
                <div
                  key={`${app.pid}-${app.port}-${app.address}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3"
                >
                  <AppIcon src={app.icon} name={app.framework ?? app.software} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-primary">:{app.port}</span>
                      <span className="truncate font-medium">{app.name}</span>
                      {app.framework && <Badge>{app.framework}</Badge>}
                      {app.runtime && <Badge variant="secondary">{app.runtime}</Badge>}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      {app.project && (
                        <>
                          <FolderGit2 className="h-3 w-3" />
                          {app.project}
                          <span>·</span>
                        </>
                      )}
                      {formatPercent(app.cpu)} · {formatBytes(app.memoryBytes)} · PID {app.pid}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => void api.openUrl(localhostUrl(app.port, app.address))}>
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
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "app"
            ? `Quit ${confirm.group.name}?`
            : `Stop ${confirm?.app.framework ?? confirm?.app.name ?? "local server"} on :${confirm?.app.port}?`
        }
        description={
          confirm?.kind === "app"
            ? `${confirm.group.processCount} process${confirm.group.processCount === 1 ? "" : "es"} will receive SIGTERM. macOS system apps cannot be quit from FNode.`
            : `PID ${confirm?.app.pid} will receive SIGTERM. Your project files stay on disk.`
        }
        confirmLabel={confirm?.kind === "app" ? "Quit app" : "Stop server"}
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

function HintCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
