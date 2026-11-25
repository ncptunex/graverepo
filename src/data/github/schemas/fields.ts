// Shared field schemas (design 4.6).
// Required fields are strict: a missing or wrong-type value fails the schema.
// Optional fields accept missing, null or the wrong type, and turn these into null (Req 6.2).
// Every schema reads only the fields GRAVEREPO uses. Zod objects drop all other keys,
// so email fields are never read or copied (Req 13.1).

import { z } from 'zod';

function toIsoUtc(value: string): string | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Text, with empty or whitespace-only text stored as null (Req 5.7). */
export const optionalText = z
  .string()
  .nullable()
  .catch(null)
  .transform((value) => (value !== null && value.trim() !== '' ? value : null));

/** A whole number of zero or more, or null when unknown (Req 5.4). */
export const optionalCount = z.number().int().nonnegative().nullable().catch(null);

export const optionalBoolean = z.boolean().nullable().catch(null);

/** An ISO 8601 date converted to UTC, or null (Req 5.3). */
export const optionalIsoDate = z
  .string()
  .nullable()
  .catch(null)
  .transform((value) => (value === null ? null : toIsoUtc(value)));

export const requiredIsoDate = z
  .string()
  .transform((value, context) => {
    const iso = toIsoUtc(value);
    if (iso === null) {
      context.addIssue({ code: 'custom', message: 'Not a valid date' });
      return z.NEVER;
    }
    return iso;
  });

/** Only `https://` links are kept, so the UI never renders another scheme (tech.md 9). */
export const requiredHttpsUrl = z.string().startsWith('https://');

export const optionalHttpsUrl = z
  .string()
  .nullable()
  .catch(null)
  .transform((value) => (value !== null && value.startsWith('https://') ? value : null));

export const requiredText = z.string().min(1);
