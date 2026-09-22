import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QR_PREFIX, formatCode, matchesCode, newCode, qrPayload } from './qr';

test('a new code is twelve unambiguous characters', () => {
  const code = newCode();
  assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/);
  assert.ok(!/[OI01]/.test(code), 'nothing a person could misread off paper');
});

test('two codes in a row differ', () => {
  const codes = new Set(Array.from({ length: 50 }, () => newCode()));
  assert.equal(codes.size, 50, 'no collisions in fifty draws');
});

test('a code round-trips through its own QR', () => {
  const code = newCode();
  assert.equal(matchesCode(qrPayload(code), code), true);
});

test('another alarm’s code does not switch this alarm off', () => {
  assert.equal(matchesCode(qrPayload(newCode()), newCode()), false);
});

test('a QR without the CRW+ prefix never matches', () => {
  const code = newCode();
  assert.equal(matchesCode(code, code), false, 'a bare code is not enough');
  assert.equal(matchesCode(`https://example.com/${code}`, code), false);
  assert.equal(matchesCode(`alarm:${code}`, code), false);
});

test('whitespace and case do not matter, because scanners add both', () => {
  const code = newCode();
  assert.equal(matchesCode(`  ${qrPayload(code)}  `, code), true);
  assert.equal(matchesCode(qrPayload(code).toUpperCase(), code), true);
  assert.equal(matchesCode(qrPayload(code.toLowerCase()), code), true);
});

test('the dashes shown on the printed card are ignored when scanning', () => {
  const code = newCode();
  assert.equal(matchesCode(`${QR_PREFIX}${formatCode(code)}`, code), true);
});

test('nothing at all matches nothing', () => {
  assert.equal(matchesCode('', 'ABCD'), false);
  assert.equal(matchesCode(qrPayload('ABCD'), ''), false);
  assert.equal(matchesCode(undefined as any, undefined as any), false);
});

test('a code is grouped in fours for reading aloud', () => {
  assert.equal(formatCode('K7M29QX4PB3D'), 'K7M2-9QX4-PB3D');
  assert.equal(formatCode('ABC'), 'ABC');
});
