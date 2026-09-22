// The code that lives on paper.
//
// Deliberately dependency-free, like errors.ts: no React Native, no expo-crypto, so the
// matching can be tested outside the app. The code is not a secret and guards nothing -
// anyone holding the printed sheet is meant to be able to use it. It only has to be
// unlikely to collide with another alarm's code, and specific enough that a stray QR in
// the kitchen cannot silence the alarm by accident.

/** What every CRW+ alarm QR starts with. A parcel label will not have this. */
export const QR_PREFIX = 'crw-alarm:';

// No O/0 or I/1: the code is printed, and people read printed things aloud.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 12;

export function newCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/** Everything that is not a code character, thrown away, so dashes and case do not matter. */
const canonical = (value: string) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** What the QR image encodes. */
export const qrPayload = (code: string) => `${QR_PREFIX}${code}`;

/** Whether a scanned QR is this alarm's own. */
export function matchesCode(payload: string, code: string): boolean {
  const text = String(payload ?? '').trim();
  const expected = canonical(code);
  if (!expected) return false;
  // The prefix is the whole point: without it, any QR carrying the right characters -
  // or a bare code on a screen - would count.
  if (!text.toLowerCase().startsWith(QR_PREFIX)) return false;
  return canonical(text.slice(QR_PREFIX.length)) === expected;
}

/** "K7M2-9QX4-PB3D": grouped for a human reading it off a printed card. */
export const formatCode = (code: string) =>
  (canonical(code).match(/.{1,4}/g) || []).join('-');
