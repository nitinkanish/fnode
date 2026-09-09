import { useMemo, useState } from "react";
import { RotateCcw, Square, Terminal, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LogViewer } from "@/components/shared/LogViewer";
import { formatBytes } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { DockerContainer, LogResult } from "@/types";

export function DockerPage() {
  const docker = useAppStore((s) => s.docker);
  const query = useAppStore((s) => s.query);
  const refreshDocker = useAppStore((s) => s.refreshDocker);
  const [confirm, setConfirm] = useState<DockerContainer | null>(null);
  const [logs, setLogs] = useState<LogResult | null>(null);

  const containers = useMemo(() => {
    const q = query.toLowerCase();
    return (docker?.containers ?? []).filter((item) =>
      `${item.name} ${item.image} ${item.status}`.toLowerCase().includes(q),
    );
  }, [docker, query]);

  if (docker && !docker.available) {
    return (
      <EmptyState
        title="Docker Desktop is not running"
        description={docker.error ?? "Start Docker Desktop to inspect containers, images, volumes, and networks."}
      />
    );
  }

  return (
    <Tabs defaultValue="containers">
      <TabsList>
        <TabsTrigger value="containers">Containers</TabsTrigger>
        <TabsTrigger value="images">Images</TabsTrigger>
        <TabsTrigger value="volumes">Volumes</TabsTrigger>
        <TabsTrigger value="networks">Networks</TabsTrigger>
      </TabsList>
      <TabsContent value="containers">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Container</th>
                <th className="px-3 py-2 font-medium">Image</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Ports</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => {
                const running = container.state.toLowerCase() === "running";
                return (
                  <tr key={container.id} className="border-t border-border/70">
                    <td className="px-3 py-2 font-medium">{container.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{container.image}</td>
                    <td className="px-3 py-2">
                      <Badge variant={running ? "success" : "secondary"}>{container.status || container.state}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{container.ports.join(", ") || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {running ? (
                          <Button size="sm" variant="outline" onClick={() => setConfirm(container)}>
                            <Square className="h-3.5 w-3.5" /> Stop
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => void api.dockerStart(container.id).then(refreshDocker)}>
                            <Play className="h-3.5 w-3.5" /> Start
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => void api.dockerRestart(container.id).then(refreshDocker)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Restart
                        </Button>
                        <Button size="sm" variant="outline" onClick={async () => setLogs(await api.dockerLogs(container.id))}>
                          Logs
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void api.dockerShell(container.name)}>
                          <Terminal className="h-3.5 w-3.5" /> Shell
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {containers.length === 0 && (
            <div className="p-4">
              <EmptyState title="No containers" description="None match the current filter." />
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="images">
        <SimpleTable
          rows={(docker?.images ?? []).map((image) => [
            image.tags.join(", ") || image.id.slice(0, 12),
            formatBytes(image.size),
            image.id.slice(7, 19),
          ])}
          headers={["Tags", "Size", "ID"]}
        />
      </TabsContent>
      <TabsContent value="volumes">
        <SimpleTable
          rows={(docker?.volumes ?? []).map((volume) => [volume.name, volume.driver, volume.mountpoint])}
          headers={["Name", "Driver", "Mount"]}
        />
      </TabsContent>
      <TabsContent value="networks">
        <SimpleTable
          rows={(docker?.networks ?? []).map((network) => [network.name, network.driver, network.id.slice(0, 12)])}
          headers={["Name", "Driver", "ID"]}
        />
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
      <LogViewer open={Boolean(logs)} onOpenChange={(open) => !open && setLogs(null)} logs={logs} />
    </Tabs>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary/50 text-xs text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border/70">
              {row.map((cell) => (
                <td key={cell} className="px-3 py-2 font-mono text-xs">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
