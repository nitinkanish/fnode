import { useMemo, useState } from "react";
import { ArrowUpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { compactGrid } from "@/components/shared/UsageRow";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { BrewPackage } from "@/types";

export function BrewPage() {
  const brew = useAppStore((s) => s.brew);
  const refreshBrew = useAppStore((s) => s.refreshBrew);
  const query = useAppStore((s) => s.query);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<BrewPackage | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const packages = useMemo(() => {
    const rows = [...(brew?.formulae ?? []), ...(brew?.casks ?? [])];
    const q = query.toLowerCase();
    return rows.filter((pkg) => `${pkg.name} ${pkg.current} ${pkg.latest}`.toLowerCase().includes(q));
  }, [brew, query]);

  if (!brew) {
    return (
      <div className="space-y-3">
        <Button size="sm" variant="outline" className="h-7" onClick={() => void refreshBrew(true)}>
          Scan Homebrew
        </Button>
        <EmptyState title="Homebrew not scanned yet" description="FNode only runs brew from /opt/homebrew or /usr/local." />
      </div>
    );
  }

  if (!brew.available) {
    return <EmptyState title="Homebrew not found" description={brew.error ?? "Install Homebrew to track outdated packages."} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {packages.length} outdated · upgrade runs `brew upgrade` with a validated name only
        </p>
        <Button size="sm" variant="outline" className="h-7" disabled={Boolean(busy)} onClick={() => void refreshBrew(true)}>
          Refresh
        </Button>
      </div>
      {brew.error && <p className="text-xs text-destructive">{brew.error}</p>}
      {message && <p className="text-xs text-emerald-400">{message}</p>}
      {packages.length === 0 ? (
        <EmptyState title="All packages current" description="brew outdated returned nothing." />
      ) : (
        <div className={compactGrid}>
          {packages.map((pkg) => (
            <Card key={`${pkg.cask ? "cask" : "formula"}-${pkg.name}`}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-tight">{pkg.name}</div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {pkg.current} → {pkg.latest || "latest"}
                    </p>
                  </div>
                  <Badge variant="outline" className="px-1 py-0 text-[10px]">
                    {pkg.cask ? "cask" : "formula"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {pkg.pinned && (
                    <Badge variant="warning" className="px-1 py-0 text-[10px]">
                      Pinned
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    className="h-7 px-2"
                    disabled={pkg.pinned || Boolean(busy)}
                    onClick={() => setTarget(pkg)}
                  >
                    <ArrowUpCircle className="h-3 w-3" />
                    {busy === pkg.name ? "Upgrading…" : "Upgrade"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Upgrade ${target?.name ?? "package"}?`}
        description={
          target
            ? `FNode will run brew upgrade ${target.cask ? "--cask" : "--formula"} ${target.name}. The name must already appear in brew outdated.`
            : ""
        }
        confirmLabel="Upgrade"
        onConfirm={() => {
          const pkg = target;
          setTarget(null);
          if (!pkg) return;
          setBusy(pkg.name);
          setMessage(null);
          void api
            .brewUpgrade(pkg.name)
            .then((log) => {
              setMessage(log.trim() || `${pkg.name} upgraded.`);
              return refreshBrew(true);
            })
            .catch((err) => setMessage(err instanceof Error ? err.message : String(err)))
            .finally(() => setBusy(null));
        }}
      />
    </div>
  );
}
