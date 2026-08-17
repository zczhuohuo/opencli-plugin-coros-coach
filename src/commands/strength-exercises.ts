import { cli, Strategy } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../coros/coach.js';
import { createStrengthExerciseCache } from '../coros/strength-exercise-cache.js';

const exerciseCache = createStrengthExerciseCache();

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
  siteSession: 'persistent',
  args: [{
    name: 'refresh',
    type: 'boolean',
    default: false,
    help: 'Ignore the seven-day local cache and refresh the COROS action catalog',
  }],
  columns: ['name', 'origin_id', 'body_parts', 'equipment', 'muscles'],
  func: async (page, kwargs) => exerciseCache.get(
    kwargs.refresh === true,
    () => createCorosCoach(page).listStrengthExercises(),
  ),
});
