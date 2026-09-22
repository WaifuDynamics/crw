import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorKey } from './errors';
import { en } from './translations';

const withStatus = (status: number) => Object.assign(new Error('raw server text'), { status });

test('losing the connection is its own message', () => {
  assert.equal(errorKey(Object.assign(new Error('x'), { offline: true })), 'errors.offline');
});

test('401 means a wrong password on the way in and a dead session everywhere else', () => {
  assert.equal(errorKey(withStatus(401), 'signin'), 'errors.signIn');
  assert.equal(errorKey(withStatus(401)), 'errors.session');
});

test('the statuses worth their own wording get it', () => {
  assert.equal(errorKey(withStatus(400)), 'errors.invalid');
  assert.equal(errorKey(withStatus(422)), 'errors.invalid');
  assert.equal(errorKey(withStatus(403)), 'errors.noAccess');
  assert.equal(errorKey(withStatus(404)), 'errors.notFound');
  assert.equal(errorKey(withStatus(409)), 'errors.conflict');
  assert.equal(errorKey(withStatus(413)), 'errors.tooLarge');
  assert.equal(errorKey(withStatus(429)), 'errors.tooMany');
});

test('every server fault is one apology', () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(errorKey(withStatus(status)), 'errors.server', String(status));
  }
});

test('anything unrecognised falls back to the generic line', () => {
  assert.equal(errorKey(new Error('kaboom')), 'errors.generic');
  assert.equal(errorKey(null), 'errors.generic');
  assert.equal(errorKey(undefined), 'errors.generic');
  assert.equal(errorKey({}), 'errors.generic');
  assert.equal(errorKey(withStatus(418)), 'errors.generic');
});

test('the server’s own words never come back', () => {
  const leaky = Object.assign(
    new Error('Invalid request: email must be a valid email, password must be at least 12'),
    { status: 400 },
  );
  const key = errorKey(leaky);
  assert.equal(key, 'errors.invalid');
  assert.ok(!key.includes('email'), 'the key is ours, not the server’s sentence');
});

test('every key errorKey can return actually exists in English', () => {
  const keys = new Set<string>([
    errorKey({ offline: true }),
    errorKey(withStatus(401), 'signin'),
    errorKey(withStatus(401)),
    errorKey(withStatus(400)),
    errorKey(withStatus(403)),
    errorKey(withStatus(404)),
    errorKey(withStatus(409)),
    errorKey(withStatus(413)),
    errorKey(withStatus(429)),
    errorKey(withStatus(500)),
    errorKey(new Error('x')),
  ]);
  for (const key of keys) {
    const name = key.replace('errors.', '') as keyof typeof en.errors;
    assert.ok(en.errors[name], `en.errors.${name} is missing`);
  }
});

test('no error line is a wall of text', () => {
  for (const [name, line] of Object.entries(en.errors)) {
    assert.ok(line.length <= 90, `errors.${name} is ${line.length} characters: "${line}"`);
  }
});
