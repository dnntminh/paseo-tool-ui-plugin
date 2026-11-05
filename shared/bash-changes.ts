import { z } from "zod";

export const bashChangesKind = "bash-changes";

export const bashChangesSchema = z.object({
  files: z.array(z.object({ path: z.string(), additions: z.number(), deletions: z.number() })),
  fileCount: z.number(),
  patch: z.string(),
  truncated: z.boolean(),
});

export type BashChanges = z.infer<typeof bashChangesSchema>;
