import { useMemo } from "react";
import { Copy, ExternalLink, FolderOpen, GitBranch, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { compactGrid } from "@/components/shared/UsageRow";
import { homeRelative, localhostUrl } from "@/lib/format";
import { APP_NAME } from "@/brand";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";

export function ProjectsPage() {
  const projects = useAppStore((s) => s.projects);
  const localhost = useAppStore((s) => s.overview?.localhostApps ?? []);
  const query = useAppStore((s) => s.query);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const home = useAppStore((s) => s.settings?.paths.homeDir ?? s.overview?.paths.homeDir);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return projects.filter((project) =>
      `${project.name} ${project.path} ${project.framework ?? ""} ${project.language ?? ""} ${project.gitBranch ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [projects, query]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {filtered.length} projects · {filtered.filter((project) => project.isRunning).length} running
        </p>
        <Button size="sm" variant="outline" className="h-7" onClick={() => void refreshProjects(true)}>
          Rescan
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description={`${APP_NAME} looks in ~/Projects, ~/Developer, ~/Code, ~/Documents, and ~/Desktop.`}
        />
      ) : (
        <div className={compactGrid}>
          {filtered.map((project) => {
            const ports = localhost.filter(
              (app) => app.cwd === project.path || app.project === project.name,
            );
            return (
              <Card key={project.path}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-tight">{project.name}</div>
                      <p className="truncate font-mono text-[11px] text-muted-foreground" title={project.path}>
                        {homeRelative(project.path, home)}
                      </p>
                    </div>
                    <Badge variant={project.isRunning || ports.length > 0 ? "success" : "secondary"} className="shrink-0 px-1 py-0 text-[10px]">
                      {project.isRunning || ports.length > 0 ? "Running" : "Idle"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {project.framework && <Badge className="px-1 py-0 text-[10px]">{project.framework}</Badge>}
                    {project.language && (
                      <Badge variant="outline" className="px-1 py-0 text-[10px]">
                        {project.language}
                      </Badge>
                    )}
                    {project.gitBranch && (
                      <Badge variant="secondary" className="gap-1 px-1 py-0 text-[10px]">
                        <GitBranch className="h-3 w-3" />
                        {project.gitBranch}
                      </Badge>
                    )}
                    {project.lastModified && (
                      <span className="text-[11px] text-muted-foreground">{project.lastModified}</span>
                    )}
                  </div>
                  {ports.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ports.slice(0, 6).map((app) => (
                        <button
                          key={`${app.pid}-${app.port}`}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-secondary"
                          onClick={() => void api.openUrl(localhostUrl(app.port, app.address))}
                        >
                          :{app.port}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => void navigator.clipboard.writeText(project.path)}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void api.openFolder(project.path)}>
                      <FolderOpen className="h-3 w-3" />
                      Finder
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void api.openTerminal(project.path)}>
                      <Terminal className="h-3 w-3" />
                      Terminal
                    </Button>
                    <Button size="sm" className="h-7 px-2" onClick={() => void api.openInCursor(project.path)}>
                      Cursor
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
