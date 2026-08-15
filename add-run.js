import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildRunProgram, buildScheduleUpdate, calculateRunProgram, createCorosApiClient,
  getSchedule, nextIdInPlan, openCorosSession, parseDuration, parseYyyymmdd,
} from './utils.js';

cli({
  site: 'coros-coach', name: 'add-run', access: 'write',
  description: 'Add a time-based running session through the COROS Training Hub API',
  example: 'opencli coros-coach add-run --date 20260817 --name "轻松跑" --duration 00:40:00 --low 80 --high 88',
  domain: 't.coros.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
  args: [
    { name: 'date', required: true, help: 'Calendar date, YYYYMMDD' },
    { name: 'name', required: true, help: 'Training name' },
    { name: 'duration', default: '00:30:00', help: 'Target duration, HH:MM:SS' },
    { name: 'description', default: '', help: 'Optional session note' },
    { name: 'low', type: 'int', default: 80, help: 'Lower bound of % lactate-threshold heart rate' },
    { name: 'high', type: 'int', default: 88, help: 'Upper bound of % lactate-threshold heart rate' },
    { name: 'dry-run', type: 'boolean', default: false, help: 'Calculate and preview without updating COROS' },
  ],
  columns: ['status', 'date', 'name', 'duration', 'intensity', 'distance_km', 'training_load'],
  func: async (page, kwargs) => {
    const date = parseYyyymmdd(kwargs.date, 'date');
    const duration = parseDuration(kwargs.duration);
    const low = Number(kwargs.low);
    const high = Number(kwargs.high);
    if (!Number.isInteger(low) || !Number.isInteger(high) || low < 1 || high > 200 || low > high) {
      throw new Error('low and high must be ascending whole-number percentages between 1 and 200.');
    }
    await openCorosSession(page);
    const api = await createCorosApiClient(page);
    const [schedule, account] = await Promise.all([getSchedule(api, date, date), api('/account/query')]);
    const lthr = Number(account?.zoneData?.lthr);
    if (!Number.isFinite(lthr) || lthr <= 0) throw new Error('COROS did not return a valid lactate-threshold heart rate.');
    const program = buildRunProgram({ idInPlan: nextIdInPlan(schedule), name: String(kwargs.name),
      description: String(kwargs.description ?? ''), durationSeconds: duration.seconds, low, high, lthr });
    const calculation = await calculateRunProgram(api, program);
    const payload = buildScheduleUpdate({ date, program, calculation });
    const row = { status: kwargs['dry-run'] === true ? 'calculated, not saved' : 'saved', date,
      name: kwargs.name, duration: duration.text, intensity: `${low}-${high}% LTHR`,
      distance_km: Math.round(Number(calculation.planDistance) / 100_000 * 100) / 100,
      training_load: calculation.planTrainingLoad };
    if (kwargs['dry-run'] === true) return [{ ...row, payload }];
    await api('/training/schedule/update', { method: 'POST', body: payload });
    return [row];
  },
});
