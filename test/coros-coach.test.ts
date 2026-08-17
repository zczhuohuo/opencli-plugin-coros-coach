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

test('listStrengthExercises falls back to the static COROS locale endpoint', async (context) => {
  const page = new FakePage({
    '/account/query': { userId: 'user-locale', userProfile: { language: 'zh-CN' } },
    '/training/exercise/query?userId=user-locale&sportType=4': [{
      id: 'strength-1',
      name: 'T1061',
    }],
  });
  const originalFetchJson = page.fetchJson.bind(page);
  page.fetchJson = async (url: string, options: Record<string, unknown> = {}) => {
    if (new URL(url).hostname === 'staticcn.coros.com') {
      throw new Error('Cross-origin request blocked');
    }
    return originalFetchJson(url, options);
  };
  context.mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ T1061: '深蹲' }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));

  const result = await createCorosCoach(page).listStrengthExercises();

  assert.equal(result[0]?.name, '深蹲');
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

test('addStrength supports per-exercise reps, duration, weight, sets, and rest', async () => {
  const query = '/training/schedule/query?startDate=20260817&endDate=20260817&supportRestExercise=1';
  const catalogQuery = '/training/exercise/query?userId=user-10&sportType=4';
  let calculatedProgram: Record<string, unknown> | undefined;
  const page = new FakePage({
    [query]: { maxIdInPlan: 30 },
    '/account/query': { userId: 'user-10', userProfile: { language: 'zh-CN' } },
    '/locale/coros-traininghub-v2/zh-CN.prod.json?locale=zh-CN': {
      data: { T1000: '热身', T1061: '深蹲', T1264: '死虫式' },
    },
    [catalogQuery]: [
      { id: 'warmup-id', name: 'T1000', exerciseType: 2, sortNo: 1 },
      { id: 'squat-id', name: 'T1061', exerciseType: 2, sortNo: 2 },
      { id: 'dead-bug-id', name: 'T1264', exerciseType: 2, sortNo: 3 },
    ],
    '/training/program/calculate': (options: Record<string, unknown>) => {
      calculatedProgram = options.body as Record<string, unknown>;
      return { planDuration: 1_980, planSets: 6, planTrainingLoad: 22 };
    },
  });

  const result = await createCorosCoach(page).addStrength({
    date: '20260817',
    name: 'Runner strength',
    exercisePlan: JSON.stringify([
      { name: '热身', sets: 1, duration: '00:08:00', rest: '00:00:00' },
      { name: '深蹲', sets: 3, reps: 10, rest: '00:01:15' },
      { name: '死虫式', sets: 2, reps: 8, weightKg: 2.5, rest: '00:00:45' },
    ]),
    sets: 2,
    reps: 12,
    weightKg: 0,
    rest: '00:01:00',
    dryRun: true,
  });

  const exercises = calculatedProgram?.exercises as Array<Record<string, unknown>>;
  assert.deepEqual(exercises.map(({ name }) => name), ['T1000', 'T1061', 'T1264']);
  assert.deepEqual(exercises.map(({ sets }) => sets), [1, 3, 2]);
  assert.deepEqual(exercises.map(({ targetType }) => targetType), [2, 3, 3]);
  assert.deepEqual(exercises.map(({ targetValue }) => targetValue), [480, 10, 8]);
  assert.deepEqual(exercises.map(({ intensityValue }) => intensityValue), [0, 0, 2_500]);
  assert.deepEqual(exercises.map(({ restValue }) => restValue), [0, 75, 45]);
  assert.match(result.prescription, /热身: 1 sets x 00:08:00/);
  assert.match(result.prescription, /死虫式: 2 sets x 8 reps @ 2.5 kg/);
});

test('addStrength rejects ambiguous and malformed exercise plans before connecting', async () => {
  const page = new FakePage({});
  const coach = createCorosCoach(page);
  const defaults = {
    date: '20260817',
    name: 'Strength',
    sets: 3,
    reps: 10,
    weightKg: 0,
    rest: '00:01:00',
    dryRun: true,
  };

  await assert.rejects(
    coach.addStrength({ ...defaults, exercises: '深蹲', exercisePlan: '[]' }),
    /exactly one/,
  );
  await assert.rejects(
    coach.addStrength({
      ...defaults,
      exercisePlan: JSON.stringify([{ name: '深蹲', reps: 10, duration: '00:00:30' }]),
    }),
    /either reps or duration/,
  );
  await assert.rejects(
    coach.addStrength({
      ...defaults,
      exercisePlan: JSON.stringify([{ name: '深蹲', repz: 10 }]),
    }),
    /unsupported field/,
  );
  assert.equal(page.navigations.length, 0);
});

test('addStrength rejects names missing from the current COROS catalog', async () => {
  const query = '/training/schedule/query?startDate=20260816&endDate=20260816&supportRestExercise=1';
  const page = new FakePage({
    [query]: {},
    '/account/query': { userId: 'user-9' },
    '/locale/coros-traininghub-v2/zh-CN.prod.json?locale=zh-CN': { unused: 'unused' },
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
