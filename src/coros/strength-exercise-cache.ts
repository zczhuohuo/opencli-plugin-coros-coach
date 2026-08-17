import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { StrengthExerciseRow } from './coach.js';

const CACHE_VERSION = 1;
export const STRENGTH_EXERCISE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

interface CacheDocument {
  version: number;
  cachedAt: string;
  exercises: StrengthExerciseRow[];
}

export interface StrengthExerciseCache {
  get(
    refresh: boolean,
    loadFresh: () => Promise<StrengthExerciseRow[]>,
  ): Promise<StrengthExerciseRow[]>;
}

function defaultCacheFile(): string {
  const configuredRoot = process.env.XDG_CACHE_HOME?.trim();
  const cacheRoot = configuredRoot && configuredRoot.length > 0
    ? configuredRoot
    : join(homedir(), '.cache');
  return join(cacheRoot, 'opencli', 'coros-coach', 'strength-exercises-v1.json');
}

function isStrengthExerciseRow(value: unknown): value is StrengthExerciseRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return ['name', 'origin_id', 'body_parts', 'equipment', 'muscles']
    .every((field) => typeof row[field] === 'string');
}

function parseCacheDocument(value: string): CacheDocument | null {
  try {
    const document = JSON.parse(value) as Partial<CacheDocument>;
    if (
      document.version !== CACHE_VERSION
      || typeof document.cachedAt !== 'string'
      || !Array.isArray(document.exercises)
      || !document.exercises.every(isStrengthExerciseRow)
    ) {
      return null;
    }
    return document as CacheDocument;
  } catch {
    return null;
  }
}

export function createStrengthExerciseCache({
  cacheFile = defaultCacheFile(),
  ttlMs = STRENGTH_EXERCISE_CACHE_TTL_MS,
  now = Date.now,
}: {
  cacheFile?: string;
  ttlMs?: number;
  now?: () => number;
} = {}): StrengthExerciseCache {
  async function readFreshCache(): Promise<StrengthExerciseRow[] | null> {
    try {
      const document = parseCacheDocument(await readFile(cacheFile, 'utf8'));
      if (document === null) {
        return null;
      }
      const cachedAt = Date.parse(document.cachedAt);
      const age = now() - cachedAt;
      return Number.isFinite(cachedAt) && age >= 0 && age <= ttlMs
        ? document.exercises
        : null;
    } catch {
      return null;
    }
  }

  async function writeCache(exercises: StrengthExerciseRow[]): Promise<void> {
    const document: CacheDocument = {
      version: CACHE_VERSION,
      cachedAt: new Date(now()).toISOString(),
      exercises,
    };
    try {
      await mkdir(dirname(cacheFile), { recursive: true, mode: 0o700 });
      await writeFile(cacheFile, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // A read-only cache location must not make the COROS command fail.
    }
  }

  return {
    async get(refresh, loadFresh) {
      if (!refresh) {
        const cached = await readFreshCache();
        if (cached !== null) {
          return cached;
        }
      }

      const exercises = await loadFresh();
      await writeCache(exercises);
      return exercises;
    },
  };
}
