import { useState } from "react";
import { MessageSquare, Play, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { AiService } from "@/types";

export function AiModelsPage() {
  const services = useAppStore((s) => s.aiServices);
  const refreshAi = useAppStore((s) => s.refreshAi);
  const [confirm, setConfirm] = useState<AiService | null>(null);

  if (services.length === 0) {
    return (
      <EmptyState
        title="No local AI providers detected"
        description="Ollama, LM Studio, LocalAI, vLLM, Whisper, and Stable Diffusion are detected by port and process."
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {services.map((service) => (
        <Card key={service.provider}>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-foreground">{service.provider}</CardTitle>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {service.endpoint ?? "No HTTP endpoint"}
              </div>
            </div>
            <Badge variant={service.running ? "success" : "secondary"}>
              {service.running ? "Running" : "Stopped"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {service.models.length === 0 ? (
              <p className="text-xs text-muted-foreground">No models listed yet. Start the provider to query its local API.</p>
            ) : (
              <div className="space-y-2">
                {service.models.map((model) => (
                  <div key={model.name} className="rounded-lg bg-secondary/60 px-3 py-2">
                    <div className="text-sm font-medium">{model.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[model.size, model.parameterSize].filter(Boolean).join(" · ") || "Local model"}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {service.running ? (
                <Button size="sm" variant="destructive" disabled={!service.pid} onClick={() => setConfirm(service)}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button size="sm" onClick={() => void api.aiStart(service.provider).then(refreshAi)}>
                  <Play className="h-3.5 w-3.5" /> Start
                </Button>
              )}
              {service.endpoint && (
                <Button size="sm" variant="outline" onClick={() => void api.aiChat(service.provider, service.endpoint)}>
                  <MessageSquare className="h-3.5 w-3.5" /> Open
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
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
