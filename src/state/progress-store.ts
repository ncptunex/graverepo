// The ritual progress store (tasks 9.1, 9.2; design 7; Req 8, 7.4).
// Saves the visitor's progress in `localStorage`, on this device only.
//
// Rules (all from the approved spec):
// - Keys start with `graverepo-progress:`. The store never reads, writes, lists or removes a
//   `graverepo:` key. The data layer owns the cache and its cleanup.
// - Key: `graverepo-progress:v1:{demo|live}:{owner}/{repo}`, lowercase official names.
// - Entries are checked with strict Zod schemas. An unknown field, a wrong type, another
//   version, `living` without a revived record, or a bad nested record makes the entry invalid.
//   An invalid entry reads as "not started", is NOT deleted, and affects no other entry (O20).
//   Only keys of the current version (`v1`) are read or listed.
// - A failed write, including a full storage, keeps the change in memory, sets the "can't save"
//   flag, retries on the next change and deletes nothing (O22).
// - `evidenceFetchedAt`, `startedAt` and `updatedAt` are set here, only on a write, following
//   design 7.3. The clock is injected.
import { z } from 'zod';
import type { ProgressSource, RevivedRecord, RitualProgress, Stage } from '../ritual/types';

export const PROGRESS_SCHEMA_VERSION = 1;
export const PROGRESS_KEY_PREFIX = 'graverepo-progress:';
const CURRENT_KEY_PREFIX = `${PROGRESS_KEY_PREFIX}v${PROGRESS_SCHEMA_VERSION}:`;

/** The part of `Storage` the store uses. Tests pass a fake. */
export type ProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;

export type ProgressRef = {
  readonly source: ProgressSource;
  /** The official owner and repository name. The store lowercases them for the key. */
  readonly owner: string;
  readonly repo: string;
};

export function progressKey(ref: ProgressRef): string {
  return `${CURRENT_KEY_PREFIX}${ref.source}:${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`;
}

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date');

/** Strict: unknown fields are rejected, never stripped (Req 8.5). */
const revivedRecordSchema: z.ZodType<RevivedRecord> = z.strictObject({
  owner: z.string().min(1),
  repo: z.string().min(1),
  url: z.string(),
  wasArchived: z.boolean(),
  source: z.enum(['demo', 'live']),
  evidenceFetchedAt: isoDate,
  requiredCount: z.number().int().nonnegative(),
  revivedAt: isoDate,
});

const STAGES = ['necropsy', 'plan', 'rising', 'living'] as const satisfies readonly Stage[];

/** The schema output must match the domain type, so the two cannot drift (checked at compile time). */
export const progressEntrySchema: z.ZodType<RitualProgress> = z
  .strictObject({
    schemaVersion: z.literal(PROGRESS_SCHEMA_VERSION),
    stage: z.enum(STAGES),
    tickedItemIds: z.array(z.string()),
    evidenceFetchedAt: isoDate,
    startedAt: isoDate,
    updatedAt: isoDate,
    revived: revivedRecordSchema.nullable(),
  })
  .refine((entry) => entry.stage !== 'living' || entry.revived !== null, 'Stage living needs a revived record');

/** What the visitor changed. The store adds the times (design 7.3). */
export type ProgressChange = {
  readonly stage: Stage;
  readonly tickedItemIds: readonly string[];
  readonly revived: RevivedRecord | null;
};

export type SaveOutcome = {
  /** The progress as it now stands, in memory and, when `saved` is true, in storage. */
  readonly progress: RitualProgress;
  /** False when the write failed. The change is kept in memory for this session. */
  readonly saved: boolean;
};

export type ProgressStore = {
  /** The saved progress, or null when there is none or the entry is invalid. Never throws. */
  read(ref: ProgressRef): RitualProgress | null;
  /** Writes one change. `referenceTime` is the session's evidence time. Never throws. */
  save(ref: ProgressRef, change: ProgressChange, referenceTime: string): SaveOutcome;
  /** Valid revived records on this device, plus ones revived in this session. Newest first. */
  listRevived(): RevivedRecord[];
  /** True while the latest write failed. Cleared by the next successful write. */
  hasSaveProblem(): boolean;
};

function defaultStorage(): ProgressStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createProgressStore(
  options: { readonly storage?: ProgressStorage | null; readonly now?: () => Date } = {},
): ProgressStore {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => new Date());
  // The session's copy. It holds changes that could not be written (O22).
  const memory = new Map<string, RitualProgress>();
  let saveProblem = false;

  /** Reads and validates one stored entry. Invalid or unreadable means null. Nothing is deleted. */
  function readStored(key: string): RitualProgress | null {
    if (storage === null) return null;
    let text: string | null;
    try {
      text = storage.getItem(key);
    } catch {
      return null;
    }
    if (text === null) return null;
    try {
      const parsed = progressEntrySchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  function current(key: string): RitualProgress | null {
    return memory.get(key) ?? readStored(key);
  }

  return {
    read(ref) {
      const key = progressKey(ref);
      const entry = current(key);
      if (entry !== null) memory.set(key, entry);
      return entry;
    },

    save(ref, change, referenceTime) {
      const key = progressKey(ref);
      const existing = current(key);
      const writeTime = now().toISOString();

      const next: RitualProgress =
        existing !== null && existing.revived !== null
          ? // After revival only the stage moves. Ticks, the revived record and
            // `evidenceFetchedAt` never change (design 7.3).
            { ...existing, stage: change.stage, updatedAt: writeTime }
          : {
              schemaVersion: PROGRESS_SCHEMA_VERSION,
              stage: change.stage,
              tickedItemIds: [...change.tickedItemIds],
              // Every write before revival, and the revival itself, records the session's evidence time.
              evidenceFetchedAt: referenceTime,
              startedAt: existing?.startedAt ?? writeTime,
              updatedAt: writeTime,
              revived: change.revived,
            };

      // The session keeps the change even when the write fails.
      memory.set(key, next);
      try {
        if (storage === null) throw new Error('No storage available');
        storage.setItem(key, JSON.stringify(next));
        saveProblem = false;
        return { progress: next, saved: true };
      } catch {
        // Full, blocked or missing storage. Nothing is deleted to make room (O22).
        saveProblem = true;
        return { progress: next, saved: false };
      }
    },

    listRevived() {
      const byKey = new Map<string, RevivedRecord>();
      // Stored entries of the current version only. Other versions and invalid entries are skipped.
      if (storage !== null) {
        try {
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key === null || !key.startsWith(CURRENT_KEY_PREFIX)) continue;
            const entry = readStored(key);
            if (entry?.revived) byKey.set(key, entry.revived);
          }
        } catch {
          // An unreadable storage lists nothing from storage. Session records still show.
        }
      }
      // Records from this session, including ones that could not be saved, win over stored ones.
      for (const [key, entry] of memory) {
        if (entry.revived) byKey.set(key, entry.revived);
      }
      return [...byKey.values()].sort((a, b) => Date.parse(b.revivedAt) - Date.parse(a.revivedAt));
    },

    hasSaveProblem: () => saveProblem,
  };
}
