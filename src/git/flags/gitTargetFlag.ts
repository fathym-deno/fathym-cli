import { z } from 'zod';

export const GitTargetFlagSchema = z.object({
  target: z
    .string()
    .optional()
    .describe('Override the working directory for git operations'),
});
