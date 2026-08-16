import { cli, Strategy } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../coros/coach.js';

cli({
  site: 'coros-coach',
  name: 'strength-exercises',
  access: 'read',
  description: 'List strength exercises supported by the signed-in COROS account',
  example: 'opencli coros-coach strength-exercises -f json',
  domain: 't.coros.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: ['name', 'origin_id', 'body_parts', 'equipment', 'muscles'],
  func: async (page) => createCorosCoach(page).listStrengthExercises(),
});
