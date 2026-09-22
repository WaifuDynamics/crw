import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNumber, next, parse } from './version.mjs';

test('bumps', () => {
  assert.equal(next('1.4.2', 'patch'), '1.4.3');
  assert.equal(next('1.4.2', 'minor'), '1.5.0');
  assert.equal(next('1.4.2', 'major'), '2.0.0');
  assert.equal(next('1.5.0-beta.2', 'patch'), '1.5.0', 'a patch release finalises a prerelease');
  assert.equal(next('1.4.2', 'v2.0.0-rc.1'), '2.0.0-rc.1');
});

test('build numbers grow with the version', () => {
  assert.equal(buildNumber('1.0.0'), 1_000_000);
  assert.equal(buildNumber('1.4.2'), 1_004_002);
  assert.ok(buildNumber('1.10.0') > buildNumber('1.9.999'));
  assert.ok(buildNumber('2.0.0') > buildNumber('1.999.999'));
});

test('rejects bad versions', () => {
  assert.throws(() => parse('1.2'));
  assert.throws(() => parse('1.1000.0'));
  assert.throws(() => next('1.0.0', 'huge'));
});
