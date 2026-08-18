import { CliError } from '@jackwener/opencli/errors';

export const DEFAULT_HOLD_DURATION = '00:00:30-00:00:45';

export type StrengthExerciseTarget =
  | { kind: 'reps'; value: number }
  | { kind: 'duration'; minSeconds: number; maxSeconds: number };

export interface StrengthExerciseIdentity {
  name: string;
  originId?: unknown;
  targetType?: unknown;
  targetValue?: unknown;
}

export type StrengthTargetUnit = 'reps' | 'time';

function invalidArgument(message: string): CliError {
  return new CliError('INVALID_ARGUMENT', message);
}

function parseClock(value: string, fieldName: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (match === null) {
    throw invalidArgument(
      `${fieldName} must use HH:MM:SS or HH:MM:SS-HH:MM:SS, for example 00:00:30-00:00:45.`,
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const totalSeconds = hours * 3_600 + minutes * 60 + seconds;
  if (minutes > 59 || seconds > 59 || totalSeconds === 0) {
    throw invalidArgument(`${fieldName} must contain a valid duration greater than zero.`);
  }
  return totalSeconds;
}

export function parseStrengthDuration(
  value: unknown,
  fieldName = 'duration',
): Extract<StrengthExerciseTarget, { kind: 'duration' }> {
  const text = String(value ?? '').trim();
  const parts = text.split('-');
  if (parts.length < 1 || parts.length > 2) {
    throw invalidArgument(
      `${fieldName} must use HH:MM:SS or HH:MM:SS-HH:MM:SS, for example 00:00:30-00:00:45.`,
    );
  }

  const minSeconds = parseClock(parts[0] ?? '', fieldName);
  const maxSeconds = parts.length === 1
    ? minSeconds
    : parseClock(parts[1] ?? '', fieldName);
  if (minSeconds > maxSeconds) {
    throw invalidArgument(`${fieldName} range must be ordered from shortest to longest.`);
  }
  return { kind: 'duration', minSeconds, maxSeconds };
}

export function corosStrengthTargetUnit({
  targetType,
}: StrengthExerciseIdentity): StrengthTargetUnit {
  return Number(targetType) === 2 ? 'time' : 'reps';
}

export function resolveStrengthTarget(
  exercise: StrengthExerciseIdentity,
  defaults: { reps: number; holdDuration: StrengthExerciseTarget },
  unitOverride?: StrengthTargetUnit,
): StrengthExerciseTarget {
  const unit = unitOverride ?? corosStrengthTargetUnit(exercise);
  return unit === 'time'
    ? defaults.holdDuration
    : { kind: 'reps', value: defaults.reps };
}

export function corosStrengthTarget(exercise: StrengthExerciseIdentity): StrengthExerciseTarget {
  const value = Number(exercise.targetValue);
  const unit = corosStrengthTargetUnit(exercise);
  if (unit === 'time') {
    const seconds = Number.isFinite(value) && value > 0 ? value : 30;
    return { kind: 'duration', minSeconds: seconds, maxSeconds: seconds };
  }
  return {
    kind: 'reps',
    value: Number.isInteger(value) && value > 0 ? value : 10,
  };
}

function secondsToClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export function formatStrengthTarget(target: StrengthExerciseTarget): string {
  if (target.kind === 'reps') {
    return `${target.value} reps`;
  }
  const minimum = secondsToClock(target.minSeconds);
  const maximum = secondsToClock(target.maxSeconds);
  return minimum === maximum ? minimum : `${minimum}–${maximum}`;
}

export function corosTargetValue(target: StrengthExerciseTarget): number {
  return target.kind === 'duration' ? target.maxSeconds : target.value;
}
