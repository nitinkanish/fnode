import { useMemo, useState } from "react";
import { ExternalLink, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppIcon } from "@/components/shared/AppIcon";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBytes, formatPercent, formatUptime, localhostUrl } from "@/lib/format";
import { UsageRow, compactGrid } from "@/components/shared/UsageRow";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { LocalhostApp, SoftwareGroup } from "@/types";

type StopTarget =
  | { kind: "app"; group: SoftwareGroup }
  | { kind: "local-group"; software: string; pids: number[] };

interface LocalGroup {
  software: string;
  icon: string | null;
  apps: LocalhostApp[];
  cpu: number;
  memoryBytes: number;
  canStop: boolean;
  pids: number[];
}

export function AppsPage() {
  const overview = useAppStore((s) => s.overview);
  const query = useAppStore((s) => s.query);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const memoryTotal = overview?.system.memoryTotal ?? 0;
  const [confirm, setConfirm] = useState<StopTarget | null>(null);
  const [stopping, setStopping] = useState(false);

  const guiApps = overview?.guiApps ?? [];
  const localhost = overview?.localhostApps ?? [];

  const filteredApps = useMemo(() => {
    const q = query.toLowerCase();
    return guiApps.filter((app) =>
      `${app.name} ${app.helpers.join(" ")} ${app.bundlePath ?? ""} ${app.frameworks.join(" ")} ${app.runtimes.join(" ")} ${app.pids.join(" ")} ${app.ports.join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [guiApps, query]);

  const filteredLocal = useMemo(() => {
    const q = query.toLowerCase();
    return localhost.filter((app) =>
      `${app.name} ${app.software} ${app.framework ?? ""} ${app.runtime ?? ""} ${app.port} ${app.project ?? ""} ${app.cwd ?? ""} ${app.address}`
        .toLowerCase()
        .includes(q),
    );
  }, [localhost, query]);

  const localGroups = useMemo(() => {
    const icons = new Map<string, string>();
    for (const app of guiApps) {
      if (app.icon) icons.set(app.name.toLowerCase(), app.icon);
    }
    return groupLocalhost(filteredLocal, icons);
  }, [filteredLocal, guiApps]);

  const nextJs = filteredLocal.filter((app) => (app.framework ?? "").toLowerCase().includes("next")).length;
  const python = filteredLocal.filter((app) => (app.runtime ?? "").toLowerCase().includes("python")).length;
  const stoppableApps = filteredApps.filter((app) => app.canStop).length;

  return (
    <div className="space-y-3">
      <Tabs defaultValue="apps">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="apps">Applications ({filteredApps.length})</TabsTrigger>
            <TabsTrigger value="localhost">Local servers ({localGroups.length})</TabsTrigger>
          </TabsList>
          <p className="text-[11px] text-muted-foreground">
            {stoppableApps} can quit · {filteredLocal.length} ports
            {nextJs || python ? ` · ${nextJs} Next.js · ${python} Python` : ""}
          </p>
        </div>

        <TabsContent value="apps" className="mt-3">
          {filteredApps.length === 0 ? (
            <EmptyState
              title="No running applications"
              description="GUI apps with a .app bundle show up here. Helpers are grouped under the parent app."
            />
          ) : (
            <div className={compactGrid}>
              {filteredApps.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  memoryTotal={memoryTotal}
                  stopping={stopping}
                  onQuit={() => setConfirm({ kind: "app", group: app })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="localhost" className="mt-3">
          {localGroups.length === 0 ? (
            <EmptyState
              title="No localhost servers"
              description="Next.js, Vite, FastAPI, and other loopback listeners appear here."
            />
          ) : (
            <div className={compactGrid}>
              {localGroups.map((group) => (
                <LocalGroupCard
                  key={group.software}
                  group={group}
                  memoryTotal={memoryTotal}
                  stopping={stopping}
                  onStop={() =>
                    setConfirm({ kind: "local-group", software: group.software, pids: group.pids })
                  }
                />
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
            ? `Quit ${confirm.group.name} completely?`
            : `Stop all ${confirm?.software ?? "local"} servers?`
        }
        description={
          confirm?.kind === "app"
            ? `All ${confirm.group.processCount} processes in ${confirm.group.name}${confirm.group.helpers.length ? ` (${confirm.group.helpers.join(", ")})` : ""} will receive SIGTERM, then SIGKILL if they stay alive.`
            : `${confirm?.pids.length ?? 0} localhost process${(confirm?.pids.length ?? 0) === 1 ? "" : "es"} will be stopped. Project files stay on disk.`
        }
        confirmLabel={confirm?.kind === "app" ? "Quit completely" : "Stop all"}
        onConfirm={() => {
          const pids = confirm?.kind === "app" ? confirm.group.pids : confirm?.pids ?? [];
          setStopping(true);
          void api
            .quitCompletely(pids)
            .then(refreshLive)
            .finally(() => setStopping(false));
          setConfirm(null);
        }}
      />
    </div>
  );
}

function AppCard({
  app,
  memoryTotal,
  stopping,
  onQuit,
}: {
  app: SoftwareGroup;
  memoryTotal: number;
  stopping: boolean;
  onQuit: () => void;
}) {
  const ramShare = memoryTotal ? (app.memoryBytes / memoryTotal) * 100 : 0;
  const tags = [
    ...app.helpers.slice(0, 3),
    ...app.ports.slice(0, 3).map((port) => `:${port}`),
    ...app.frameworks.slice(0, 1),
    ...app.runtimes.slice(0, 1),
  ];
  const extra = Math.max(0, app.helpers.length - 3) + Math.max(0, app.ports.length - 3);

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <AppIcon src={app.icon} name={app.name} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight">{app.name}</div>
            <p className="truncate text-[11px] text-muted-foreground">
              {app.processCount} proc · {runningFor(app.startedAt)}
              {app.ports.length ? ` · ${app.ports.length} ports` : ""}
              {!app.canStop ? " · protected" : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 shrink-0 px-2"
            disabled={!app.canStop || stopping}
            onClick={onQuit}
          >
            <Square className="h-3 w-3" />
            Quit
          </Button>
        </div>
        <UsageRow label="CPU" value={formatPercent(app.cpu)} percent={Math.min(app.cpu, 100)} />
        <UsageRow
          label="RAM"
          value={`${formatBytes(app.memoryBytes)}${memoryTotal ? ` · ${ramShare.toFixed(0)}%` : ""}`}
          percent={Math.min(ramShare, 100)}
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag, index) => (
              <Badge key={`${tag}-${index}`} variant="outline" className="px-1 py-0 text-[10px]">
                {tag}
              </Badge>
            ))}
            {extra > 0 && (
              <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                +{extra}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LocalGroupCard({
  group,
  memoryTotal,
  stopping,
  onStop,
}: {
  group: LocalGroup;
  memoryTotal: number;
  stopping: boolean;
  onStop: () => void;
}) {
  const ramShare = memoryTotal ? (group.memoryBytes / memoryTotal) * 100 : 0;
  const first = group.apps[0];

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <AppIcon src={group.icon} name={first?.framework ?? group.software} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight">{group.software}</div>
            <p className="truncate text-[11px] text-muted-foreground">
              {group.apps.length} port{group.apps.length === 1 ? "" : "s"}
              {first?.framework ? ` · ${first.framework}` : ""}
              {first?.runtime ? ` · ${first.runtime}` : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 shrink-0 px-2"
            disabled={!group.canStop || stopping}
            onClick={onStop}
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
          {group.apps.slice(0, 6).map((app) => (
            <button
              key={`${app.pid}-${app.port}-${app.address}`}
              type="button"
              title={app.project ? `${app.name} · ${app.project}` : app.name}
              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-secondary"
              onClick={() => void api.openUrl(localhostUrl(app.port, app.address))}
            >
              :{app.port}
              <ExternalLink className="h-3 w-3" />
            </button>
          ))}
          {group.apps.length > 6 && (
            <Badge variant="secondary" className="px-1 py-0 text-[10px]">
              +{group.apps.length - 6}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function groupLocalhost(apps: LocalhostApp[], icons: Map<string, string>): LocalGroup[] {
  const map = new Map<string, LocalGroup>();
  for (const app of apps) {
    const key = app.software || app.name;
    const entry = map.get(key) ?? {
      software: key,
      icon: app.icon ?? icons.get(key.toLowerCase()) ?? null,
      apps: [],
      cpu: 0,
      memoryBytes: 0,
      canStop: false,
      pids: [],
    };
    entry.apps.push(app);
    entry.cpu += app.cpu;
    entry.memoryBytes += app.memoryBytes;
    entry.canStop = entry.canStop || app.canStop;
    if (!entry.icon) {
      entry.icon = app.icon ?? icons.get(key.toLowerCase()) ?? null;
    }
    if (!entry.pids.includes(app.pid)) entry.pids.push(app.pid);
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.cpu - a.cpu || a.software.localeCompare(b.software));
}

function runningFor(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  const seconds = Math.max(0, Date.now() / 1000 - epochSeconds);
  return formatUptime(seconds);
}
