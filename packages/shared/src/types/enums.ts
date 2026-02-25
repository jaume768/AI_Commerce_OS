export const TaskStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const ApprovalStatus = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const MemberRole = {
  ADMIN: 'admin',
  VIEWER: 'viewer',
} as const;
export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export const ActorType = {
  USER: 'user',
  SYSTEM: 'system',
  AGENT: 'agent',
  WORKER: 'worker',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const StoreStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
} as const;
export type StoreStatus = (typeof StoreStatus)[keyof typeof StoreStatus];

export const UserStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AssetStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const GoalStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
} as const;
export type GoalStatus = (typeof GoalStatus)[keyof typeof GoalStatus];

export const Platform = {
  SHOPIFY: 'shopify',
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const TaskType = {
  DUMMY: 'dummy',
  GENERATE_IMAGE: 'generate_image',
  UPDATE_PRODUCT: 'update_product',
  SYNC_INVENTORY: 'sync_inventory',
  PUBLISH_AD: 'publish_ad',
  GENERATE_REPORT: 'generate_report',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];
