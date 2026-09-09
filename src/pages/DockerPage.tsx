import { useMemo, useState } from "react";
import { Copy, ExternalLink, FolderOpen, Play, RotateCcw, Square, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LogViewer } from "@/components/shared/LogViewer";
import { compactGrid } from "@/components/shared/UsageRow";
import { formatBytes, formatStartedAt, localhostUrl } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { DockerContainer, LogResult } from "@/types";

export function DockerPage() {
  const docker = useAppStore((s) => s.docker);
  const query = useAppStore((s) => s.query);
  const refreshDocker = useAppStore((s) => s.refreshDocker);
  const [confirm, setConfirm] = useState<DockerContainer | null>(null);
  const [logs, setLogs] = useState<LogResult | null>(null);
  const [logFollow, setLogFollow] = useState<{ containerId: string } | null>(null);

  const containers = useMemo(() => {
    const q = query.toLowerCase();
    return (docker?.containers ?? []).filter((item) =>
      `${item.name} ${item.image} ${item.status} ${item.ports.join(" ")}`.toLowerCase().includes(q),
    );
  }, [docker, query]);

  const images = useMemo(() => {
    const q = query.toLowerCase();
    return (docker?.images ?? []).filter((item) => `${item.tags.join(" ")} ${item.id}`.toLowerCase().includes(q));
  }, [docker, query]);

  const volumes = useMemo(() => {
    const q = query.toLowerCase();
    return (docker?.volumes ?? []).filter((item) =>
      `${item.name} ${item.driver} ${item.mountpoint}`.toLowerCase().includes(q),
    );
  }, [docker, query]);

  const networks = useMemo(() => {
    const q = query.toLowerCase();
    return (docker?.networks ?? []).filter((item) => `${item.name} ${item.driver}`.toLowerCase().includes(q));
  }, [docker, query]);

  if (docker && !docker.available) {
    return (
      <EmptyState
        title="Docker Desktop is not running"
        description={docker.error ?? "Start Docker Desktop to inspect containers, images, volumes, and networks."}
      />
    );
  }

  const running = containers.filter((item) => item.state.toLowerCase() === "running").length;

  return (
    <Tabs defaultValue="containers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="containers">Containers ({containers.length})</TabsTrigger>
          <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
          <TabsTrigger value="volumes">Volumes ({volumes.length})</TabsTrigger>
          <TabsTrigger value="networks">Networks ({networks.length})</TabsTrigger>
        </TabsList>
        <p className="text-[11px] text-muted-foreground">{running} running</p>
      </div>

      <TabsContent value="containers" className="mt-3">
        {containers.length === 0 ? (
          <EmptyState title="No containers" description="None match the current filter." />
        ) : (
          <div className={compactGrid}>
            {containers.map((container) => {
              const isRunning = container.state.toLowerCase() === "running";
              return (
                <Card key={container.id}>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium leading-tight">{container.name}</div>
                        <p className="truncate font-mono text-[11px] text-muted-foreground" title={container.image}>
                          {container.image}
                          {container.created ? ` · ${formatStartedAt(container.created)}` : ""}
                        </p>
                      </div>
                      <Badge variant={isRunning ? "success" : "secondary"} className="shrink-0 px-1 py-0 text-[10px]">
                        {container.state}
                      </Badge>
                    </div>
                    {container.ports.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {container.ports.slice(0, 6).map((port) => {
                          const host = publishedPort(port);
                          if (host) {
                            return (
                              <button
                                key={port}
                                type="button"
                                title={port}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-secondary"
                                onClick={() => void api.openUrl(localhostUrl(host))}
                              >
                                {port}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            );
                          }
                          return (
                            <Badge key={port} variant="outline" className="px-1 py-0 font-mono text-[10px]">
                              {port}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {isRunning ? (
                        <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => setConfirm(container)}>
                          <Square className="h-3 w-3" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => void api.dockerStart(container.id).then(refreshDocker)}
                        >
                          <Play className="h-3 w-3" />
                          Start
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        onClick={() => void api.dockerRestart(container.id).then(refreshDocker)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restart
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        onClick={async () => {
                          setLogFollow({ containerId: container.id });
                          setLogs(await api.dockerLogs(container.id));
                        }}
                      >
                        Logs
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        onClick={() => void api.dockerShell(container.name)}
                      >
                        <Terminal className="h-3 w-3" />
                        Shell
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </TabsContent>

      <TabsContent value="images" className="mt-3">
        {images.length === 0 ? (
          <EmptyState title="No images" description="None match the current filter." />
        ) : (
          <div className={compactGrid}>
            {images.map((image) => (
              <Card key={image.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="truncate text-sm font-medium leading-tight">
                    {image.tags.join(", ") || image.id.slice(0, 12)}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBytes(image.size)}
                    {image.created ? ` · ${formatStartedAt(image.created)}` : ""}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => void navigator.clipboard.writeText(image.id)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy ID
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="volumes" className="mt-3">
        {volumes.length === 0 ? (
          <EmptyState title="No volumes" description="None match the current filter." />
        ) : (
          <div className={compactGrid}>
            {volumes.map((volume) => (
              <Card key={volume.name}>
                <CardContent className="space-y-2 p-3">
                  <div className="truncate text-sm font-medium leading-tight">{volume.name}</div>
                  <p className="truncate font-mono text-[11px] text-muted-foreground" title={volume.mountpoint}>
                    {volume.driver} · {volume.mountpoint}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => void api.openFolder(volume.mountpoint)}
                    >
                      <FolderOpen className="h-3 w-3" />
                      Folder
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => void navigator.clipboard.writeText(volume.mountpoint)}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="networks" className="mt-3">
        {networks.length === 0 ? (
          <EmptyState title="No networks" description="None match the current filter." />
        ) : (
          <div className={compactGrid}>
            {networks.map((network) => (
              <Card key={network.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="truncate text-sm font-medium leading-tight">{network.name}</div>
                  <p className="text-[11px] text-muted-foreground">
                    {network.driver} · {network.id.slice(0, 12)}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => void navigator.clipboard.writeText(network.id)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy ID
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Stop ${confirm?.name ?? "container"}?`}
        description="The container will be stopped via the Docker Engine API."
        confirmLabel="Stop container"
        onConfirm={() => {
          if (confirm) void api.dockerStop(confirm.id).then(refreshDocker);
          setConfirm(null);
        }}
      />
      <LogViewer
        open={Boolean(logs)}
        onOpenChange={(open) => !open && setLogs(null)}
        logs={logs}
        follow={logFollow ?? undefined}
      />
    </Tabs>
  );
}

function publishedPort(spec: string): number | null {
  if (!spec.includes("->")) return null;
  const host = spec.split("->")[0];
  const value = Number(host.split(":").pop());
  return Number.isFinite(value) && value > 0 ? value : null;
}
