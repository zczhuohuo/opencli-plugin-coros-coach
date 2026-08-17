import { cli, Strategy } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../coros/coach.js';

cli({
  site: 'coros-coach',
  name: 'schedule',
  access: 'read',
  description: 'Query planned and completed sessions through the COROS Training Hub API',
  example: 'opencli coros-coach schedule --start-date 20260817 --end-date 20260823 -f yaml',
  domain: 't.coros.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  siteSession: 'persistent',
  args: [
    { name: 'start-date', required: true, help: 'First date, YYYYMMDD' },
    { name: 'end-date', required: true, help: 'Last date, YYYYMMDD' },
    {
      name: 'include-completed',
      type: 'boolean',
      default: false,
      help: 'Include completed sessions',
    },
  ],
  columns: [
    'date',
    'kind',
    'name',
    'sport_type',
    'duration_min',
    'distance_km',
    'training_load',
  ],
  func: async (page, kwargs) => {
    const coach = createCorosCoach(page);
    return coach.listSchedule({
      startDate: kwargs['start-date'],
      endDate: kwargs['end-date'],
      includeCompleted: kwargs['include-completed'] === true,
    });
  },
});
