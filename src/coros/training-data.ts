export interface DashboardEnvelope extends Record<string, unknown> {
  summaryInfo?: unknown;
}

export interface DashboardSnapshot {
  running_level: number | null;
  aerobic_endurance: number | null;
  threshold_capacity: number | null;
  speed_endurance: number | null;
  sprint_capacity: number | null;
  short_term_load: number | null;
  long_term_load: number | null;
  load_ratio_pct: number | null;
  recovery_pct: number | null;
  recovery_state: number | null;
  full_recovery_hours: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  threshold_hr: number | null;
  threshold_pace: string;
  sleep_hrv_avg_ms: number | null;
  heart_rate_zones: unknown[];
  pace_zones: unknown[];
  race_predictions: unknown[];
  seven_day_performance: unknown[];
  recent_activities: unknown[];
  current_week_record: Record<string, unknown>;
  raw?: {
    dashboard: DashboardEnvelope;
    detail: DashboardEnvelope;
  };
}

export interface ActivityHistoryResponse extends Record<string, unknown> {
  count?: unknown;
  pageNumber?: unknown;
  totalPage?: unknown;
  dataList?: unknown;
}

export interface ActivityHistoryQuery {
  startDate?: string;
  endDate?: string;
  sportTypes: number[];
  page: number;
  pageSize: number;
  keywords?: string;
  raw?: boolean;
}

export interface ActivityHistoryRow {
  date: string;
  name: string;
  sport_type: string | number;
  sport_name: string;
  duration_min: number | null;
  distance_km: number | null;
  avg_pace: string;
  avg_hr: number | null;
  training_load: number | null;
  ascent_m: number | null;
  calories: number | null;
  sets: number | null;
  label_id: string;
  start_timestamp: number | null;
  page: number | null;
  total_pages: number | null;
  total_count: number | null;
  raw?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOr(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

function paceClock(secondsPerKilometer: unknown): string {
  const total = numberOrNull(secondsPerKilometer);
  if (total === null || total <= 0) {
    return '';
  }
  const rounded = Math.round(total);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}/km`;
}

function ratioPercent(value: unknown): number | null {
  const ratio = numberOrNull(value);
  if (ratio === null) {
    return null;
  }
  return Math.round((Math.abs(ratio) <= 3 ? ratio * 100 : ratio) * 10) / 10;
}

export function normalizeDashboard(
  dashboard: DashboardEnvelope,
  detail: DashboardEnvelope,
  includeRaw = false,
): DashboardSnapshot {
  const summary = asRecord(dashboard.summaryInfo);
  const detailSummary = asRecord(detail.summaryInfo);
  const sleepHrv = asRecord(summary.sleepHrvData);

  const result: DashboardSnapshot = {
    running_level: numberOrNull(summary.staminaLevel),
    aerobic_endurance: numberOrNull(summary.aerobicEnduranceScore),
    threshold_capacity: numberOrNull(summary.lactateThresholdCapacityScore),
    speed_endurance: numberOrNull(summary.anaerobicEnduranceScore),
    sprint_capacity: numberOrNull(summary.anaerobicCapacityScore),
    short_term_load: numberOrNull(detailSummary.ati),
    long_term_load: numberOrNull(detailSummary.cti),
    load_ratio_pct: ratioPercent(detailSummary.trainingLoadRatio),
    recovery_pct: numberOrNull(summary.recoveryPct),
    recovery_state: numberOrNull(summary.recoveryState),
    full_recovery_hours: numberOrNull(summary.fullRecoveryHours),
    max_hr: numberOrNull(summary.fitnessMaxHr),
    resting_hr: numberOrNull(summary.rhr),
    threshold_hr: numberOrNull(summary.lthr),
    threshold_pace: paceClock(summary.ltsp),
    sleep_hrv_avg_ms: numberOrNull(sleepHrv.avgSleepHrv),
    heart_rate_zones: asArray(summary.lthrZone),
    pace_zones: asArray(summary.ltspZone),
    race_predictions: asArray(summary.runScoreList),
    seven_day_performance: asArray(detail.detailList),
    recent_activities: asArray(detail.sportDataList),
    current_week_record: asRecord(detail.currentWeekRecord),
  };

  return includeRaw ? { ...result, raw: { dashboard, detail } } : result;
}

export function activityHistoryQuery(query: ActivityHistoryQuery): string {
  const params = new URLSearchParams({
    size: String(query.pageSize),
    pageNumber: String(query.page),
    modeList: query.sportTypes.join(','),
  });
  if (query.startDate !== undefined && query.endDate !== undefined) {
    params.set('startDay', query.startDate);
    params.set('endDay', query.endDate);
  }
  if (query.keywords !== undefined && query.keywords.length > 0) {
    params.set('keywords', query.keywords);
  }
  return `/activity/query?${params.toString()}`;
}

const SPORT_NAMES: Record<number, string> = {
  100: 'Run',
  101: 'Indoor Run',
  102: 'Trail Run',
  103: 'Track Run',
  104: 'Hike',
  105: 'Mountain Climb',
  200: 'Bike',
  201: 'Indoor Bike',
  300: 'Pool Swim',
  301: 'Open Water Swim',
  400: 'Gym Cardio',
  401: 'GPS Cardio',
  402: 'Strength',
  900: 'Walk',
  904: 'Yoga',
  905: 'Pilates',
  1200: 'Hybrid Fitness',
};

function activityDate(activity: Record<string, unknown>): string {
  const happenDay = textOr(activity.happenDay);
  if (/^\d{8}$/.test(happenDay)) {
    return `${happenDay.slice(0, 4)}-${happenDay.slice(4, 6)}-${happenDay.slice(6, 8)}`;
  }
  const timestamp = numberOrNull(activity.startTime ?? activity.startTimestamp);
  if (timestamp === null || timestamp <= 0) {
    return '';
  }
  return new Date(timestamp * 1_000).toISOString().slice(0, 10);
}

function rounded(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function metersToKm(value: unknown): number | null {
  const meters = numberOrNull(value);
  return meters === null ? null : rounded(meters / 1_000, 2);
}

function secondsToMinutes(value: unknown): number | null {
  const seconds = numberOrNull(value);
  return seconds === null ? null : rounded(seconds / 60, 1);
}

function averagePace(activity: Record<string, unknown>, sportType: number | null): string {
  if (sportType === null || ![100, 101, 102, 103, 104, 105, 900].includes(sportType)) {
    return '';
  }
  const explicitPace = numberOrNull(activity.avgPace);
  if (explicitPace !== null && explicitPace > 0) {
    return paceClock(explicitPace);
  }
  const averageSpeed = numberOrNull(activity.avgSpeed);
  if (averageSpeed === null || averageSpeed <= 0) {
    return '';
  }
  return Number(activity.speedType) === 3
    ? paceClock(averageSpeed)
    : paceClock(100_000 / averageSpeed);
}

function caloriesToKilocalories(value: unknown): number | null {
  const milliKilocalories = numberOrNull(value);
  return milliKilocalories === null ? null : Math.round(milliKilocalories / 1_000);
}

export function normalizeActivityHistory(
  response: ActivityHistoryResponse,
  includeRaw = false,
): ActivityHistoryRow[] {
  const page = numberOrNull(response.pageNumber);
  const totalPages = numberOrNull(response.totalPage);
  const totalCount = numberOrNull(response.count);
  return asArray(response.dataList).flatMap((value) => {
    const activity = asRecord(value);
    if (Object.keys(activity).length === 0) {
      return [];
    }
    const sportType = numberOrNull(activity.sportType);
    const startTimestamp = numberOrNull(activity.startTime ?? activity.startTimestamp);
    const row: ActivityHistoryRow = {
      date: activityDate(activity),
      name: textOr(activity.name, 'Untitled activity').trim(),
      sport_type: sportType ?? textOr(activity.sportType),
      sport_name: sportType === null ? '' : (SPORT_NAMES[sportType] ?? `Sport ${sportType}`),
      duration_min: secondsToMinutes(activity.workoutTime ?? activity.duration),
      distance_km: metersToKm(activity.distance),
      avg_pace: averagePace(activity, sportType),
      avg_hr: numberOrNull(activity.avgHr),
      training_load: numberOrNull(activity.trainingLoad),
      ascent_m: numberOrNull(activity.ascent),
      calories: caloriesToKilocalories(activity.calorie ?? activity.calories),
      sets: sportType === 402
        ? numberOrNull(activity.sets || activity.total)
        : null,
      label_id: textOr(activity.labelId),
      start_timestamp: startTimestamp,
      page,
      total_pages: totalPages,
      total_count: totalCount,
    };
    return [includeRaw ? { ...row, raw: activity } : row];
  });
}
