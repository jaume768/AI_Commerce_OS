import { z } from 'zod';

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  task_type: z.string().min(1),
  priority: z.number().int().min(0).max(10).default(0),
  payload: z.record(z.unknown()).default({}),
  goal_id: z.string().uuid().optional(),
  scheduled_at: z.string().datetime().optional(),
  idempotency_key: z.string().max(255).optional(),
  dry_run: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'queued', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const CreateApprovalSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  task_id: z.string().uuid().optional(),
  approval_type: z.string().optional(),
  diff_payload: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateApprovalInput = z.infer<typeof CreateApprovalSchema>;

export const UpdateApprovalSchema = z.object({
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'cancelled']),
  reason: z.string().optional(),
});
export type UpdateApprovalInput = z.infer<typeof UpdateApprovalSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;

export const StoreIdHeader = z.object({
  'x-store-id': z.string().uuid(),
});
