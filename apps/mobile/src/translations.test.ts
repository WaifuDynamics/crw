/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translations, t, TRANSLATED_LANGUAGES, en, pl, ar } from './translations';

test('translations dictionary contains English and Polish with identical section keys', () => {
  assert.ok(translations.en, 'English dictionary must exist');
  assert.ok(translations.pl, 'Polish dictionary must exist');

  const enSections = Object.keys(en).sort();
  const plSections = Object.keys(pl).sort();
  assert.deepEqual(plSections, enSections, 'Polish should define every section present in English');
});

test('every English key in each section has a corresponding Polish translation', () => {
  for (const section of Object.keys(en) as (keyof typeof en)[]) {
    const enKeys = Object.keys(en[section]).sort();
    const plKeys = Object.keys(pl[section]).sort();
    assert.deepEqual(plKeys, enKeys, `Section "${section}" in Polish should match English keys`);
  }
});

test('translations dictionary contains Arabic and at least 20 additional languages', () => {
  assert.ok(translations.ar, 'Arabic dictionary must exist');
  const allLangs = Object.keys(translations);
  assert.ok(allLangs.length >= 22, `Expected at least 22 languages, got ${allLangs.length}`);
  assert.ok(allLangs.includes('ar'), 'Arabic must be in translations');
});

test('every language defines every section and key present in English', () => {
  for (const [langCode, dict] of Object.entries(translations)) {
    const enSections = Object.keys(en).sort();
    const langSections = Object.keys(dict).sort();
    assert.deepEqual(langSections, enSections, `Language "${langCode}" should define every section in English`);

    for (const section of Object.keys(en) as (keyof typeof en)[]) {
      const enKeys = Object.keys(en[section]).sort();
      const langKeys = Object.keys(dict[section]).sort();
      assert.deepEqual(langKeys, enKeys, `Section "${section}" in "${langCode}" should match English keys`);
    }
  }
});

test('t() returns translated strings in English, Polish and Arabic', () => {
  assert.equal(t('nav.discover', {}, 'en'), 'Discover');
  assert.equal(t('nav.discover', {}, 'pl'), 'Odkrywaj');
  assert.equal(t('nav.discover', {}, 'ar'), 'استكشاف');

  assert.equal(t('play.exercises.pushup', {}, 'en'), 'Push-ups');
  assert.equal(t('play.exercises.pushup', {}, 'pl'), 'Pompki');
  assert.equal(t('play.exercises.pushup', {}, 'ar'), 'ضغط');

  assert.equal(t('common.save', {}, 'en'), 'Save');
  assert.equal(t('common.save', {}, 'pl'), 'Zapisz');
  assert.equal(t('common.save', {}, 'ar'), 'حفظ');
});

test('t() supports parameter replacement in translations', () => {
  assert.equal(t('discover.card.spotsLeft', { count: 4 }, 'en'), '4 spots left');
  assert.equal(t('discover.card.spotsLeft', { count: 4 }, 'pl'), '4 wolnych miejsc');
  assert.equal(t('discover.card.spotsLeft', { count: 4 }, 'ar'), 'باقي 4 أماكن');
});

test('t() falls back gracefully to English if language is not supported or key is missing', () => {
  assert.equal(t('common.save', {}, 'non_existent_lang'), 'Save');
});

test('TRANSLATED_LANGUAGES includes English, Polish, Arabic and all supported languages', () => {
  assert.ok(TRANSLATED_LANGUAGES.has('en'));
  assert.ok(TRANSLATED_LANGUAGES.has('pl'));
  assert.ok(TRANSLATED_LANGUAGES.has('ar'));
  assert.ok(TRANSLATED_LANGUAGES.size >= 22);
});

test('every shipped translation is unlocked in the language lists, and only those', () => {
  const shipped = Object.keys(translations).sort();
  assert.deepEqual([...TRANSLATED_LANGUAGES].sort(), shipped);
});
