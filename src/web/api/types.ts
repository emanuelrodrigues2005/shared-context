export type Stage =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'cancelled';

export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export const STAGES: Stage[] = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done',
  'cancelled',
];

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

export interface ActorRef {
  id: string;
  name: string;
  kind: 'human' | 'agent';
  can_read_images: boolean;
  color: string | null;
}

export interface Module {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  usage_count?: number;
}

export interface ChildProgress {
  done: number;
  active: number;
  cancelled: number;
  total: number;
}

export interface IssueCard {
  id: string;
  key: string;
  title: string;
  stage: Stage;
  priority: Priority;
  assignee: ActorRef | null;
  module: Module | null;
  blocked: boolean;
  blocked_reason: string | null;
  attachment_count: number;
  comment_count: number;
  child_progress: ChildProgress;
  position: number;
  rev: number;
  updated_at: string;
}

export interface Link {
  id: string;
  url: string;
  label: string | null;
  created_by: ActorRef;
  created_at: string;
}

export interface Attachment {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_by: ActorRef;
  created_at: string;
  has_text: boolean;
  is_image: boolean;
}

export interface Comment {
  id: string;
  body: string;
  author: ActorRef;
  rev: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface ActivityEvent {
  id: number;
  type: string;
  project_id: string;
  issue_id: string;
  issue_key: string;
  actor: ActorRef | null;
  actor_name: string;
  at: string;
  changes: ActivityChange[];
}

export interface IssueDetail extends IssueCard {
  project: { id: string; key: string; name: string };
  number: number;
  description: string;
  parent: { id: string; key: string; title: string } | null;
  children: IssueCard[];
  links: Link[];
  attachments: Attachment[];
  comments: Comment[];
  activity: ActivityEvent[];
  created_by: ActorRef;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  blocked_at: string | null;
  blocked_by: ActorRef | null;
  latest_activity_id: number;
}

export interface StageCounts {
  backlog: number;
  todo: number;
  in_progress: number;
  review: number;
  done: number;
  cancelled: number;
}

export interface PriorityCounts {
  urgent: number;
  high: number;
  medium: number;
  low: number;
  none: number;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  root_path: string | null;
  doc_allowlist: string[];
  modules: Module[];
  counts: {
    by_stage: StageCounts;
    by_priority: PriorityCounts;
    blocked: number;
    total: number;
  };
  updated_at: string;
}

export interface BoardColumn {
  stage: Stage;
  count: number;
  has_more: boolean;
  issues: IssueCard[];
}

export interface BoardResult {
  ok: true;
  project: ProjectSummary;
  columns: BoardColumn[];
  filtered_count: number;
}

export interface ApiConfig {
  ok: true;
  version: string;
  /** `process.platform` of the daemon: `win32`, `linux`, `darwin`, … */
  platform: string;
  port: number;
  data_dir: string;
  attachments_dir: string;
  config_path: string;
  log_dir: string;
  backup_dir: string;
  backup_hour: number;
  backup_retention_days: number;
  schema_version: number;
  uptime_seconds: number;
  setup_required: boolean;
  last_backup: LastBackup | null;
}

export interface SetupResult {
  ok: true;
  actor: ActorRef;
  project: ProjectSummary | null;
}

export interface IssueListResult {
  ok: true;
  items: IssueCard[];
  next_cursor: string | null;
  total: number;
}

export interface SearchResultItem {
  project: { id: string; key: string; name: string };
  issue: IssueCard;
}

export interface TrashBatch {
  batch: string;
  deleted_at: string;
  deleted_by: ActorRef | null;
  issues: Array<{ id: string; key: string; title: string }>;
}

export interface BackupSummary {
  filename: string;
  created_at: string;
  size_bytes: number;
}

export interface LastBackup {
  at: string;
  filename: string;
  size_bytes: number;
  attachment_count: number;
  ok: boolean;
  error?: string;
}

export interface BackupListResult {
  ok: true;
  items: BackupSummary[];
  last: LastBackup | null;
}
