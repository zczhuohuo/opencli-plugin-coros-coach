import { cli, Strategy } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../coros/coach.js';

cli({
  site: 'coros-coach',
  name: 'add-strength',
  access: 'write',
  description: 'Calculate and add a strength session using the live COROS action catalog',
  example: 'opencli coros-coach add-strength --date 20260817 --name "Runner strength" --exercise-plan \'[{"name":"深蹲","sets":3,"reps":10},{"name":"臀桥","sets":3,"reps":10},{"name":"死虫式","sets":2,"reps":8}]\' --rest 00:01:00 --dry-run',
  domain: 't.coros.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  siteSession: 'persistent',
  args: [
    { name: 'date', required: true, help: 'Calendar date, YYYYMMDD' },
    { name: 'name', required: true, help: 'Training name' },
    {
      name: 'exercises',
      default: '',
      help: 'Comma-separated names or origin_ids from strength-exercises; cannot be combined with exercise-plan',
    },
    {
      name: 'exercise-plan',
      default: '',
      help: 'JSON array with per-action name, sets, reps or duration/range, weightKg, and rest',
    },
    { name: 'sets', type: 'int', default: 3, help: 'Default sets for every action' },
    { name: 'reps', type: 'int', default: 10, help: 'Default repetitions for dynamic actions' },
    {
      name: 'hold-duration',
      default: '00:00:30-00:00:45',
      help: 'Default duration or range for actions whose unit resolves to time, HH:MM:SS[-HH:MM:SS]',
    },
    {
      name: 'target-units',
      default: '',
      help: 'Optional JSON object overriding units by exact action name or origin_id: reps or time',
    },
    { name: 'weight-kg', type: 'float', default: 0, help: 'Default weight in kilograms' },
    { name: 'rest', default: '00:01:00', help: 'Rest after each set, HH:MM:SS' },
    {
      name: 'target-duration',
      default: '',
      help: 'Optional planning target shown alongside the COROS estimate, HH:MM:SS',
    },
    { name: 'description', default: '', help: 'Optional session note' },
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
    'exercises',
    'prescription',
    'target_duration',
    'estimated_duration',
    'training_load',
  ],
  func: async (page, kwargs) => {
    const coach = createCorosCoach(page);
    const result = await coach.addStrength({
      date: kwargs.date,
      name: kwargs.name,
      exercises: kwargs.exercises,
      exercisePlan: kwargs['exercise-plan'],
      sets: kwargs.sets,
      reps: kwargs.reps,
      holdDuration: kwargs['hold-duration'],
      targetUnits: kwargs['target-units'],
      weightKg: kwargs['weight-kg'],
      rest: kwargs.rest,
      targetDuration: kwargs['target-duration'],
      description: kwargs.description,
      dryRun: kwargs['dry-run'] === true,
    });
    return [result];
  },
});
