import { cli, Strategy } from '@jackwener/opencli/registry';
import { corosDistanceToKm, createCorosApiClient, getSchedule, openCorosSession,
  parseYyyymmdd, secondsToMinutes } from './utils.js';

cli({
  site: 'coros-coach', name: 'schedule', access: 'read',
  description: 'Query planned and completed sessions through the COROS Training Hub API',
  example: 'opencli coros-coach schedule --start-date 20260817 --end-date 20260823 -f yaml',
  domain: 't.coros.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
  args: [
    { name: 'start-date', required: true, help: 'First date, YYYYMMDD' },
    { name: 'end-date', required: true, help: 'Last date, YYYYMMDD' },
    { name: 'include-completed', type: 'boolean', default: false, help: 'Include completed sessions' },
  ],
  columns: ['date', 'kind', 'name', 'sport_type', 'duration_min', 'distance_km', 'training_load'],
  func: async (page, kwargs) => {
    const startDate = parseYyyymmdd(kwargs['start-date'], 'start-date');
    const endDate = parseYyyymmdd(kwargs['end-date'], 'end-date');
    if (startDate > endDate) throw new Error('start-date must not be after end-date.');
    await openCorosSession(page);
    const api = await createCorosApiClient(page);
    const data = await getSchedule(api, startDate, endDate);
    const programs = new Map((data.programs ?? []).map((item) => [String(item.idInPlan), item]));
  const plannedEntities = data.entities?.length
    ? data.entities
    : data.sportDatasInPlan?.length
      ? data.sportDatasInPlan
      : (data.programs ?? []);

  const planned = plannedEntities.map((entity) => {
      const program = programs.get(String(entity.idInPlan)) ?? entity;
      return { date: entity.happenDay ?? program.happenDay ?? '', kind: 'planned',
        name: program.name ?? 'Untitled training', sport_type: program.sportType ?? '',
        duration_min: secondsToMinutes(program.duration), distance_km: corosDistanceToKm(program.distance),
        training_load: program.trainingLoad ?? '' };
    });
    if (kwargs['include-completed'] !== true) return planned;
    return [...planned, ...(data.sportDatasNotInPlan ?? []).map((item) => ({ date: item.happenDay ?? '',
      kind: 'completed', name: item.name ?? 'Completed training', sport_type: item.sportType ?? '',
      duration_min: secondsToMinutes(item.duration), distance_km: corosDistanceToKm(item.distance),
      training_load: item.trainingLoad ?? '' }))];
  },
});
