import { CliError } from '@jackwener/opencli/errors';
import type { IPage } from '@jackwener/opencli/registry';

import { connectCoros } from './client.js';
import {
  buildRunProgram,
  buildScheduleUpdate,
  buildStrengthProgram,
  type RunCalculation,
  type ScheduleUpdate,
  type StrengthExerciseInput,
} from './program.js';

interface ScheduleItem {
  idInPlan?: unknown;
  happenDay?: unknown;
  name?: unknown;
  sportType?: unknown;
  duration?: unknown;
  distance?: unknown;
  trainingLoad?: unknown;
}

interface ScheduleResponse {
  maxIdInPlan?: unknown;
  maxPlanProgramId?: unknown;
  programs?: ScheduleItem[];
  entities?: ScheduleItem[];
  sportDatasInPlan?: ScheduleItem[];
  sportDatasNotInPlan?: ScheduleItem[];
}

interface AccountResponse {
  userId?: unknown;
  userProfile?: { language?: unknown };
  zoneData?: { lthr?: unknown };
}

type CorosTranslations = Record<string, string>;

interface StrengthExerciseRecord extends Record<string, unknown> {
  id?: unknown;
  originId?: unknown;
  name?: unknown;
  nameText?: unknown;
  exerciseName?: unknown;
  overview?: unknown;
  equipment?: unknown;
  equipmentText?: unknown;
  muscle?: unknown;
  muscleText?: unknown;
  muscleRelevance?: unknown;
  part?: unknown;
  partText?: unknown;
  sortNo?: unknown;
}

export interface ScheduleQuery {
  startDate: string;
  endDate: string;
  includeCompleted?: boolean;
}

export interface AddRunInput {
  date: string;
  name: string;
  duration: string;
  description?: string;
  low: number;
  high: number;
  dryRun?: boolean;
}

export interface StrengthExerciseRow {
  name: string;
  origin_id: string;
  body_parts: string;
  equipment: string;
  muscles: string;
}

export interface AddStrengthInput {
  date: string;
  name: string;
  exercises: string;
  sets: number;
  reps: number;
  weightKg: number;
  rest: string;
  targetDuration?: string;
  description?: string;
  dryRun?: boolean;
}

export interface AddStrengthResult {
  status: 'calculated, not saved' | 'saved';
  date: string;
  name: string;
  exercises: string;
  prescription: string;
  target_duration: string;
  estimated_duration: string;
  training_load: string | number;
  payload?: ScheduleUpdate;
}

export interface ScheduleRow {
  date: string;
  kind: 'planned' | 'completed';
  name: string;
  sport_type: string | number;
  duration_min: number | null;
  distance_km: number | null;
  training_load: string | number;
}

export interface AddRunResult {
  status: 'calculated, not saved' | 'saved';
  date: string;
  name: string;
  duration: string;
  intensity: string;
  distance_km: number | null;
  training_load: string | number;
  payload?: ScheduleUpdate;
}

export interface CorosCoach {
  listSchedule(query: ScheduleQuery): Promise<ScheduleRow[]>;
  listStrengthExercises(): Promise<StrengthExerciseRow[]>;
  addRun(input: AddRunInput): Promise<AddRunResult>;
  addStrength(input: AddStrengthInput): Promise<AddStrengthResult>;
}

function invalidArgument(message: string): CliError {
  return new CliError('INVALID_ARGUMENT', message);
}

function parseDate(value: unknown, name: string): string {
  const text = String(value ?? '');
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);

  if (match === null) {
    throw invalidArgument(`${name} must use YYYYMMDD, for example 20260817.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isCalendarDate = parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;

  if (!isCalendarDate) {
    throw invalidArgument(`${name} must be a valid calendar date in YYYYMMDD format.`);
  }

  return text;
}

function parseDuration(value: unknown): { text: string; seconds: number } {
  return parseClock(value, 'duration', false);
}

function parseClock(
  value: unknown,
  name: string,
  allowZero: boolean,
): { text: string; seconds: number } {
  const text = String(value ?? '');
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(text);

  if (match === null) {
    throw invalidArgument(`${name} must use HH:MM:SS, for example 00:01:00.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const totalSeconds = hours * 3_600 + minutes * 60 + seconds;

  if (minutes > 59 || seconds > 59) {
    throw invalidArgument(`${name} minutes and seconds must be between 00 and 59.`);
  }
  if (!allowZero && totalSeconds === 0) {
    throw invalidArgument(`${name} must be greater than zero.`);
  }

  return { text, seconds: totalSeconds };
}

function parseWholeNumber(value: unknown, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw invalidArgument(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return parsed;
}

function parseWeight(value: unknown): number {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight < 0 || weight > 999) {
    throw invalidArgument('weight-kg must be a number between 0 and 999.');
  }
  return weight;
}

function parseExerciseNames(value: unknown): string[] {
  const names = String(value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) {
    throw invalidArgument('exercises must contain at least one comma-separated COROS action name.');
  }
  return names;
}

function parseIntensity(lowValue: unknown, highValue: unknown): { low: number; high: number } {
  const low = Number(lowValue);
  const high = Number(highValue);

  if (
    !Number.isInteger(low)
    || !Number.isInteger(high)
    || low < 1
    || high > 200
    || low > high
  ) {
    throw invalidArgument(
      'low and high must be ascending whole-number percentages between 1 and 200.',
    );
  }

  return { low, high };
}

function requireName(value: unknown): string {
  const name = String(value ?? '').trim();
  if (name.length === 0) {
    throw invalidArgument('name must not be empty.');
  }
  return name;
}

function textOr(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

function stringOrNumber(value: unknown): string | number {
  return typeof value === 'number' || typeof value === 'string' ? value : '';
}

function secondsToMinutes(value: unknown): number | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.round((seconds / 60) * 10) / 10 : null;
}

function distanceToKm(value: unknown): number | null {
  const distance = Number(value);
  return Number.isFinite(distance) ? Math.round((distance / 100_000) * 100) / 100 : null;
}

function scheduleQuery(startDate: string, endDate: string): string {
  const params = new URLSearchParams({
    startDate,
    endDate,
    supportRestExercise: '1',
  });
  return `/training/schedule/query?${params.toString()}`;
}

function strengthExerciseQuery(userId: unknown): string {
  const params = new URLSearchParams({
    userId: String(userId),
    sportType: '4',
  });
  return `/training/exercise/query?${params.toString()}`;
}

function displayList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => textOr(item)).filter(Boolean).join(', ');
  }
  return textOr(value);
}

function normalizeStrengthExercise(
  exercise: StrengthExerciseRecord,
  translations: CorosTranslations,
): StrengthExerciseRow {
  return {
    name: strengthExerciseName(exercise, translations),
    origin_id: textOr(exercise.originId ?? exercise.id),
    body_parts: displayList(exercise.partText ?? exercise.part),
    equipment: displayList(exercise.equipmentText ?? exercise.equipment),
    muscles: displayList(
      exercise.muscleText ?? exercise.muscle ?? exercise.muscleRelevance,
    ),
  };
}

function strengthExerciseName(
  exercise: StrengthExerciseRecord,
  translations: CorosTranslations = {},
): string {
  const rawName = textOr(exercise.name);
  return textOr(
    exercise.nameText
    ?? exercise.exerciseName
    ?? translations[rawName]
    ?? rawName,
  ).trim();
}

function resolveStrengthExercises(
  requestedNames: string[],
  catalog: StrengthExerciseRecord[],
  translations: CorosTranslations,
  defaults: Omit<StrengthExerciseInput, 'definition' | 'name'>,
): StrengthExerciseInput[] {
  const byName = new Map<string, StrengthExerciseRecord>();
  for (const exercise of catalog) {
    const aliases = new Set([
      strengthExerciseName(exercise, translations),
      textOr(exercise.name).trim(),
      textOr(exercise.nameText).trim(),
      textOr(exercise.exerciseName).trim(),
    ]);
    for (const alias of aliases) {
      if (alias.length > 0) {
        byName.set(alias, exercise);
      }
    }
  }

  const missing = requestedNames.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw invalidArgument(
      `Unsupported COROS strength action(s): ${missing.join(', ')}. `
      + 'Run strength-exercises to list the current account catalog.',
    );
  }

  return requestedNames.map((name) => ({
    ...defaults,
    definition: byName.get(name) as StrengthExerciseRecord,
    name: textOr((byName.get(name) as StrengthExerciseRecord).name, name),
  }));
}

async function loadCorosTranslations(
  page: Pick<IPage, 'fetchJson'>,
  language: unknown,
): Promise<CorosTranslations> {
  const locale = /^[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(String(language ?? ''))
    ? String(language)
    : 'zh-CN';
  const url = `https://staticcn.coros.com/locale/coros-traininghub-v2/${locale}.prod.json?locale=${locale}`;
  try {
    const response = await page.fetchJson(url);
    return response !== null && typeof response === 'object' && !Array.isArray(response)
      ? response as CorosTranslations
      : {};
  } catch {
    return {};
  }
}

function secondsToClock(value: unknown): string {
  const total = Number(value);
  if (!Number.isFinite(total) || total < 0) {
    return '';
  }
  const seconds = Math.round(total);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':');
}

function nextIdInPlan(schedule: ScheduleResponse): number {
  const ids = [schedule.maxIdInPlan, schedule.maxPlanProgramId]
    .map(Number)
    .filter(Number.isFinite);
  return Math.max(0, ...ids) + 1;
}

function plannedSessions(schedule: ScheduleResponse): ScheduleRow[] {
  const programs = new Map(
    (schedule.programs ?? []).map((program) => [String(program.idInPlan), program]),
  );
  const entities = schedule.entities?.length
    ? schedule.entities
    : schedule.sportDatasInPlan?.length
      ? schedule.sportDatasInPlan
      : (schedule.programs ?? []);

  return entities.map((entity) => {
    const program = programs.get(String(entity.idInPlan)) ?? entity;
    return {
      date: textOr(entity.happenDay ?? program.happenDay),
      kind: 'planned',
      name: textOr(program.name, 'Untitled training'),
      sport_type: stringOrNumber(program.sportType),
      duration_min: secondsToMinutes(program.duration),
      distance_km: distanceToKm(program.distance),
      training_load: stringOrNumber(program.trainingLoad),
    };
  });
}

function completedSessions(schedule: ScheduleResponse): ScheduleRow[] {
  return (schedule.sportDatasNotInPlan ?? []).map((session) => ({
    date: textOr(session.happenDay),
    kind: 'completed',
    name: textOr(session.name, 'Completed training'),
    sport_type: stringOrNumber(session.sportType),
    duration_min: secondsToMinutes(session.duration),
    distance_km: distanceToKm(session.distance),
    training_load: stringOrNumber(session.trainingLoad),
  }));
}

/**
 * The plugin's domain interface. Browser navigation, authentication, COROS
 * payload details, validation, and output shaping all remain behind this seam.
 */
export function createCorosCoach(
  page: Pick<IPage, 'fetchJson' | 'goto' | 'wait'>,
): CorosCoach {
  let connection: ReturnType<typeof connectCoros> | undefined;
  const request = async <Response>(
    ...args: Parameters<Awaited<ReturnType<typeof connectCoros>>>
  ): Promise<Response> => {
    connection ??= connectCoros(page);
    const api = await connection;
    return api<Response>(...args);
  };

  return {
    async listSchedule({
      startDate: rawStartDate,
      endDate: rawEndDate,
      includeCompleted = false,
    }) {
      const startDate = parseDate(rawStartDate, 'start-date');
      const endDate = parseDate(rawEndDate, 'end-date');
      if (startDate > endDate) {
        throw invalidArgument('start-date must not be after end-date.');
      }

      const schedule = await request<ScheduleResponse>(scheduleQuery(startDate, endDate));
      const planned = plannedSessions(schedule);
      return includeCompleted
        ? [...planned, ...completedSessions(schedule)]
        : planned;
    },

    async listStrengthExercises() {
      const account = await request<AccountResponse>('/account/query');
      const userId = textOr(account.userId);
      if (userId.length === 0) {
        throw new CliError('COROS_API_ERROR', 'COROS did not return the signed-in user ID.');
      }

      const [exercises, translations] = await Promise.all([
        request<StrengthExerciseRecord[]>(strengthExerciseQuery(userId)),
        loadCorosTranslations(page, account.userProfile?.language),
      ]);
      if (!Array.isArray(exercises)) {
        throw new CliError('COROS_API_ERROR', 'COROS returned an invalid strength exercise catalog.');
      }

      return exercises
        .slice()
        .sort((left, right) => Number(left.sortNo ?? 0) - Number(right.sortNo ?? 0))
        .map((exercise) => normalizeStrengthExercise(exercise, translations));
    },

    async addRun({
      date: rawDate,
      name: rawName,
      duration: rawDuration,
      description = '',
      low: rawLow,
      high: rawHigh,
      dryRun = false,
    }) {
      const date = parseDate(rawDate, 'date');
      const name = requireName(rawName);
      const duration = parseDuration(rawDuration);
      const { low, high } = parseIntensity(rawLow, rawHigh);

      const [schedule, account] = await Promise.all([
        request<ScheduleResponse>(scheduleQuery(date, date)),
        request<AccountResponse>('/account/query'),
      ]);
      const lthr = Number(account.zoneData?.lthr);
      if (!Number.isFinite(lthr) || lthr <= 0) {
        throw new CliError(
          'COROS_API_ERROR',
          'COROS did not return a valid lactate-threshold heart rate.',
        );
      }

      const program = buildRunProgram({
        idInPlan: nextIdInPlan(schedule),
        name,
        description: String(description ?? ''),
        durationSeconds: duration.seconds,
        low,
        high,
        lthr,
      });
      const calculation = await request<RunCalculation>('/training/program/calculate', {
        method: 'POST',
        body: program,
      });
      const payload = buildScheduleUpdate({ date, program, calculation });
      const result: AddRunResult = {
        status: dryRun ? 'calculated, not saved' : 'saved',
        date,
        name,
        duration: duration.text,
        intensity: `${low}-${high}% LTHR`,
        distance_km: distanceToKm(calculation.planDistance),
        training_load: stringOrNumber(calculation.planTrainingLoad),
      };

      if (dryRun) {
        return { ...result, payload };
      }

      await request<unknown>('/training/schedule/update', { method: 'POST', body: payload });
      return result;
    },

    async addStrength({
      date: rawDate,
      name: rawName,
      exercises: rawExercises,
      sets: rawSets,
      reps: rawReps,
      weightKg: rawWeightKg,
      rest: rawRest,
      targetDuration: rawTargetDuration = '',
      description = '',
      dryRun = false,
    }) {
      const date = parseDate(rawDate, 'date');
      const name = requireName(rawName);
      const exerciseNames = parseExerciseNames(rawExercises);
      const sets = parseWholeNumber(rawSets, 'sets', 1, 99);
      const reps = parseWholeNumber(rawReps, 'reps', 1, 999);
      const weightKg = parseWeight(rawWeightKg);
      const rest = parseClock(rawRest, 'rest', true);
      const targetDuration = String(rawTargetDuration ?? '').length > 0
        ? parseClock(rawTargetDuration, 'target-duration', false).text
        : '';

      const [schedule, account] = await Promise.all([
        request<ScheduleResponse>(scheduleQuery(date, date)),
        request<AccountResponse>('/account/query'),
      ]);
      const userId = textOr(account.userId);
      if (userId.length === 0) {
        throw new CliError('COROS_API_ERROR', 'COROS did not return the signed-in user ID.');
      }
      const [catalog, translations] = await Promise.all([
        request<StrengthExerciseRecord[]>(strengthExerciseQuery(userId)),
        loadCorosTranslations(page, account.userProfile?.language),
      ]);
      if (!Array.isArray(catalog)) {
        throw new CliError('COROS_API_ERROR', 'COROS returned an invalid strength exercise catalog.');
      }
      const resolvedExercises = resolveStrengthExercises(
        exerciseNames,
        catalog,
        translations,
        { sets, reps, weightKg, restSeconds: rest.seconds },
      );
      const program = buildStrengthProgram({
        idInPlan: nextIdInPlan(schedule),
        name,
        description: String(description ?? ''),
        exercises: resolvedExercises,
      });
      const calculation = await request<RunCalculation>('/training/program/calculate', {
        method: 'POST',
        body: program,
      });
      const payload = buildScheduleUpdate({ date, program, calculation });
      const result: AddStrengthResult = {
        status: dryRun ? 'calculated, not saved' : 'saved',
        date,
        name,
        exercises: exerciseNames.join(', '),
        prescription: `${sets} sets x ${reps} reps @ ${weightKg} kg, ${rest.text} rest`,
        target_duration: targetDuration,
        estimated_duration: secondsToClock(calculation.planDuration),
        training_load: stringOrNumber(calculation.planTrainingLoad),
      };

      if (dryRun) {
        return { ...result, payload };
      }

      await request<unknown>('/training/schedule/update', { method: 'POST', body: payload });
      return result;
    },
  };
}
