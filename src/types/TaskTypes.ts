import { z } from 'zod';

export const TaskStatusSchema = z.enum(['pending', 'in-progress', 'completed', 'cancelled', 'blocked']);
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type Task = z.infer<typeof TaskSchema>;

export const TaskListSchema = z.array(TaskSchema);
export type TaskList = z.infer<typeof TaskListSchema>;