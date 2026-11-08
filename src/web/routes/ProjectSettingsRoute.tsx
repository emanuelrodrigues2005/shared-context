import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArchiveRestore,
  Database,
  Download,
  FolderKanban,
  FileText,
  Plus,
  Save,
  Settings,
  Tags,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../api/client.js';
import {
  useBackups,
  useConfig,
  useModules,
  useProjects,
  useTrash,
} from '../api/queries.js';
import type {
  ApiConfig,
  BackupListResult,
  Module,
  ProjectSummary,
  TrashBatch,
} from '../api/types.js';
import { ErrorState, FullPageSpinner } from '../components/common/Feedback.js';
import { useToast } from '../components/common/Toast.js';
import { formatBytes, relativeTime } from '../lib/board.js';
import { withSearch } from '../lib/filters.js';

const DEFAULT_DOC_ALLOWLIST = [
  'AGENTS.md',
  'CONTEXT.md',
  'README.md',
  'docs/**/*.md',
  'docs/**/*.txt',
];

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export default function ProjectSettingsRoute() {
  const { projectKey = '' } = useParams();
  const { search } = useLocation();
  const projects = useProjects();
  const modules = useModules(projectKey || undefined);
  const trash = useTrash(projectKey || undefined);
  const backups = useBackups();
  const config = useConfig();
  const project = projects.data?.find((entry) => entry.key === projectKey);

  if (projects.isLoading) return <FullPageSpinner />;
  if (projects.isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ErrorState
          title="Cannot load Projects"
          message={projects.error.message}
          onRetry={() => void projects.refetch()}
        />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ErrorState title="Project not found" message={`No Project with key ${projectKey}.`} />
      </div>
    );
  }

  return (
    <div className="scrollbar flex-1 overflow-y-auto" data-testid="project-settings">
      <header className="flex flex-wrap items-center gap-2 border-b border-subtle px-4 py-3 surface">
        <Settings size={16} className="muted" />
        <h1 className="text-lg font-semibold tracking-tight">Project settings</h1>
        <span className="chip font-mono">{project.key}</span>
        <div className="ml-auto flex items-center gap-2">
          <Link className="btn btn-ghost" to="/settings">
            Global settings
          </Link>
          <Link className="btn" to={withSearch(`/projects/${project.key}/board`, search)}>
            Back to board
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-5 py-6">
        <IdentitySection key={`identity-${project.updated_at}`} project={project} />
        <DocAllowlistSection key={`docs-${project.updated_at}`} project={project} />
        <ModulesSection
          projectKey={project.key}
          modules={modules.data ?? project.modules}
        />
        <TrashSection projectKey={project.key} batches={trash.data ?? []} />
        <DataSection
          project={project}
          config={config.data}
          backups={backups.data}
          onRefreshed={() => {
            void backups.refetch();
            void config.refetch();
          }}
        />
        <DangerSection project={project} />
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description?: string;
  children: React.ReactNode;
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

function IdentitySection({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [rootPath, setRootPath] = useState(project.root_path ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateProject(project.key, {
        name: name.trim(),
        description,
        root_path: rootPath.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.push('Project settings saved.', 'success');
    } catch (cause) {
      const text = message(cause, 'Could not save Project settings');
      setError(text);
      toast.push(text, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Identity"
      icon={<Settings size={12} />}
      description="The key is immutable. The root path is where allowlisted docs are read from."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Name
          </span>
          <input
            className="input"
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Key
          </span>
          <input className="input font-mono" value={project.key} disabled />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Root path
          </span>
          <input
            className="input font-mono"
            value={rootPath}
            placeholder="/path/to/repository"
            onChange={(event) => setRootPath(event.target.value)}
          />
          <span className="mt-1 block text-[10px] muted">
            Must exist on this machine. Leave empty to disable project docs.
          </span>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Description
          </span>
          <textarea
            className="textarea min-h-20 resize-y"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-[11px] text-[var(--danger)]">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={saving || !name.trim()}
        >
          <Save size={13} />
          Save identity
        </button>
      </div>
    </Section>
  );
}

function DocAllowlistSection({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState(project.doc_allowlist.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const allowlist = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    setSaving(true);
    setError(null);
    try {
      await api.updateProject(project.key, { doc_allowlist: allowlist });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.push('Doc allowlist saved.', 'success');
    } catch (cause) {
      const text = message(cause, 'Could not save the doc allowlist');
      setError(text);
      toast.push(text, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Docs allowlist"
      icon={<FileText size={12} />}
      description="One glob per line. Only matching files under the root path can be read."
    >
      <textarea
        className="textarea min-h-28 resize-y font-mono text-xs"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Doc allowlist"
      />
      {error ? <p className="mt-2 text-[11px] text-[var(--danger)]">{error}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setValue(DEFAULT_DOC_ALLOWLIST.join('\n'))}
          disabled={saving}
        >
          Restore defaults
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={saving}
        >
          <Save size={13} />
          Save allowlist
        </button>
      </div>
    </Section>
  );
}

function ModulesSection({
  projectKey,
  modules,
}: {
  projectKey: string;
  modules: Module[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['modules', projectKey] });
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    await queryClient.invalidateQueries({ queryKey: ['board', projectKey] });
  }

  async function addModule() {
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const result = await api.createModule(projectKey, {
        name: name.trim(),
        color,
      });
      setName('');
      await refresh();
      toast.push(
        result.created ? `Module ${result.module.name} added.` : 'Module already exists.',
        result.created ? 'success' : 'info',
      );
    } catch (cause) {
      const text = message(cause, 'Could not add the Module');
      setError(text);
      toast.push(text, 'error');
    } finally {
      setAdding(false);
    }
  }

  return (
    <Section
      title={`Modules (${modules.length})`}
      icon={<Tags size={12} />}
      description="Modules in use cannot be deleted. Renaming keeps the slug stable."
    >
      <div className="space-y-1.5">
        {modules.map((module) => (
          <ModuleRow
            key={`${module.id}:${module.name}:${module.color}:${module.usage_count ?? 0}`}
            module={module}
            onChanged={() => void refresh()}
          />
        ))}
        {modules.length === 0 ? <p className="text-xs muted">No Modules yet.</p> : null}
      </div>

      <div className="mt-3 flex items-end gap-1.5">
        <label className="flex-1 text-xs">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            New Module
          </span>
          <input
            className="input"
            value={name}
            maxLength={64}
            placeholder="API, Frontend, Infra…"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addModule();
            }}
          />
        </label>
        <input
          type="color"
          className="h-9 w-10 cursor-pointer rounded-md border border-subtle bg-transparent"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          aria-label="Module color"
        />
        <button
          type="button"
          className="btn shrink-0"
          onClick={() => void addModule()}
          disabled={adding || !name.trim()}
        >
          <Plus size={13} />
          Add
        </button>
      </div>
      {error ? <p className="mt-2 text-[11px] text-[var(--danger)]">{error}</p> : null}
    </Section>
  );
}

function ModuleRow({ module, onChanged }: { module: Module; onChanged: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(module.name);
  const [color, setColor] = useState(module.color ?? '#64748b');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const usage = module.usage_count ?? 0;
  const dirty = name.trim() !== module.name || color !== (module.color ?? '#64748b');

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.updateModule(module.id, { name: name.trim(), color });
      onChanged();
      toast.push('Module updated.', 'success');
    } catch (cause) {
      toast.push(message(cause, 'Could not update the Module'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api.deleteModule(module.id);
      setConfirmDelete(false);
      onChanged();
      toast.push('Module deleted.', 'success');
    } catch (cause) {
      toast.push(message(cause, 'Could not delete the Module'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-subtle p-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-subtle bg-transparent"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          aria-label={`Color for ${module.name}`}
        />
        <input
          className="input flex-1"
          value={name}
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
          aria-label={`Name for ${module.name}`}
        />
        <span className="chip shrink-0">{usage} Issue{usage === 1 ? '' : 's'}</span>
        <span className="shrink-0 font-mono text-[10px] muted">{module.slug}</span>
        <button
          type="button"
          className="btn btn-ghost shrink-0"
          onClick={() => void save()}
          disabled={!dirty || saving || !name.trim()}
        >
          <Save size={12} />
          Save
        </button>
        <button
          type="button"
          className="btn btn-ghost shrink-0 px-1.5 text-[var(--danger)]"
          onClick={() => setConfirmDelete(true)}
          disabled={usage > 0 || saving}
          title={usage > 0 ? 'Module is used by active Issues' : 'Delete Module'}
          aria-label={`Delete ${module.name}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {confirmDelete ? (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span>Delete this Module?</span>
          <button
            type="button"
            className="btn btn-danger px-2 py-0.5"
            onClick={() => void remove()}
            disabled={saving}
          >
            Delete
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2 py-0.5"
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TrashSection({
  projectKey,
  batches,
}: {
  projectKey: string;
  batches: TrashBatch[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmBatch, setConfirmBatch] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function restore(batch: TrashBatch) {
    setRestoring(batch.batch);
    try {
      await api.restoreTrashBatch(projectKey, batch.batch);
      setConfirmBatch(null);
      await queryClient.invalidateQueries({ queryKey: ['trash', projectKey] });
      await queryClient.invalidateQueries({ queryKey: ['board', projectKey] });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['issue-options', projectKey] });
      toast.push(
        `Restored ${batch.issues.length} Issue${batch.issues.length === 1 ? '' : 's'}.`,
        'success',
      );
    } catch (cause) {
      toast.push(message(cause, 'Could not restore the batch'), 'error');
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Section
      title={`Trash (${batches.length})`}
      icon={<ArchiveRestore size={12} />}
      description="Deleting an Issue is a soft delete. Restoring a subtree restores the whole deletion batch."
    >
      <div className="space-y-2">
        {batches.map((batch) => (
          <div key={batch.batch} className="rounded-lg border border-subtle p-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-medium">
                {batch.issues.length} Issue{batch.issues.length === 1 ? '' : 's'}
              </span>
              <span className="muted">
                deleted by {batch.deleted_by?.name ?? 'unknown'} ·{' '}
                {relativeTime(batch.deleted_at)}
              </span>
              <button
                type="button"
                className="btn btn-ghost ml-auto"
                onClick={() => setConfirmBatch(batch.batch)}
                disabled={restoring !== null}
              >
                <ArchiveRestore size={12} />
                Restore batch
              </button>
            </div>
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {batch.issues.map((issue) => (
                <li key={issue.id} className="flex gap-2">
                  <span className="font-mono text-[10px] muted">{issue.key}</span>
                  <span className="truncate">{issue.title}</span>
                </li>
              ))}
            </ul>
            {confirmBatch === batch.batch ? (
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span>Restore this deletion batch?</span>
                <button
                  type="button"
                  className="btn btn-primary px-2 py-0.5"
                  onClick={() => void restore(batch)}
                  disabled={restoring !== null}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-0.5"
                  onClick={() => setConfirmBatch(null)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {batches.length === 0 ? <p className="text-xs muted">Trash is empty.</p> : null}
      </div>
    </Section>
  );
}

function DataSection({
  project,
  config,
  backups,
  onRefreshed,
}: {
  project: ProjectSummary;
  config?: ApiConfig;
  backups?: BackupListResult;
  onRefreshed: () => void;
}) {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const last = backups?.last ?? config?.last_backup ?? null;

  async function backupNow() {
    setRunning(true);
    try {
      const result = await api.backup();
      onRefreshed();
      toast.push(
        `Backup created: ${result.backup.filename} (${formatBytes(result.backup.size_bytes)}).`,
        'success',
      );
    } catch (cause) {
      onRefreshed();
      toast.push(message(cause, 'Backup failed'), 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Section
      title="Data"
      icon={<Database size={12} />}
      description="Backups snapshot the database and mirror new attachment files. Exports are read-only snapshots."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-subtle p-3 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Last backup
          </p>
          {last ? (
            <>
              <p className="mt-1">
                {last.ok ? 'Success' : 'Failed'} · {relativeTime(last.at)}
              </p>
              <p className="mt-0.5 break-all font-mono text-[10px] muted">
                {last.filename}
              </p>
              <p className="mt-0.5 text-[10px] muted">
                {formatBytes(last.size_bytes)} · {last.attachment_count} attachment
                {last.attachment_count === 1 ? '' : 's'} mirrored
              </p>
              {last.error ? (
                <p className="mt-1 text-[10px] text-[var(--danger)]">{last.error}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 muted">No backups yet.</p>
          )}
          <button
            type="button"
            className="btn btn-primary mt-2"
            onClick={() => void backupNow()}
            disabled={running}
          >
            {running ? 'Backing up…' : 'Backup now'}
          </button>
        </div>
        <div className="rounded-lg border border-subtle p-3 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] muted">
            Export {project.key}
          </p>
          <p className="mt-1 muted">
            Markdown zip with one file per Issue, or a JSON snapshot without file bytes.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a className="btn" href={api.exportUrl(project.key, 'md')} download>
              <Download size={13} />
              Markdown zip
            </a>
            <a className="btn" href={api.exportUrl(project.key, 'json')} download>
              <Download size={13} />
              JSON
            </a>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] muted">
          Snapshots
        </p>
        <div className="mt-1 space-y-1">
          {(backups?.items ?? []).slice(0, 5).map((backup) => (
            <div
              key={backup.filename}
              className="flex items-center gap-2 rounded-md border border-subtle px-2 py-1 text-[11px]"
            >
              <span className="min-w-0 flex-1 truncate font-mono">{backup.filename}</span>
              <span className="shrink-0 muted">{relativeTime(backup.created_at)}</span>
              <span className="shrink-0 muted">{formatBytes(backup.size_bytes)}</span>
            </div>
          ))}
          {(backups?.items ?? []).length === 0 ? (
            <p className="text-xs muted">No snapshots yet.</p>
          ) : null}
        </div>
        {config ? (
          <p className="mt-2 break-all font-mono text-[10px] muted">{config.backup_dir}</p>
        ) : null}
      </div>
    </Section>
  );
}

function DangerSection({ project }: { project: ProjectSummary }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const empty = project.counts.total === 0;

  async function remove() {
    setDeleting(true);
    try {
      await api.deleteProject(project.key);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.push(`Project ${project.key} deleted.`, 'success');
      navigate('/');
    } catch (cause) {
      toast.push(message(cause, 'Could not delete the Project'), 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Section
      title="Danger zone"
      icon={<AlertTriangle size={12} />}
      description="Only a Project with no Issues, including soft-deleted ones, can be deleted."
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FolderKanban size={14} className="muted" />
        <span>
          {empty
            ? 'This Project has no active Issues.'
            : 'Remove or restore every Issue before deleting this Project.'}
        </span>
        <button
          type="button"
          className="btn btn-danger ml-auto"
          onClick={() => setConfirming(true)}
          disabled={!empty || confirming}
        >
          <Trash2 size={13} />
          Delete Project
        </button>
      </div>
      {confirming ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--danger)] p-2 text-[11px]">
          <span>
            Permanently delete <strong>{project.key}</strong> and its settings?
          </span>
          <button
            type="button"
            className="btn btn-danger px-2 py-0.5"
            onClick={() => void remove()}
            disabled={deleting}
          >
            Confirm delete
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2 py-0.5"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </Section>
  );
}