import { z } from 'zod';

export const CreateWriteupSchema = z.object({
  title: z.string().min(3, 'Minimal 3 karakter').max(200),
  ctfName: z.string().min(1).max(100),
  category: z.enum(['WEB', 'PWN', 'CRYPTO', 'FORENSICS', 'MISC', 'REV', 'OSINT']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'INSANE']),
  flag: z.string().max(255).optional(),
  description: z.string().max(5000).optional(),
});

export const UpdateWriteupSchema = CreateWriteupSchema.partial();

export const CreateStepSchema = z.object({
  description: z.string().min(1, 'Deskripsi wajib diisi').max(10000),
  command: z.string().max(5000).optional(),
  commandOutput: z.string().max(10000).optional(),
  orderIndex: z.number().int().min(0),
});

export const UpdateStepSchema = CreateStepSchema.partial();

export const ReorderStepsSchema = z.object({
  steps: z.array(z.object({
    stepId: z.string().uuid(),
    orderIndex: z.number().int().min(0),
  })).min(1),
});

export type CreateWriteupInput = z.infer<typeof CreateWriteupSchema>;
export type UpdateWriteupInput = z.infer<typeof UpdateWriteupSchema>;
export type CreateStepInput = z.infer<typeof CreateStepSchema>;
export type UpdateStepInput = z.infer<typeof UpdateStepSchema>;