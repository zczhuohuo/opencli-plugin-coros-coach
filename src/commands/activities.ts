import { cli, Strategy } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../coros/coach.js';

cli({
  site: 'coros-coach',
  name: 'activities',
  access: 'read',
  description: 'Query paginated COROS Training Hub activity history',
  example: 'opencli coros-coach activities --start-date 20260701 --end-date 20260817 --sport-types 100,101,102,103 -f json',
  domain: 't.coros.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  siteSession: 'persistent',
  args: [
    { name: 'start-date', default: '', help: 'Optional first date, YYYYMMDD; requires end-date' },
    { name: 'end-date', default: '', help: 'Optional last date, YYYYMMDD; requires start-date' },
    {
      name: 'sport-types',
      default: '',
      help: 'Optional comma-separated COROS numeric sport type codes; empty means all',
    },
    { name: 'keywords', default: '', help: 'Optional activity-name keyword' },
    { name: 'page', type: 'int', default: 1, help: 'Result page number' },
    { name: 'page-size', type: 'int', default: 50, help: 'Rows per page, 1-100' },
    {
      name: 'raw',
      type: 'boolean',
      default: false,
      help: 'Include each complete activity API record in JSON output',
    },
  ],
  columns: [
    'date',
    'name',
    'sport_type',
    'sport_name',
    'duration_min',
    'distance_km',
    'avg_pace',
    'avg_hr',
    'training_load',
  ],
  func: async (page, kwargs) => createCorosCoach(page).listActivities({
    startDate: kwargs['start-date'],
    endDate: kwargs['end-date'],
    sportTypes: kwargs['sport-types'],
    keywords: kwargs.keywords,
    page: kwargs.page,
    pageSize: kwargs['page-size'],
    raw: kwargs.raw === true,
  }),
});
