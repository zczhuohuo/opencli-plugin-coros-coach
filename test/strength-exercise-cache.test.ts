import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { StrengthExerciseRow } from '../src/coros/coach.js';
import {
  createStrengthExerciseCache,
  STRENGTH_EXERCISE_CACHE_TTL_MS,
} from '../src/coros/strength-exercise-cache.js';

const EXERCISES: StrengthExerciseRow[] = [{
  name: '深蹲',
  origin_id: 'squat-id',
  body_parts: '臀腿',
  equipment: '徒手',
  muscles: '股四头肌',
}];

test('strength exercise cache reuses fresh data and refreshes after seven days', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coros-cache-'));
  let now = Date.parse('2026-08-17T00:00:00.000Z');
  let loads = 0;
  const cache = createStrengthExerciseCache({
    cacheFile: join(directory, 'strength-exercises.json'),
    now: () => now,
  });
  const loadFresh = async () => {
    loads += 1;
    return EXERCISES;
  };

  assert.deepEqual(await cache.get(false, loadFresh), EXERCISES);
  assert.deepEqual(await cache.get(false, loadFresh), EXERCISES);
  assert.equal(loads, 1);

  now += STRENGTH_EXERCISE_CACHE_TTL_MS + 1;
  assert.deepEqual(await cache.get(false, loadFresh), EXERCISES);
  assert.equal(loads, 2);
});

test('strength exercise cache supports an explicit refresh', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coros-cache-'));
  let loads = 0;
  const cache = createStrengthExerciseCache({
    cacheFile: join(directory, 'strength-exercises.json'),
  });
  const loadFresh = async () => {
    loads += 1;
    return EXERCISES.map((exercise) => ({ ...exercise, origin_id: `squat-${loads}` }));
  };

  const first = await cache.get(false, loadFresh);
  const refreshed = await cache.get(true, loadFresh);

  assert.equal(first[0]?.origin_id, 'squat-1');
  assert.equal(refreshed[0]?.origin_id, 'squat-2');
  assert.equal(loads, 2);
});
