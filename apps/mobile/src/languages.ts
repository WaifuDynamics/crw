// Every ISO 639-1 language. People can pick any of them now, the choice is saved on
// the account, and the app switches once a translation ships. Until then everyone
// sees English.
const CODES = (
  'aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy ' +
  'da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht ' +
  'hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky ' +
  'la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny ' +
  'oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss ' +
  'st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo ' +
  'za zh zu'
).split(' ');

export const TRANSLATED_LANGUAGES = new Set([
  'en', 'pl', 'ar', 'es', 'de', 'fr', 'it', 'pt', 'uk', 'ru', 'tr', 'ja', 'ko', 'zh', 'nl', 'sv', 'no', 'da', 'fi', 'cs', 'sk', 'hu', 'el', 'ro'
]);

/** Languages the interface is actually translated into. */
export const TRANSLATED = TRANSLATED_LANGUAGES;

function displayNames(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' });
  } catch {
    return null;
  }
}

const english = displayNames('en');

export type Language = { code: string; name: string; native: string; available: boolean };

export const LANGUAGES: Language[] = CODES.map((code) => {
  const name = english?.of(code) || code;
  let native = name;
  const own = displayNames(code)?.of(code);
  if (own && own !== code) native = own.charAt(0).toLocaleUpperCase(code) + own.slice(1);
  return { code, name, native, available: TRANSLATED.has(code) };
})
  .filter((l, i, all) => all.findIndex((o) => o.name === l.name) === i)
  .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));

// The device language (pl-PL -> pl) when it is on the list.
export function deviceLanguage(): string | null {
  try {
    const base = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0].toLowerCase();
    return CODES.includes(base) ? base : null;
  } catch {
    return null;
  }
}

export const languageName = (code?: string | null) =>
  (code && LANGUAGES.find((l) => l.code === code)?.name) || code || '';
