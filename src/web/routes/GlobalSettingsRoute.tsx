import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Power,
  Server,
  Settings,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../api/client.js';
import { useActors, useConfig } from '../api/queries.js';
import type { ActorRef, ApiConfig } from '../api/types.js';
import { ErrorState, FullPageSpinner } from '../components/common/Feedback.js';
import { useToast } from '../components/common/Toast.js';
import { formatBytes, relativeTime } from '../lib/board.js';
import { useDensity, useLastProject, useTheme } from '../state/local.js';

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function Section({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-subtle surface p-4">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] muted">
        {icon}
        {title}
      </h2>
      {description ? <p className="mt-1 text-[11px] muted">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Definition({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] muted">
        {label}
      </dt>
      <dd className={`mt-0.5 break-all text-xs ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

export default function GlobalSettingsRoute() {
  const config = useConfig();
  const actors = useActors();

  if (config.isLoading) return <FullPageSpinner />;
  if (config.isError || !config.data) {
    return (
      <div className="flex min-h-screen items-center justify-center app-bg">
        <ErrorState
          title="Cannot load settings"
          message={config.error?.message}
          onRetry={() => void config.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg" data-testid="global-settings">
      <GlobalHeader />
      <div className="mx-auto max-w-4xl space-y-6 px-5 py-6">
        <AppearanceSection />
        <TokenSection config={config.data} />
        <ServerSection config={config.data} />
        <StartupSection config={config.data} />
        <ActorsSection actors={actors.data ?? []} />
      </div>
    </div>
  );
}

function GlobalHeader() {
  const [lastProject] = useLastProject();
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-subtle px-5 py-3 surface">
      <Settings size={16} className="muted" />
      <h1 className="text-lg font-semibold tracking-tight">Global settings</h1>
      <span className="text-[11px] muted">Local daemon · 127.0.0.1</span>
      <div className="ml-auto">
        <Link
          className="btn"
          to={lastProject ? `/projects/${lastProject}/board` : '/'}
        >
          {lastProject ? 'Back to board' : 'Home'}
        </Link>
      </div>
    </header>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();
  return (
    <Section
      title="Appearance"
      icon={<SlidersHorizontal size={12} />}
      description="These preferences are stored in this browser, not in the database."
    >
      <div className="flex flex-wrap gap-4">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Theme
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              className={`btn ${theme === 'dark' ? 'chip-active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
            <button
              type="button"
              className={`btn ${theme === 'light' ? 'chip-active' : ''}`}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Density
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              className={`btn ${density === 'compact' ? 'chip-active' : ''}`}
              onClick={() => setDensity('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={`btn ${density === 'comfortable' ? 'chip-active' : ''}`}
              onClick={() => setDensity('comfortable')}
            >
              Comfortable
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function TokenSection({ config }: { config: ApiConfig }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function getToken(): Promise<string> {
    if (token) return token;
    const result = await api.revealToken();
    setToken(result.token);
    return result.token;
  }

  async function reveal() {
    setBusy(true);
    try {
      await getToken();
      setRevealed((previous) => !previous);
    } catch (cause) {
      toast.push(message(cause, 'Could not read the MCP token'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    setBusy(true);
    try {
      const current = await getToken();
      await navigator.clipboard?.writeText(current);
      toast.push('MCP token copied to the clipboard.', 'success');
    } catch (cause) {
      toast.push(message(cause, 'Could not copy the MCP token'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const result = await api.regenerateToken();
      setToken(result.token);
      setRevealed(true);
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.push('Token regenerated. Update every MCP client with the new token.', 'success');
    } catch (cause) {
      toast.push(message(cause, 'Could not regenerate the token'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="MCP token"
      icon={<KeyRound size={12} />}
      description="Required by /mcp. The UI itself never needs it; MCP clients send it as a bearer token."
    >
      <div className="flex flex-wrap items-center gap-2">
        <code
          className="min-w-0 flex-1 break-all rounded-md border border-subtle bg-[var(--surface-2)] px-2 py-1.5 font-mono text-[11px]"
          data-testid="mcp-token"
        >
          {revealed && token ? token : '••••••••••••••••••••••••'}
        </code>
        <button
          type="button"
          className="btn"
          onClick={() => void reveal()}
          disabled={busy}
        >
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          {revealed ? 'Hide' : 'Reveal'}
        </button>
        <button type="button" className="btn" onClick={() => void copy()} disabled={busy}>
          <Copy size={13} />
          Copy
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setConfirming(true)}
          disabled={busy || confirming}
        >
          Regenerate
        </button>
      </div>
      <p className="mt-2 break-all font-mono text-[10px] muted">{config.config_path}</p>

      {confirming ? (
        <div className="mt-2 rounded-md border border-[var(--danger)] p-2 text-[11px]">
          <p className="flex items-center gap-1.5 font-medium text-[var(--danger)]">
            <Power size={12} />
            Regenerating the token disconnects existing MCP clients.
          </p>
          <p className="mt-1 muted">
            Copy the new token into each Reasonix session afterward. This cannot be
            undone.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void regenerate()}
              disabled={busy}
            >
              Regenerate token
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function ServerSection({ config }: { config: ApiConfig }) {
  const last = config.last_backup;
  return (
    <Section
      title="Server"
      icon={<Server size={12} />}
      description="Read-only runtime details. Data stays outside the repository."
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <Definition label="Version" value={config.version} />
        <Definition label="Schema" value={`v${config.schema_version}`} />
        <Definition label="Port" value={`127.0.0.1:${config.port}`} mono />
        <Definition label="Uptime" value={formatUptime(config.uptime_seconds)} />
        <Definition label="Data directory" value={config.data_dir} mono />
        <Definition label="Attachments" value={config.attachments_dir} mono />
        <Definition label="Config file" value={config.config_path} mono />
        <Definition label="Logs" value={config.log_dir} mono />
        <Definition label="Backups" value={config.backup_dir} mono />
        <Definition
          label="Last backup"
          value={
            last
              ? `${last.ok ? 'ok' : 'failed'} · ${relativeTime(last.at)} · ${formatBytes(last.size_bytes)}`
              : 'Never'
          }
        />
      </dl>
    </Section>
  );
}

function StartupSection({ config }: { config: ApiConfig }) {
  const isWindows = config.platform === 'win32';
  const install = isWindows
    ? String.raw`powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1`
    : 'bash scripts/install-startup.sh';
  const uninstall = isWindows
    ? String.raw`powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-startup.ps1`
    : 'bash scripts/uninstall-startup.sh';
  const reasonix = [
    '[[plugins]]',
    'name = "shared-context"',
    'type = "http"',
    `url = "http://127.0.0.1:${config.port}/mcp"`,
    'headers = { Authorization = "Bearer <token from MCP token above>" }',
  ].join('\n');

  return (
    <Section
      title="Startup and Reasonix"
      icon={<Power size={12} />}
      description="The daemon runs at logon in your user session so OS attachment opening works."
    >
      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            {isWindows ? 'Install / remove the logon task' : 'Install / remove the user service'}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-subtle bg-[var(--surface-2)] p-2 font-mono text-[11px]">
            {install}
            {'\n'}
            {uninstall}
            {'\n'}
            {'npm run startup:install   # platform-neutral wrapper'}
          </pre>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Reasonix plugin
          </p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-subtle bg-[var(--surface-2)] p-2 font-mono text-[11px]">
            {reasonix}
          </pre>
        </div>
        <p className="text-[10px] muted">
          {isWindows
            ? 'The task does not run before logon; after a reboot the tracker is offline until you sign in.'
            : 'The unit is bound to graphical-session.target, so the tracker is offline until you sign in to the desktop.'}{' '}
          Run <code className="font-mono">npm run build</code> before installing or updating it.
        </p>
      </div>
    </Section>
  );
}

function ActorsSection({ actors }: { actors: ActorRef[] }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <Section
      title="Actors"
      icon={<Users size={12} />}
      description="Agents are created by identify. The owner can adjust names, colors, and image capability."
    >
      <div className="space-y-1.5">
        {actors.map((actor) => (
          <ActorRow
            key={`${actor.id}:${actor.name}:${actor.color}:${actor.can_read_images}:${refreshKey}`}
            actor={actor}
            onChanged={() => setRefreshKey((value) => value + 1)}
          />
        ))}
        {actors.length === 0 ? <p className="text-xs muted">No Actors yet.</p> : null}
      </div>
    </Section>
  );
}

function ActorRow({ actor, onChanged }: { actor: ActorRef; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(actor.name);
  const [color, setColor] = useState(actor.color ?? '#64748b');
  const [canReadImages, setCanReadImages] = useState(actor.can_read_images);
  const [saving, setSaving] = useState(false);
  const dirty =
    name.trim() !== actor.name ||
    color !== (actor.color ?? '#64748b') ||
    canReadImages !== actor.can_read_images;

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.updateActor(actor.id, {
        name: name.trim(),
        color,
        can_read_images: canReadImages,
      });
      await queryClient.invalidateQueries({ queryKey: ['actors'] });
      onChanged();
      toast.push(`${name.trim()} updated.`, 'success');
    } catch (cause) {
      toast.push(message(cause, 'Could not update the Actor'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-subtle p-2">
      <input
        type="color"
        className="h-7 w-8 shrink-0 cursor-pointer rounded border border-subtle bg-transparent"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        aria-label={`Color for ${actor.name}`}
      />
      <input
        className="input min-w-40 flex-1"
        value={name}
        maxLength={64}
        onChange={(event) => setName(event.target.value)}
        aria-label={`Name for ${actor.name}`}
      />
      <span className="chip shrink-0">{actor.kind}</span>
      <label className="flex shrink-0 items-center gap-1.5 text-[11px]">
        <input
          type="checkbox"
          checked={canReadImages}
          onChange={(event) => setCanReadImages(event.target.checked)}
        />
        Vision
      </label>
      <button
        type="button"
        className="btn shrink-0"
        onClick={() => void save()}
        disabled={!dirty || saving || !name.trim()}
      >
        Save
      </button>
    </div>
  );
}