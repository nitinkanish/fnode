import { useMemo, useState } from "react";
import { Copy, MessageSquare, Play, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { compactGrid } from "@/components/shared/UsageRow";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { AiService } from "@/types";

export function AiModelsPage() {
  const services = useAppStore((s) => s.aiServices);
  const query = useAppStore((s) => s.query);
  const refreshAi = useAppStore((s) => s.refreshAi);
  const [confirm, setConfirm] = useState<AiService | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return services.filter((service) =>
      `${service.provider} ${service.endpoint ?? ""} ${service.models.map((model) => model.name).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [services, query]);

  if (services.length === 0) {
    return (
      <EmptyState
        title="No local AI providers detected"
        description="Ollama, LM Studio, LocalAI, vLLM, Whisper, and Stable Diffusion are detected by port and process."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        {filtered.filter((s) => s.running).length} running · {filtered.reduce((sum, s) => sum + s.models.length, 0)}{" "}
        models · {filtered.reduce((sum, s) => sum + s.loadedCount, 0)} in memory
      </p>
      <div className={compactGrid}>
        {filtered.map((service) => (
          <Card key={service.provider}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-tight">{service.provider}</div>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {service.endpoint ?? "No HTTP endpoint"}
                    {service.version ? ` · v${service.version}` : ""}
                    {service.pid ? ` · PID ${service.pid}` : ""}
                  </p>
                </div>
                {service.running ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 shrink-0 px-2"
                    disabled={!service.pid}
                    onClick={() => setConfirm(service)}
                  >
                    <Square className="h-3 w-3" />
                    Stop
                  </Button>
                ) : (
                  <Button size="sm" className="h-7 shrink-0 px-2" onClick={() => void api.aiStart(service.provider).then(refreshAi)}>
                    <Play className="h-3 w-3" />
                    Start
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant={service.running ? "success" : "secondary"} className="px-1 py-0 text-[10px]">
                  {service.running ? "Running" : "Stopped"}
                </Badge>
                <Badge variant="outline" className="px-1 py-0 text-[10px]">
                  {service.loadedCount}/{service.models.length} loaded
                </Badge>
                {service.endpoint && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={() => void api.aiChat(service.provider, service.endpoint)}
                  >
                    <MessageSquare className="h-3 w-3" />
                    Open
                  </Button>
                )}
                {service.endpoint && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={() => void navigator.clipboard.writeText(service.endpoint ?? "")}
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                )}
              </div>
              {service.models.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No models listed yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {service.models.slice(0, 10).map((model) => (
                    <Badge
                      key={model.name}
                      variant={model.loaded ? "success" : "outline"}
                      className="max-w-full px-1 py-0 text-[10px]"
                      title={[model.family, model.parameterSize, model.quantization, model.size, model.format]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {model.name}
                      {model.parameterSize ? ` · ${model.parameterSize}` : ""}
                    </Badge>
                  ))}
                  {service.models.length > 10 && (
                    <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                      +{service.models.length - 10}
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Stop ${confirm?.provider ?? "provider"}?`}
        description="The local AI process will receive SIGTERM."
        confirmLabel="Stop"
        onConfirm={() => {
          if (confirm?.pid) void api.aiStop(confirm.pid).then(refreshAi);
          setConfirm(null);
        }}
      />
    </div>
  );
}
