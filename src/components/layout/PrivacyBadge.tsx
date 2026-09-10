import { Camera, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/appStore";

export function PrivacyBadge() {
  const privacy = useAppStore((s) => s.overview?.privacy);
  const enabled = useAppStore((s) => s.settings?.privacySensorsEnabled ?? true);
  if (!enabled || !privacy) return null;

  const camera = privacy.cameraActive;
  const mic = privacy.microphoneActive;
  if (!camera && !mic) {
    return (
      <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
        Sensors idle
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {camera && (
        <Badge variant="danger" className="gap-1 px-1.5 py-0 text-[10px]" title={privacy.cameraApps.map((app) => app.software).join(", ")}>
          <Camera className="h-3 w-3" />
          Cam
        </Badge>
      )}
      {mic && (
        <Badge variant="warning" className="gap-1 px-1.5 py-0 text-[10px]" title={privacy.microphoneApps.map((app) => app.software).join(", ")}>
          <Mic className="h-3 w-3" />
          Mic
        </Badge>
      )}
    </div>
  );
}
