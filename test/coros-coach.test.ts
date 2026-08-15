import assert from 'node:assert/strict';
import test from 'node:test';

import type { IPage } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../coros-coach.js';

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
