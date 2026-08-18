import assert from 'node:assert/strict';
import test from 'node:test';

import {
  corosTargetValue,
  corosStrengthTarget,
  corosStrengthTargetUnit,
  formatStrengthTarget,
  parseStrengthDuration,
  resolveStrengthTarget,
} from '../src/coros/strength-target.js';

test('COROS targetType selects the default target unit', () => {
  const holdDuration = parseStrengthDuration('00:00:30-00:00:45');
  const target = resolveStrengthTarget(
    { name: '靠墙静蹲', originId: '469646870080307200', targetType: 2 },
    { reps: 10, holdDuration },
  );

  assert.equal(corosStrengthTargetUnit({ name: '靠墙静蹲', targetType: 2 }), 'time');
  assert.deepEqual(target, { kind: 'duration', minSeconds: 30, maxSeconds: 45 });
  assert.equal(formatStrengthTarget(target), '00:00:30–00:00:45');
  assert.equal(corosTargetValue(target), 45);
});

test('unknown COROS target types default to repetitions without matching names', () => {
  const holdDuration = parseStrengthDuration('00:00:30-00:00:45');

  assert.equal(corosStrengthTargetUnit({ name: '靠墙静蹲' }), 'reps');
  assert.deepEqual(
    resolveStrengthTarget({ name: '靠墙静蹲' }, { reps: 12, holdDuration }),
    { kind: 'reps', value: 12 },
  );
});

test('catalog targets are exposed by strength-exercises', () => {
  assert.deepEqual(
    corosStrengthTarget({ name: '平板支撑', targetType: 2, targetValue: 30 }),
    { kind: 'duration', minSeconds: 30, maxSeconds: 30 },
  );
  assert.deepEqual(
    corosStrengthTarget({ name: '深蹲', targetType: 3, targetValue: 10 }),
    { kind: 'reps', value: 10 },
  );
});

test('duration supports exact values and ordered ranges', () => {
  assert.deepEqual(
    parseStrengthDuration('00:01:00'),
    { kind: 'duration', minSeconds: 60, maxSeconds: 60 },
  );
  assert.throws(
    () => parseStrengthDuration('00:00:45-00:00:30'),
    /shortest to longest/,
  );
});
