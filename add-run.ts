import { cli, Strategy } from '@jackwener/opencli/registry';

import { createCorosCoach } from './coros-coach.js';

cli({
  site: 'coros-coach',
  name: 'add-run',
  access: 'write',
  description: 'Add a time-based running session through the COROS Training Hub API',
  example: 'opencli coros-coach add-run --date 20260817 --name "Easy run" --duration 00:40:00 --low 80 --high 88',
  domain: 't.coros.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'date', required: true, help: 'Calendar date, YYYYMMDD' },
    { name: 'name', required: true, help: 'Training name' },
    { name: 'duration', default: '00:30:00', help: 'Target duration, HH:MM:SS' },
    { name: 'description', default: '', help: 'Optional session note' },
    {
      name: 'low',
      type: 'int',
      default: 80,
      help: 'Lower bound of % lactate-threshold heart rate',
    },
    {
      name: 'high',
      type: 'int',
      default: 88,
      help: 'Upper bound of % lactate-threshold heart rate',
    },
    {
      name: 'dry-run',
      type: 'boolean',
      default: false,
      help: 'Calculate and preview without updating COROS',
    },
  ],
  columns: [
    'status',
    'date',
    'name',
    'duration',
    'intensity',
    'distance_km',
    'training_load',
  ],
  func: async (page, kwargs) => {
    const coach = createCorosCoach(page);
    const result = await coach.addRun({
      date: kwargs.date,
      name: kwargs.name,
      duration: kwargs.duration,
      description: kwargs.description,
      low: kwargs.low,
      high: kwargs.high,
      dryRun: kwargs['dry-run'] === true,
    });
    return [result];
  },
});
