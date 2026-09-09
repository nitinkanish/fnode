import { useMemo } from "react";
import { GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { PathDetails } from "@/components/shared/PathDetails";
import { homeRelative } from "@/lib/format";
import { APP_NAME } from "@/brand";
import { useAppStore } from "@/store/appStore";

export function ProjectsPage() {
  const projects = useAppStore((s) => s.projects);
  const query = useAppStore((s) => s.query);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const home = useAppStore((s) => s.settings?.paths.homeDir ?? s.overview?.paths.homeDir);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return projects.filter((project) =>
      `${project.name} ${project.path} ${project.framework ?? ""} ${project.language ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [projects, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{filtered.length} projects on disk</p>
        <Button variant="outline" onClick={() => void refreshProjects(true)}>
          Rescan folders
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description={`${APP_NAME} looks in ~/Projects, ~/Developer, ~/Code, ~/Documents, and ~/Desktop.`}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <Card key={project.path}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{project.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {homeRelative(project.path, home)}
                    </div>
                  </div>
                  <Badge variant={project.isRunning ? "success" : "secondary"}>
                    {project.isRunning ? "Running" : "Idle"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {project.framework && <Badge>{project.framework}</Badge>}
                  {project.language && <Badge variant="outline">{project.language}</Badge>}
                  {project.gitBranch && (
                    <Badge variant="secondary" className="gap-1">
                      <GitBranch className="h-3 w-3" />
                      {project.gitBranch}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Modified {project.lastModified ?? "unknown"}</div>
                <PathDetails path={project.path} home={home} compact />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
