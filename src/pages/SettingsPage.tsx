import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PathDetails } from "@/components/shared/PathDetails";
import { APP_AUTHOR, APP_NAME, APP_TAGLINE } from "@/brand";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const setPage = useAppStore((s) => s.setPage);
  const [apiKey, setApiKey] = useState("");
  const [roots, setRoots] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!settings) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  const rootText = roots ?? settings.projectRoots.join("\n");
  const paths = settings.paths;

  async function save() {
    const current = useAppStore.getState().settings;
    if (!current) return;
    await api.saveSettings({
      openaiEnabled: current.openaiEnabled,
      openaiModel: current.openaiModel,
      pollIntervalMs: current.pollIntervalMs,
      projectRoots: rootText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      openaiApiKey: apiKey.length > 0 ? apiKey : undefined,
    });
    setApiKey("");
    setSaved(true);
    await loadSettings();
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <img
            src="/logo.png"
            alt={APP_NAME}
            className="h-14 w-14 object-contain"
          />
          <div>
            <div className="text-lg font-semibold tracking-tight">{APP_NAME}</div>
            <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
            <p className="mt-1 text-xs text-muted-foreground">By {APP_AUTHOR}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Application folders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {APP_NAME} stores SQLite, restart logs, and settings only on this Mac. Nothing is synced.
          </p>
          <PathBlock label="App data" path={paths.dataDir} home={paths.homeDir} />
          <PathBlock label="Database" path={paths.database} home={paths.homeDir} folder={paths.dataDir} />
          <PathBlock label="Captured logs" path={paths.logsDir} home={paths.homeDir} />
          {paths.executable && (
            <PathBlock label="Executable" path={paths.executable} home={paths.homeDir} folder={parentOf(paths.executable)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Cache cleaner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cache scan and delete live in their own module, with a full explanation of the OS calls and a live log while files are removed.
          </p>
          <Button variant="outline" onClick={() => setPage("cache")}>
            Open cache cleaner
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Scanning, process control, Docker, and SQLite all stay on this Mac. Nothing is uploaded unless you opt into OpenAI below.</p>
          <p>Sensitive environment variables are never sent to the UI. Killing a process always asks for confirmation.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Live updates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="poll">Poll interval (ms)</Label>
          <Input
            id="poll"
            type="number"
            min={1000}
            value={settings.pollIntervalMs}
            onChange={(event) =>
              useAppStore.setState({
                settings: { ...settings, pollIntervalMs: Number(event.target.value) || 3000 },
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Project folders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">One absolute path per line. These are the scan roots, not the app data directory.</p>
          <Textarea rows={6} value={rootText} onChange={(event) => setRoots(event.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">OpenAI (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Enable cloud assistant</div>
              <p className="text-xs text-muted-foreground">
                Off by default. When on, a local snapshot of ports/processes/projects is sent with your question.
              </p>
            </div>
            <Switch
              checked={settings.openaiEnabled}
              onCheckedChange={(openaiEnabled) =>
                useAppStore.setState({ settings: { ...settings, openaiEnabled } })
              }
            />
          </div>
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            value={settings.openaiModel}
            onChange={(event) =>
              useAppStore.setState({
                settings: { ...settings, openaiModel: event.target.value },
              })
            }
          />
          <Label htmlFor="key">API key {settings.hasOpenaiKey ? "(stored locally)" : ""}</Label>
          <Input
            id="key"
            type="password"
            placeholder={settings.hasOpenaiKey ? "•••••••• (leave blank to keep)" : "sk-…"}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          {settings.hasOpenaiKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api.saveSettings({ openaiApiKey: "" });
                await loadSettings();
              }}
            >
              Clear stored key
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()}>Save settings</Button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}

function PathBlock({
  label,
  path,
  home,
  folder,
}: {
  label: string;
  path: string;
  home: string;
  folder?: string;
}) {
  return (
    <div className="rounded-lg border border-border/80 p-3">
      <div className="mb-2 text-sm font-medium">{label}</div>
      <PathDetails path={folder ?? path} home={home} compact showCursor={false} />
      {folder && folder !== path && (
        <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{path}</p>
      )}
    </div>
  );
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : path;
}
