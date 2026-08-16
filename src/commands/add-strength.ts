import { cli, Strategy } from '@jackwener/opencli/registry';

import { createCorosCoach } from '../coros/coach.js';

cli({
  site: 'coros-coach',
  name: 'add-strength',
  access: 'write',
  description: 'Calculate and add a strength session using the live COROS action catalog',
  example: 'opencli coros-coach add-strength --date 20260816 --name "Full body strength" --exercises "Warm Up,Deep Squat,Glute Bridge,Push Up,Plank,Cool Down" --sets 3 --reps 10 --weight-kg 0 --rest 00:01:00 --target-duration 00:35:00 --dry-run',
  domain: 't.coros.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'date', required: true, help: 'Calendar date, YYYYMMDD' },
    { name: 'name', required: true, help: 'Training name' },
    {
      name: 'exercises',
      required: true,
      help: 'Comma-separated exact names from strength-exercises',
    },
    { name: 'sets', type: 'int', default: 3, help: 'Default sets for every action' },
    { name: 'reps', type: 'int', default: 10, help: 'Default repetitions for every action' },
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
      sets: kwargs.sets,
      reps: kwargs.reps,
      weightKg: kwargs['weight-kg'],
      rest: kwargs.rest,
      targetDuration: kwargs['target-duration'],
      description: kwargs.description,
      dryRun: kwargs['dry-run'] === true,
    });
    return [result];
  },
});
