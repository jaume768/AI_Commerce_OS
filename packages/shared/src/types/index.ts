export * from './enums';

export interface Store {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  platform: string;
  platform_store_id?: string;
  settings: Record<string, unknown>;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name?: string;
  avatar_url?: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Membership {
  id: string;
  user_id: string;
  store_id: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export interface Goal {
  id: string;
  store_id: string;
  title: string;
  description?: string;
  goal_type?: string;
  target_value?: number;
  current_value: number;
  unit?: string;
  status: string;
  starts_at?: Date;
  ends_at?: Date;
  metadata: Record<string, unknown>;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: string;
  store_id: string;
  goal_id?: string;
  title: string;
  description?: string;
  task_type: string;
  status: string;
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error?: string;
  attempts: number;
  max_attempts: number;
  idempotency_key?: string;
  scheduled_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  created_by?: string;
  actor_type: string;
  dry_run: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface Approval {
  id: string;
  store_id: string;
  task_id?: string;
  title: string;
  description?: string;
  status: string;
  approval_type?: string;
  diff_payload: Record<string, unknown>;
  decided_by?: string;
  decided_at?: Date;
  reason?: string;
  metadata: Record<string, unknown>;
  created_by?: string;
  actor_type: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  store_id: string;
  entity_type: string;
  entity_id?: string;
  action: string;
  actor_id?: string;
  actor_type: string;
  changes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  run_id?: string;
  task_id?: string;
  trace_id?: string;
  ip_address?: string;
  created_at: Date;
}

export interface Asset {
  id: string;
  store_id: string;
  task_id?: string;
  name: string;
  asset_type?: string;
  mime_type?: string;
  size_bytes?: number;
  checksum?: string;
  storage_key: string;
  storage_bucket?: string;
  status: string;
  metadata: Record<string, unknown>;
  created_by?: string;
  actor_type: string;
  created_at: Date;
  updated_at: Date;
}

export interface MetricDaily {
  id: string;
  store_id: string;
  metric_date: Date;
  metric_type: string;
  channel?: string;
  value: number;
  unit?: string;
  dimensions: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface RequestContext {
  userId: string;
  email: string;
  storeId: string;
  role: string;
  traceId?: string;
}

export interface TaskJobData {
  taskId: string;
  storeId: string;
  taskType: string;
}
