import { cli, Strategy } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../coros/coach.js';

cli({
  site: 'coros-coach',
  name: 'dashboard',
  access: 'read',
  description: 'Read the current COROS Training Hub fitness and recovery snapshot',
  example: 'opencli coros-coach dashboard -f json',
  domain: 't.coros.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  siteSession: 'persistent',
  args: [{
    name: 'raw',
    type: 'boolean',
    default: false,
    help: 'Include the complete dashboard API responses in JSON output',
  }],
  columns: [
    'running_level',
    'short_term_load',
    'long_term_load',
    'load_ratio_pct',
    'recovery_pct',
    'full_recovery_hours',
    'threshold_hr',
    'threshold_pace',
    'sleep_hrv_avg_ms',
  ],
  func: async (page, kwargs) => [
    await createCorosCoach(page).getDashboard(kwargs.raw === true),
  ],
});
