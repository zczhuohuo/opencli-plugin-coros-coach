import assert from 'node:assert/strict';
import test from 'node:test';

import type { IPage } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../src/coros/coach.js';

type PageAdapter = Pick<IPage, 'fetchJson' | 'goto' | 'wait'>;
type Route = unknown | ((options: Record<string, unknown>) => unknown);

class FakePage implements PageAdapter {
  readonly requests: Array<{ path: string; options: Record<string, unknown> }> = [];
  readonly navigations: string[] = [];
  readonly waits: unknown[] = [];

  constructor(private readonly routes: Record<string, Route>) {}

  async goto(url: string): Promise<void> {
    this.navigations.push(url);
  }

  async wait(options: unknown): Promise<void> {
    this.waits.push(options);
  }

  async fetchJson(url: string, options: Record<string, unknown> = {}): Promise<unknown> {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    this.requests.push({ path, options });

    if (path === '/account/refresh') {
      return { result: '0000', data: { accessToken: 'test-token' } };
    }

    const route = this.routes[path];
    if (route === undefined) {
      throw new Error(`Unexpected COROS request: ${path}`);
    }

    const data = typeof route === 'function' ? route(options) : route;
    if (parsed.hostname === 'staticcn.coros.com') {
      return data;
    }
    return { result: '0000', data };
  }
}

test('listSchedule returns normalized planned and completed sessions', async () => {
  const query = '/training/schedule/query?startDate=20260817&endDate=20260823&supportRestExercise=1';
  const page = new FakePage({
    [query]: {
      programs: [{
        idInPlan: 9,
        name: 'Easy run',
        sportType: 1,
        duration: 2_400,
        distance: 520_000,
        trainingLoad: 42,
      }],
      entities: [{ idInPlan: 9, happenDay: '20260818' }],
      sportDatasNotInPlan: [{
        happenDay: '20260819',
        name: 'Morning run',
        sportType: 1,
        duration: 1_800,
        distance: 400_000,
        trainingLoad: 35,
      }],
    },
  });

  const result = await createCorosCoach(page).listSchedule({
    startDate: '20260817',
    endDate: '20260823',
    includeCompleted: true,
  });

  assert.deepEqual(result, [
    {
      date: '20260818',
      kind: 'planned',
      name: 'Easy run',
      sport_type: 1,
      duration_min: 40,
      distance_km: 5.2,
      training_load: 42,
    },
    {
      date: '20260819',
      kind: 'completed',
      name: 'Morning run',
      sport_type: 1,
      duration_min: 30,
      distance_km: 4,
      training_load: 35,
    },
  ]);
  assert.equal(page.navigations.length, 1);
  assert.equal(page.waits.length, 1);
});

test('listSchedule rejects invalid ranges before opening a browser session', async () => {
  const page = new FakePage({});
  const coach = createCorosCoach(page);

  await assert.rejects(
    coach.listSchedule({ startDate: '20260230', endDate: '20260301' }),
    /valid calendar date/,
  );
  await assert.rejects(
    coach.listSchedule({ startDate: '20260824', endDate: '20260823' }),
    /must not be after/,
  );
  assert.equal(page.navigations.length, 0);
  assert.equal(page.requests.length, 0);
});

test('listStrengthExercises returns the live account catalog with readable metadata', async () => {
  const page = new FakePage({
    '/account/query': { userId: 'user-7', userProfile: { language: 'zh-CN' } },
    '/locale/coros-traininghub-v2/zh-CN.prod.json?locale=zh-CN': {
      T1061: '深蹲',
    },
    '/training/exercise/query?userId=user-7&sportType=4': [{
      id: 'strength-1',
      name: 'T1061',
      partText: ['Glutes & Legs'],
      equipmentText: ['Bodyweight'],
      muscleText: ['Hamstrings', 'Quadriceps'],
      sortNo: 2,
    }],
  });

  const result = await createCorosCoach(page).listStrengthExercises();

  assert.deepEqual(result, [{
    name: '深蹲',
    origin_id: 'strength-1',
    body_parts: 'Glutes & Legs',
    equipment: 'Bodyweight',
    muscles: 'Hamstrings, Quadriceps',
  }]);
});

test('addRun dry-run calculates a payload without updating the schedule', async () => {
  const query = '/training/schedule/query?startDate=20260817&endDate=20260817&supportRestExercise=1';
  let calculatedProgram: Record<string, unknown> | undefined;
  const page = new FakePage({
    [query]: { maxIdInPlan: 12 },
    '/account/query': { zoneData: { lthr: 180 } },
    '/training/program/calculate': (options: Record<string, unknown>) => {
      calculatedProgram = options.body as Record<string, unknown>;
      return {
        planDistance: 650_000,
        distanceDisplayUnit: 1,
        planDuration: 2_400,
        exerciseBarChart: [1, 2],
        planPitch: 0,
        planTrainingLoad: 51,
      };
    },
  });

  const result = await createCorosCoach(page).addRun({
    date: '20260817',
    name: '  Easy run  ',
    duration: '00:40:00',
    description: 'Stay relaxed',
    low: 80,
    high: 88,
    dryRun: true,
  });

  assert.equal(result.status, 'calculated, not saved');
  assert.equal(result.name, 'Easy run');
  assert.equal(result.distance_km, 6.5);
  assert.equal(calculatedProgram?.idInPlan, 13);
  assert.equal(calculatedProgram?.overview, 'Stay relaxed');
  assert.equal(result.payload?.entities[0]?.happenDay, '20260817');
  assert.equal(
    page.requests.some(({ path }) => path === '/training/schedule/update'),
    false,
  );
});

test('addRun persists the calculated payload when dryRun is false', async () => {
  const query = '/training/schedule/query?startDate=20260817&endDate=20260817&supportRestExercise=1';
  let updateBody: unknown;
  const page = new FakePage({
    [query]: { maxPlanProgramId: 4 },
    '/account/query': { zoneData: { lthr: 175 } },
    '/training/program/calculate': {
      planDistance: 500_000,
      planDuration: 1_800,
      planTrainingLoad: 40,
    },
    '/training/schedule/update': (options: Record<string, unknown>) => {
      updateBody = options.body;
      return {};
    },
  });

  const result = await createCorosCoach(page).addRun({
    date: '20260817',
    name: 'Recovery run',
    duration: '00:30:00',
    low: 75,
    high: 82,
  });

  assert.equal(result.status, 'saved');
  assert.equal(result.payload, undefined);
  assert.equal((updateBody as { programs: Array<{ idInPlan: number }> }).programs[0]?.idInPlan, 5);
});

test('addStrength resolves live actions and previews a COROS strength payload', async () => {
  const query = '/training/schedule/query?startDate=20260816&endDate=20260816&supportRestExercise=1';
  const catalogQuery = '/training/exercise/query?userId=user-8&sportType=4';
  let calculatedProgram: Record<string, unknown> | undefined;
  const page = new FakePage({
    [query]: { maxIdInPlan: 20 },
    '/account/query': { userId: 'user-8', userProfile: { language: 'zh-CN' } },
    '/locale/coros-traininghub-v2/zh-CN.prod.json?locale=zh-CN': {
      T1061: '深蹲',
      T1033: '臀桥',
    },
    [catalogQuery]: [
      { id: 'squat-id', name: 'T1061', exerciseType: 2, sortNo: 1 },
      { id: 'bridge-id', name: 'T1033', exerciseType: 2, sortNo: 2 },
    ],
    '/training/program/calculate': (options: Record<string, unknown>) => {
      calculatedProgram = options.body as Record<string, unknown>;
      return {
        planDuration: 2_040,
        planSets: 6,
        planTrainingLoad: 28,
      };
    },
  });

  const result = await createCorosCoach(page).addStrength({
    date: '20260816',
    name: ' Full body strength ',
    exercises: '深蹲, 臀桥',
    sets: 3,
    reps: 10,
    weightKg: 0,
    rest: '00:01:00',
    targetDuration: '00:35:00',
    description: 'Warm up, push, pull, core, and cool down.',
    dryRun: true,
  });

  assert.equal(result.status, 'calculated, not saved');
  assert.equal(result.estimated_duration, '00:34:00');
  assert.equal(result.target_duration, '00:35:00');
  assert.equal(calculatedProgram?.sportType, 4);
  assert.equal(calculatedProgram?.idInPlan, 21);
  assert.equal(calculatedProgram?.overview, 'Warm up, push, pull, core, and cool down.');
  const exercises = calculatedProgram?.exercises as Array<Record<string, unknown>>;
  assert.deepEqual(exercises.map(({ originId }) => originId), ['squat-id', 'bridge-id']);
  assert.deepEqual(exercises.map(({ name }) => name), ['T1061', 'T1033']);
  assert.deepEqual(exercises.map(({ sets }) => sets), [3, 3]);
  assert.deepEqual(exercises.map(({ targetValue }) => targetValue), [10, 10]);
  assert.deepEqual(exercises.map(({ intensityValue }) => intensityValue), [0, 0]);
  assert.deepEqual(exercises.map(({ restValue }) => restValue), [60, 60]);
  assert.equal(result.payload?.programs[0]?.totalSets, 6);
  assert.equal(
    page.requests.some(({ path }) => path === '/training/schedule/update'),
    false,
  );
});

test('addStrength rejects names missing from the current COROS catalog', async () => {
  const query = '/training/schedule/query?startDate=20260816&endDate=20260816&supportRestExercise=1';
  const page = new FakePage({
    [query]: {},
    '/account/query': { userId: 'user-9' },
    '/training/exercise/query?userId=user-9&sportType=4': [
      { id: 'squat-id', nameText: 'Deep Squat' },
    ],
  });

  await assert.rejects(
    createCorosCoach(page).addStrength({
      date: '20260816',
      name: 'Strength',
      exercises: 'Unknown Action',
      sets: 3,
      reps: 10,
      weightKg: 0,
      rest: '00:01:00',
      dryRun: true,
    }),
    /Run strength-exercises/,
  );
  assert.equal(
    page.requests.some(({ path }) => path === '/training/program/calculate'),
    false,
  );
});

test('remote authentication errors are mapped at the coach interface', async () => {
  const query = '/training/schedule/query?startDate=20260817&endDate=20260817&supportRestExercise=1';
  const page = new FakePage({ [query]: {} });
  page.fetchJson = async (url: string) => {
    const path = new URL(url).pathname;
    if (path === '/account/refresh') {
      return { result: 'ACCESS_TOKEN_IS_INVALID', message: 'expired' };
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  await assert.rejects(
    createCorosCoach(page).listSchedule({ startDate: '20260817', endDate: '20260817' }),
    (error: unknown) => error instanceof Error
      && 'code' in error
      && error.code === 'AUTH_REQUIRED',
  );
});
