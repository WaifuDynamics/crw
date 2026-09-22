import { test } from 'node:test';
import assert from 'node:assert/strict';
import { older } from './appVersion';

test('versions compare by their numbers, not as text', () => {
  assert.equal(older('2.5.0', '2.6.0'), true);
  assert.equal(older('2.6.0', '2.6.0'), false);
  assert.equal(older('2.10.0', '2.9.3'), false, '10 is more than 9');
  assert.equal(older('2.9.3', '2.10.0'), true);
  assert.equal(older('3.0.0', '2.99.99'), false);
  assert.equal(older('2.6', '2.6.1'), true, 'a missing part counts as 0');
});
