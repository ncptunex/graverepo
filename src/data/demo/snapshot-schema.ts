// The shape of the demo snapshot file (data-layer design 4.8).
// The snapshot is data from outside the code, so it is checked with Zod before use.
// It keeps the GitHub responses as they were returned, apart from removed email fields and
// fields GRAVEREPO never reads. Each stored response keeps only its status and body.
import { z } from 'zod';

/** Bump when the snapshot layout changes. A snapshot with another version is rejected. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * D24 / Requirement 8.14: a snapshot of 300 KB or smaller is imported into the bundle.
 * "KB" is read as 1,000 bytes, the stricter reading.
 */
export const SNAPSHOT_BUNDLE_LIMIT_BYTES = 300_000;

const storedResponseSchema = z.object({
  status: z.number().int(),
  body: z.unknown(),
});

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date');

export const repositoryResponsesSchema = z.object({
  repo: storedResponseSchema,
  readme: storedResponseSchema,
  latestCommit: storedResponseSchema,
  /** `null` only when issues are turned off for the repository. */
  issues: storedResponseSchema.nullable(),
  branches: storedResponseSchema,
  ci: storedResponseSchema,
  rootContents: storedResponseSchema,
  /** `null` when the latest commit is outside the activity window. */
  recentAuthors: storedResponseSchema.nullable(),
  /** `null` when the root folder has no known manifest. */
  manifestCommit: storedResponseSchema.nullable(),
});

export const demoSnapshotSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  capturedAt: isoDateSchema,
  captureScriptVersion: z.string().min(1),
  apiVersion: z.string().min(1),
  /** Accounts the repositories come from. One profile response is stored for each. */
  sourceAccounts: z.array(z.string().min(1)).min(1),
  /** The curated list as requested, in order (Requirement 8.3). */
  curatedRepositories: z.array(z.string().min(1)).min(1),
  users: z.record(z.string(), storedResponseSchema),
  repositories: z.array(
    z.object({
      fullName: z.string().min(1),
      responses: repositoryResponsesSchema,
    }),
  ),
});

export type StoredResponse = z.infer<typeof storedResponseSchema>;
export type RepositoryResponses = z.infer<typeof repositoryResponsesSchema>;
export type DemoSnapshot = z.infer<typeof demoSnapshotSchema>;
