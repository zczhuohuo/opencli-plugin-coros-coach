import { CliError } from '@jackwener/opencli/errors';
import type { IPage } from '@jackwener/opencli/registry';

import { connectCoros } from './client.js';
import {
  buildRunProgram,
  buildScheduleUpdate,
  type RunCalculation,
  type ScheduleUpdate,
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
  zoneData?: { lthr?: unknown };
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
  addRun(input: AddRunInput): Promise<AddRunResult>;
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
  const text = String(value ?? '');
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(text);

  if (match === null) {
    throw invalidArgument('duration must use HH:MM:SS, for example 00:30:00.');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const totalSeconds = hours * 3_600 + minutes * 60 + seconds;

  if (minutes > 59 || seconds > 59) {
    throw invalidArgument('duration minutes and seconds must be between 00 and 59.');
  }
  if (totalSeconds === 0) {
    throw invalidArgument('duration must be greater than zero.');
  }

  return { text, seconds: totalSeconds };
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
  };
}
