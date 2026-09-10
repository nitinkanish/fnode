import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PathDetails } from "@/components/shared/PathDetails";
import { APP_AUTHOR, APP_BUNDLE_ID, APP_DESCRIPTION, APP_HOMEPAGE, APP_LICENSE, APP_MIN_OS, APP_NAME, APP_PRIVACY, APP_TAGLINE, APP_VERSION } from "@/brand";
import { api } from "@/services/tauri";
import { useAppStore, type SettingsTab } from "@/store/appStore";
import type { AutomationRule } from "@/types";

const selectClass =
  "flex h-7 w-full rounded-[6px] border border-border bg-input px-2.5 text-[13px] shadow-[inset_0_0.5px_0.5px_rgba(0,0,0,0.06)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const loadAutomations = useAppStore((s) => s.loadAutomations);
  const setPage = useAppStore((s) => s.setPage);
  const settingsTab = useAppStore((s) => s.settingsTab);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const [apiKey, setApiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [roots, setRoots] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadAutomations();
  }, [loadAutomations]);

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
      privacySensorsEnabled: current.privacySensorsEnabled,
      costTrackingEnabled: current.costTrackingEnabled,
      anthropicApiKey: anthropicKey.length > 0 ? anthropicKey : undefined,
    });
    setApiKey("");
    setAnthropicKey("");
    setSaved(true);
    await loadSettings();
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <img src="/logo.png" alt={APP_NAME} className="h-14 w-14 object-contain" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold tracking-tight">{APP_NAME}</div>
              <Badge variant="secondary">v{APP_VERSION}</Badge>
              <Badge variant="outline">{APP_LICENSE}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              By {APP_AUTHOR} · {APP_MIN_OS} · Apple Silicon & Intel
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={settingsTab}
        onValueChange={(value) => setSettingsTab(value as SettingsTab)}
      >
        <TabsList className="h-auto min-h-7 flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="costs">Cost tracking</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
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
                <PathBlock
                  label="Executable"
                  path={paths.executable}
                  home={paths.homeDir}
                  folder={parentOf(paths.executable)}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Cache cleaner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cache scan and delete live in their own module, with a full explanation of the OS calls and a live log
                while files are removed.
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
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Scanning, process control, Docker, and SQLite all stay on this Mac. Nothing is uploaded unless you opt
                into OpenAI below.
              </p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Camera & microphone watch</div>
                  <p className="text-xs text-muted-foreground">
                    Local `lsof` against running apps. FNode never opens the camera or mic. Off skips that extra scan.
                  </p>
                </div>
                <Switch
                  checked={settings.privacySensorsEnabled}
                  onCheckedChange={(privacySensorsEnabled) =>
                    useAppStore.setState({ settings: { ...settings, privacySensorsEnabled } })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Live updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="poll">Snapshot interval (ms)</Label>
              <Input
                id="poll"
                type="number"
                min={10000}
                max={120000}
                step={1000}
                value={settings.pollIntervalMs}
                onChange={(event) =>
                  useAppStore.setState({
                    settings: { ...settings, pollIntervalMs: Number(event.target.value) || 20000 },
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default is 20 seconds. FNode does not hammer the OS. Logs you open still follow in near real time.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Project folders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                One absolute path per line. These are the scan roots, not the app data directory.
              </p>
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
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">LLM / API cost tracker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Off by default. When on, FNode reads Cursor logs under your home Library folder and optionally OpenAI
                org costs. Keys stay in SQLite and are never echoed.
              </p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Enable cost tracking</div>
                  <p className="text-xs text-muted-foreground">Dashboard and menu bar show today / this month.</p>
                </div>
                <Switch
                  checked={settings.costTrackingEnabled}
                  onCheckedChange={(costTrackingEnabled) =>
                    useAppStore.setState({ settings: { ...settings, costTrackingEnabled } })
                  }
                />
              </div>
              <Label htmlFor="anthropic">Anthropic key {settings.hasAnthropicKey ? "(stored locally)" : ""}</Label>
              <Input
                id="anthropic"
                type="password"
                autoComplete="off"
                placeholder={settings.hasAnthropicKey ? "•••••••• (leave blank to keep)" : "sk-ant-…"}
                value={anthropicKey}
                onChange={(event) => setAnthropicKey(event.target.value)}
              />
              {settings.hasAnthropicKey && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await api.saveSettings({ anthropicApiKey: "" });
                    await loadSettings();
                  }}
                >
                  Clear Anthropic key
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                The OpenAI key on the General tab is reused for org cost fetch if present. Save this tab to apply.
              </p>
            </CardContent>
          </Card>
          <div className="flex items-center gap-3">
            <Button onClick={() => void save()}>Save settings</Button>
            {saved && <span className="text-xs text-emerald-400">Saved</span>}
          </div>
        </TabsContent>

        <TabsContent value="automations">
          <AutomationsPanel />
        </TabsContent>

        <TabsContent value="about" className="space-y-4">
          <AboutPanel dataDir={paths.dataDir} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AboutPanel({ dataDir }: { dataDir: string }) {
  const facts = [
    ["Version", `FNode ${APP_VERSION}`],
    ["Bundle ID", APP_BUNDLE_ID],
    ["License", `${APP_LICENSE} © ${APP_AUTHOR}`],
    ["Requires", APP_MIN_OS],
    ["Data", dataDir.replace(/(^\/Users\/[^/]+)/, "~")],
  ];
  const watches = [
    "Dashboard — health, CPU, RAM, disk, battery, camera/mic, 7/30-day history",
    "Apps & processes — GUI apps, localhost servers, stop / restart with confirm",
    "Ports — listening TCP joined to the process and project, DB quick-connect",
    "Projects — framework detection, git dirty / ahead / behind",
    "Docker — local UNIX socket only",
    "AI, Homebrew, cache — Ollama/LM Studio, brew outdated, home-directory caches",
    "Automations — notify or offer to stop; FNode never auto-kills",
  ];
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">What FNode is</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">{APP_DESCRIPTION}</p>
          <p className="text-sm leading-6 text-muted-foreground">{APP_PRIVACY}</p>
          <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border/80 px-3 py-2">
                <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 break-all font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void api.openHomepage()}>Open GitHub</Button>
            <Button
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(APP_HOMEPAGE).catch(() => undefined)}
            >
              Copy project URL
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">On this Mac</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
            {watches.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">How to get help</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>
            Menu bar: <span className="text-foreground">FNode → About FNode</span> for the system About panel,{" "}
            <span className="text-foreground">Help → FNode Help</span> for this page,{" "}
            <span className="text-foreground">Help → Ask FNode…</span> for the local assistant.
          </p>
          <p>
            Process control is fail-closed: home-directory paths, loopback URLs, no restart of system binaries.
            Destructive actions always ask first.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function AutomationsPanel() {
  const rules = useAppStore((s) => s.automations);
  const saveAutomation = useAppStore((s) => s.saveAutomation);
  const deleteAutomation = useAppStore((s) => s.deleteAutomation);
  const [draft, setDraft] = useState<AutomationRule>(emptyRule);
  const [error, setError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);

  async function persist(rule: AutomationRule, clearDraft = false) {
    setError(null);
    try {
      await saveAutomation(rule);
      if (clearDraft) setDraft(emptyRule());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Conditions must hold for the duration before an alert. Stop actions only offer a confirm — FNode never
            auto-kills.
          </p>
          {rules.length === 0 && <p className="text-xs text-muted-foreground">No rules yet.</p>}
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <Switch
                checked={rule.enabled}
                onCheckedChange={(enabled) => void persist({ ...rule, enabled })}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{rule.name}</div>
                <p className="text-xs text-muted-foreground">
                  {conditionLabel(rule.conditionType)} ≥ {rule.threshold}
                  {rule.conditionType === "idle_dev_server" ? "% CPU" : "%"} for {formatDuration(rule.durationSecs)} ·{" "}
                  {rule.actionType === "offer_stop" ? "offer stop" : "notify"}
                </p>
              </div>
              <Badge variant={rule.enabled ? "success" : "secondary"}>{rule.enabled ? "On" : "Off"}</Badge>
              <Button size="sm" variant="outline" className="h-7" onClick={() => setDraft({ ...rule })}>
                Edit
              </Button>
              <Button size="sm" variant="destructive" className="h-7" onClick={() => setRemoveId(rule.id)}>
                Delete
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{draft.id ? "Edit rule" : "New rule"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="rule-name">Name</Label>
          <Input
            id="rule-name"
            value={draft.name}
            maxLength={80}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="CPU over 90% for 2 min"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rule-cond">Condition</Label>
              <select
                id="rule-cond"
                className={selectClass}
                value={draft.conditionType}
                onChange={(event) => setDraft({ ...draft, conditionType: event.target.value })}
              >
                <option value="cpu_pct">CPU %</option>
                <option value="memory_pct">Memory %</option>
                <option value="idle_dev_server">Idle dev server</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-action">Action</Label>
              <select
                id="rule-action"
                className={selectClass}
                value={draft.actionType}
                onChange={(event) => setDraft({ ...draft, actionType: event.target.value })}
              >
                <option value="notify">Notify</option>
                <option value="offer_stop">Offer to stop</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-th">Threshold</Label>
              <Input
                id="rule-th"
                type="number"
                min={1}
                max={100}
                value={draft.threshold}
                onChange={(event) => setDraft({ ...draft, threshold: Number(event.target.value) || 1 })}
              />
              <p className="text-[11px] text-muted-foreground">
                {draft.conditionType === "idle_dev_server" ? "CPU at or below this %" : "Fire when at or above this %"}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-dur">Duration (seconds)</Label>
              <Input
                id="rule-dur"
                type="number"
                min={20}
                max={86400}
                value={draft.durationSecs}
                onChange={(event) => setDraft({ ...draft, durationSecs: Number(event.target.value) || 20 })}
              />
              <p className="text-[11px] text-muted-foreground">{formatDuration(draft.durationSecs)}</p>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void persist(draft, true)}>{draft.id ? "Update rule" : "Add rule"}</Button>
            {draft.id !== 0 && (
              <Button variant="outline" onClick={() => setDraft(emptyRule())}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removeId != null}
        onOpenChange={(open) => !open && setRemoveId(null)}
        title="Delete this rule?"
        description="The condition will stop evaluating on the next snapshot."
        confirmLabel="Delete"
        onConfirm={() => {
          if (removeId != null) void deleteAutomation(removeId);
          setRemoveId(null);
        }}
      />
    </div>
  );
}

function emptyRule(): AutomationRule {
  return {
    id: 0,
    enabled: true,
    name: "",
    conditionType: "cpu_pct",
    threshold: 90,
    durationSecs: 120,
    actionType: "notify",
  };
}

function conditionLabel(type: string): string {
  if (type === "memory_pct") return "RAM";
  if (type === "idle_dev_server") return "Idle server CPU";
  return "CPU";
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
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
