import { corosTargetValue, type StrengthExerciseTarget } from './strength-target.js';

/** Values returned by COROS after calculating a run program. */
export interface RunCalculation {
  planDistance: unknown;
  distanceDisplayUnit?: unknown;
  planDuration?: unknown;
  exerciseBarChart?: unknown;
  planPitch?: unknown;
  planSets?: unknown;
  planTrainingLoad?: unknown;
}

export interface RunProgram extends Record<string, unknown> {
  idInPlan: number;
  exercises: Array<Record<string, unknown>>;
  name: string;
}

export interface StrengthExerciseInput {
  definition: Record<string, unknown>;
  name: string;
  sets: number;
  target: StrengthExerciseTarget;
  weightKg: number;
  restSeconds: number;
}

export interface StrengthProgram extends Record<string, unknown> {
  idInPlan: number;
  exercises: Array<Record<string, unknown>>;
  name: string;
}

export interface ScheduleUpdate extends Record<string, unknown> {
  entities: Array<Record<string, unknown>>;
  programs: Array<Record<string, unknown>>;
  versionObjects: Array<Record<string, unknown>>;
}

interface RunProgramInput {
  idInPlan: number;
  name: string;
  description: string;
  durationSeconds: number;
  low: number;
  high: number;
  lthr: number;
}

function buildExercise({
  durationSeconds,
  low,
  high,
  lthr,
}: Pick<RunProgramInput, 'durationSeconds' | 'low' | 'high' | 'lthr'>): Record<string, unknown> {
  return {
    access: 0,
    createTimestamp: 1_587_381_919,
    defaultOrder: 2,
    equipment: [1],
    exerciseType: 2,
    groupId: '',
    hrType: 3,
    id: 1,
    intensityCustom: 0,
    intensityDisplayUnit: 0,
    intensityMultiplier: 0,
    intensityPercent: low * 1_000,
    intensityPercentExtend: high * 1_000,
    intensityType: 2,
    intensityValue: Math.floor((lthr * low) / 100),
    intensityValueExtend: Math.round((lthr * high) / 100),
    isDefaultAdd: 1,
    isGroup: false,
    isIntensityPercent: true,
    name: 'T3001',
    originId: '426109589008859136',
    overview: 'sid_run_training',
    part: [0],
    restType: 3,
    restValue: 0,
    sets: 1,
    sortNo: 2,
    sourceId: '0',
    sourceUrl: '',
    sportType: 1,
    subType: 0,
    targetDisplayUnit: 0,
    targetType: 2,
    targetValue: durationSeconds,
    userId: 0,
    videoUrl: '',
  };
}

export function buildRunProgram({
  idInPlan,
  name,
  description,
  durationSeconds,
  low,
  high,
  lthr,
}: RunProgramInput): RunProgram {
  return {
    access: 1,
    essence: 0,
    estimatedTime: 0,
    exerciseNum: '',
    exercises: [buildExercise({ durationSeconds, low, high, lthr })],
    idInPlan,
    name,
    originEssence: 0,
    overview: description,
    pbVersion: 2,
    poolLength: 2_500,
    poolLengthId: 1,
    poolLengthUnit: 2,
    referExercise: { hrType: 0, intensityType: 0, valueType: 0 },
    sets: 1,
    simple: true,
    sourceId: '425868125142171648',
    sourceUrl: 'https://oss.coros.com/source/source_default/0/37a30375849b49f89cbd5ab80eec5c7e.jpg',
    sportType: 1,
    subType: 0,
    targetType: '',
    targetValue: '',
    totalSets: 1,
    type: 0,
    unit: 0,
    version: 0,
  };
}

function buildStrengthExercise(
  exercise: StrengthExerciseInput,
  index: number,
): Record<string, unknown> {
  const originId = exercise.definition.originId ?? exercise.definition.id;

  return {
    ...exercise.definition,
    groupId: '',
    id: index + 1,
    intensityCustom: 0,
    intensityDisplayUnit: 0,
    intensityMultiplier: 0,
    intensityPercent: 0,
    intensityPercentExtend: 0,
    intensityType: 1,
    intensityValue: Math.round(exercise.weightKg * 1_000),
    intensityValueExtend: 0,
    isGroup: false,
    name: exercise.name,
    originId,
    restType: 1,
    restValue: exercise.restSeconds,
    sets: exercise.sets,
    sortNo: index + 1,
    sportType: 4,
    targetDisplayUnit: 0,
    targetType: exercise.target.kind === 'duration' ? 2 : 3,
    targetValue: corosTargetValue(exercise.target),
  };
}

export function buildStrengthProgram({
  idInPlan,
  name,
  description,
  exercises,
}: {
  idInPlan: number;
  name: string;
  description: string;
  exercises: StrengthExerciseInput[];
}): StrengthProgram {
  return {
    access: 1,
    authorId: '0',
    distance: 0,
    duration: 0,
    essence: 0,
    estimatedType: 0,
    estimatedValue: 0,
    exerciseNum: 0,
    exercises: exercises.map(buildStrengthExercise),
    idInPlan,
    name,
    originEssence: 0,
    overview: description,
    pbVersion: 2,
    referExercise: { hrType: 0, intensityType: 0, valueType: 0 },
    simple: false,
    sportType: 4,
    subType: 65_535,
    targetType: 0,
    targetValue: 0,
    totalSets: 0,
    trainingLoad: 0,
    type: 0,
    unit: 0,
    version: 0,
  };
}

export function buildScheduleUpdate({
  date,
  program,
  calculation,
}: {
  date: string;
  program: RunProgram | StrengthProgram;
  calculation: RunCalculation;
}): ScheduleUpdate {
  return {
    entities: [{
      dayNo: 0,
      exerciseBarChart: calculation.exerciseBarChart,
      happenDay: date,
      idInPlan: program.idInPlan,
      sortNo: 0,
      sortNoInPlan: 0,
      sortNoInSchedule: 0,
    }],
    pbVersion: 2,
    programs: [{
      ...program,
      distance: calculation.planDistance,
      distanceDisplayUnit: calculation.distanceDisplayUnit,
      duration: calculation.planDuration,
      exerciseBarChart: calculation.exerciseBarChart,
      pitch: calculation.planPitch,
      ...(calculation.planSets === undefined
        ? {}
        : { sets: calculation.planSets, totalSets: calculation.planSets }),
      trainingLoad: calculation.planTrainingLoad,
    }],
    versionObjects: [{ id: program.idInPlan, status: 1 }],
  };
}
