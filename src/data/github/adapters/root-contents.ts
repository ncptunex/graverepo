// Adapter for `contents` (the root folder) and the manifest detection rule (task 5.8).
// Only the root folder is checked, against a fixed list of names in a fixed order (D5, Req 4.8).
import {
  KNOWN_MANIFESTS,
  type KnownManifest,
} from '../../../../shared/github-endpoints/catalogue';
import type { HttpResponseLike } from '../http-response';
import { rootContentsSchema } from '../schemas/sections';
import type { FieldResult } from '../types';
import { available, emptyRepository, isUsableSuccess, sectionFailure } from './adapter-result';

export type RootContentsValue = {
  /** The first known manifest found in the root folder, or null. */
  readonly manifestFileName: KnownManifest | null;
};

/** GitHub answers 404 with this message for the contents of a repository with no commits. */
const EMPTY_REPOSITORY_MESSAGE = /repository is empty/i;

type RootEntry = { readonly name: string; readonly type: string };

/** Returns the first known manifest, in catalogue order, that is a file in the root folder. */
export function detectManifest(entries: readonly RootEntry[]): KnownManifest | null {
  const fileNames = new Set(entries.filter((entry) => entry.type === 'file').map((entry) => entry.name));
  return KNOWN_MANIFESTS.find((manifest) => fileNames.has(manifest)) ?? null;
}

function isEmptyRepositoryAnswer(response: HttpResponseLike): boolean {
  if (response.status !== 404 || response.bodyParseFailed) return false;
  const body = response.body;
  if (typeof body !== 'object' || body === null) return false;
  const message = (body as { message?: unknown }).message;
  return typeof message === 'string' && EMPTY_REPOSITORY_MESSAGE.test(message);
}

export function adaptRootContents(response: HttpResponseLike): FieldResult<RootContentsValue> {
  if (isEmptyRepositoryAnswer(response)) return emptyRepository();
  if (!isUsableSuccess('root-contents', response)) return sectionFailure('root-contents', response);

  const parsed = rootContentsSchema.safeParse(response.body);
  if (!parsed.success) return { status: 'unavailable', reason: 'unexpected-response' };
  return available({ manifestFileName: detectManifest(parsed.data) });
}
