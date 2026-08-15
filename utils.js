import { CliError } from '@jackwener/opencli/errors';

export const SCHEDULE_URL = 'https://t.coros.com/admin/views/schedule';
export const API_BASE_URL = 'https://teamcnapi.coros.com';

export function parseYyyymmdd(value, name) {
  const date = String(value ?? '');
  if (!/^\d{8}$/.test(date)) throw new CliError('INVALID_ARGUMENT', `${name} must use YYYYMMDD, for example 20260817.`);
  return date;
}

export function parseDuration(value) {
  const text = String(value ?? '');
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (match == null) throw new CliError('INVALID_ARGUMENT', 'duration must use HH:MM:SS, for example 00:30:00.');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) throw new CliError('INVALID_ARGUMENT', 'duration minutes and seconds must be between 00 and 59.');
  return { text, seconds: hours * 3600 + minutes * 60 + seconds };
}

export function secondsToMinutes(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.round((seconds / 60) * 10) / 10 : null;
}

export function corosDistanceToKm(value) {
  const rawDistance = Number(value);
  return Number.isFinite(rawDistance) ? Math.round((rawDistance / 100_000) * 100) / 100 : null;
}

export async function openCorosSession(page) {
  await page.goto(SCHEDULE_URL, { waitUntil: 'load', settleMs: 1_000 });
  await page.wait({ selector: '#schedule', timeout: 15 });
}

function assertApiResponse(response, endpoint) {
  if (response?.result !== '0000') {
    throw new CliError(
      response?.result === 'ACCESS_TOKEN_IS_INVALID' ? 'AUTH_REQUIRED' : 'COROS_API_ERROR',
      `COROS ${endpoint} failed: ${response?.message ?? response?.result ?? 'unknown error'}`,
      `Open ${SCHEDULE_URL}, sign in, and retry.`,
    );
  }
  return response.data;
}

export async function createCorosApiClient(page) {
  const refreshed = await page.fetchJson(`${API_BASE_URL}/account/refresh`, { method: 'POST' });
  const accessToken = refreshed?.data?.accessToken ?? refreshed?.accessToken;
  if (refreshed?.result !== '0000' || typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new CliError('AUTH_REQUIRED', `COROS login could not be refreshed. Open ${SCHEDULE_URL}, sign in, and retry.`);
  }
  return async (endpoint, options = {}) => {
    const response = await page.fetchJson(`${API_BASE_URL}${endpoint}`, {
      method: options.method ?? 'GET',
      headers: {
        accessToken,
        YFHeader: JSON.stringify({ language: 'zh-CN' }),
        ...(options.headers ?? {}),
      },
      ...(options.body === undefined ? {} : { body: options.body }),
    });
    return assertApiResponse(response, endpoint);
  };
}

export async function getSchedule(api, startDate, endDate) {
  const params = new URLSearchParams({ startDate, endDate, supportRestExercise: '1' });
  return api(`/training/schedule/query?${params.toString()}`);
}

export function nextIdInPlan(schedule) {
  const ids = [schedule?.maxIdInPlan, schedule?.maxPlanProgramId].map(Number).filter(Number.isFinite);
  return Math.max(0, ...ids) + 1;
}

function buildExercise({ durationSeconds, low, high, lthr }) {
  return {
    access: 0, createTimestamp: 1587381919, defaultOrder: 2, equipment: [1], exerciseType: 2,
    groupId: '', hrType: 3, id: 1, intensityCustom: 0, intensityDisplayUnit: 0,
    intensityMultiplier: 0, intensityPercent: low * 1000, intensityPercentExtend: high * 1000,
    intensityType: 2, intensityValue: Math.floor(lthr * low / 100),
    intensityValueExtend: Math.round(lthr * high / 100), isDefaultAdd: 1, isGroup: false,
    isIntensityPercent: true, name: 'T3001', originId: '426109589008859136',
    overview: 'sid_run_training', part: [0], restType: 3, restValue: 0, sets: 1, sortNo: 2,
    sourceId: '0', sourceUrl: '', sportType: 1, subType: 0, targetDisplayUnit: 0,
    targetType: 2, targetValue: durationSeconds, userId: 0, videoUrl: '',
  };
}

export function buildRunProgram({ idInPlan, name, description, durationSeconds, low, high, lthr }) {
  return {
    access: 1, essence: 0, estimatedTime: 0, exerciseNum: '',
    exercises: [buildExercise({ durationSeconds, low, high, lthr })], idInPlan, name,
    originEssence: 0, overview: description, pbVersion: 2, poolLength: 2500, poolLengthId: 1,
    poolLengthUnit: 2, referExercise: { hrType: 0, intensityType: 0, valueType: 0 }, sets: 1,
    simple: true, sourceId: '425868125142171648',
    sourceUrl: 'https://oss.coros.com/source/source_default/0/37a30375849b49f89cbd5ab80eec5c7e.jpg',
    sportType: 1, subType: 0, targetType: '', targetValue: '', totalSets: 1, type: 0, unit: 0, version: 0,
  };
}

export async function calculateRunProgram(api, program) {
  return api('/training/program/calculate', { method: 'POST', body: program });
}

export function buildScheduleUpdate({ date, program, calculation }) {
  const calculatedProgram = {
    ...program,
    distance: calculation.planDistance,
    distanceDisplayUnit: calculation.distanceDisplayUnit,
    duration: calculation.planDuration,
    exerciseBarChart: calculation.exerciseBarChart,
    pitch: calculation.planPitch,
    trainingLoad: calculation.planTrainingLoad,
  };
  return {
    entities: [{ dayNo: 0, exerciseBarChart: calculation.exerciseBarChart, happenDay: date,
      idInPlan: program.idInPlan, sortNo: 0, sortNoInPlan: 0, sortNoInSchedule: 0 }],
    pbVersion: 2,
    programs: [calculatedProgram],
    versionObjects: [{ id: program.idInPlan, status: 1 }],
  };
}
