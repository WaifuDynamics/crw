import { entry, EntryPage, EntryHeader, EntryButton as Button, EntryToggle } from '../components/Entry';
import { tint } from '../theme';
import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { patch, useAction, useSession } from '../api';
import { C, Heading, Icon, Label, S, T, Tap } from '../ui';
import { COUNTRIES, deviceCountry } from '../countries';
import { LANGUAGES, TRANSLATED, deviceLanguage, languageName } from '../languages';
import { setGlobalLanguage } from '../translations';

type Answers = {
  language: string | null;
  countryCode: string | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
};

type Step = {
  key: keyof Answers;
  eyebrow: string;
  title: string;
  why: string;
  skipWarning: string;
  unit?: string;
  min?: number;
  max?: number;
  decimals?: boolean;
  placeholder?: string;
};

const STEPS: Step[] = [
  {
    key: 'language',
    eyebrow: 'MAKE IT YOURS',
    title: 'YOUR LANGUAGE.',
    why: 'Choose your preferred language.',
    skipWarning: 'No problem - we’ll use English. You can change it later in your profile.',
  },
  {
    key: 'countryCode',
    eyebrow: 'WHERE YOU MOVE',
    title: 'YOUR COUNTRY.',
    why: 'We use it for nearby activities, units and local rankings.',
    skipWarning:
      'Without your country we can’t tailor activities and rankings to where you are, and calorie estimates lose useful context.',
  },
  {
    key: 'age',
    eyebrow: 'A LITTLE ABOUT YOU',
    title: 'HOW OLD ARE YOU?',
    why: 'Age changes how many calories your body burns at rest and during effort.',
    skipWarning:
      'Skipping your age makes calorie and effort estimates less accurate — we’ll fall back to an average adult.',
    unit: 'years',
    min: 13,
    max: 120,
    placeholder: 'e.g. 29',
  },
  {
    key: 'weightKg',
    eyebrow: 'FOR BETTER NUMBERS',
    title: 'YOUR WEIGHT.',
    why: 'Weight is the biggest factor in how many calories a workout burns.',
    skipWarning:
      'Skipping your weight makes calorie counts noticeably less accurate — every workout estimate depends on it.',
    unit: 'kg',
    min: 25,
    max: 350,
    decimals: true,
    placeholder: 'e.g. 72.5',
  },
  {
    key: 'heightCm',
    eyebrow: 'MADE FOR YOUR STRIDE',
    title: 'YOUR HEIGHT.',
    why: 'Height helps estimate your stride and resting energy use.',
    skipWarning: 'Skipping your height makes calorie and distance estimates less accurate.',
    unit: 'cm',
    min: 90,
    max: 250,
    placeholder: 'e.g. 178',
  },
];

function parseNumber(text: string, step: Step) {
  const value = Number(text.replace(',', '.'));
  if (!text.trim() || !Number.isFinite(value)) return { value: null, error: '' };
  if (!step.decimals && !Number.isInteger(value))
    return { value: null, error: 'Use a whole number.' };
  if (value < step.min! || value > step.max!)
    return {
      value: null,
      error: `Enter a value between ${step.min} and ${step.max} ${step.unit}.`,
    };
  return { value: step.decimals ? Math.round(value * 10) / 10 : value, error: '' };
}

type Option = { code: string; name: string; detail?: string; badge?: string };

const COUNTRY_OPTIONS: Option[] = COUNTRIES;
const LANGUAGE_OPTIONS: Option[] = LANGUAGES.map((l) => ({
  code: l.code,
  name: l.name,
  detail: l.native,
  badge: l.available ? 'Available' : 'Coming soon',
}));

function OptionPicker({
  options,
  value,
  onChange,
  noun,
}: {
  options: Option[];
  value: string | null;
  onChange: (c: string) => void;
  noun: string;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.detail || '').toLowerCase().includes(q) ||
            c.code.toLowerCase() === q,
        )
      : options;
    return [...list].sort((a, b) => Number(b.code === value) - Number(a.code === value));
  }, [query, options, value]);
  return (
    <View>
      <View style={[entry.input, S.row, { gap: 14, paddingVertical: 0 }]}>
        <Icon name="search-outline" color={C.gray} size={23} />
        <TextInput accessibilityLabel={`Search ${noun}`} value={query} onChangeText={setQuery}
          placeholder={`Search ${noun}`} placeholderTextColor={C.gray} autoCorrect={false}
          style={{ flex: 1, minWidth: 0, paddingVertical: 15, color: C.white, fontFamily: 'Inter', fontSize: 14 }} />
      </View>
      <Label style={entry.section}>{noun === 'languages' ? 'PREFERRED LANGUAGE' : 'YOUR COUNTRY'}</Label>
      <ScrollView style={{ maxHeight: 342 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 7 }}>
        {matches.map((c) => {
          const active = c.code === value;
          return <Tap key={c.code} label={c.name} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onChange(c.code)}
            style={[entry.panel, S.row, { minHeight: 55, paddingHorizontal: 15, paddingVertical: 11, gap: 18,
              borderColor: active ? C.blue : entry.panel.borderColor, backgroundColor: active ? tint('#0B1B2A') : entry.panel.backgroundColor }]}>
            <View style={{ width: 25, height: 25, borderRadius: 13, borderWidth: active ? 0 : 1.5, borderColor: C.gray, backgroundColor: active ? C.blue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {active && <Icon name="checkmark" size={19} color="#FFFFFF" />}
            </View>
            <View style={{ flex: 1 }}><T style={{ color: C.white, fontSize: 14, lineHeight: 19 }}>{c.name}</T>
              {!!c.detail && <T style={{ fontSize: 12, lineHeight: 17, marginTop: 2, textAlign: 'left' }}>{c.detail}</T>}
            </View>
            {!!c.badge && <T style={{ fontSize: 11, color: active ? C.blue : C.gray }}>{c.badge}</T>}
          </Tap>;
        })}
        {!matches.length && <T style={{ padding: 16 }}>No {noun} match “{query}”.</T>}
      </ScrollView>
    </View>
  );
}

export default function Onboarding({ navigation }: any) {
  const { user, refresh, say } = useSession();
  const { busy, run } = useAction();
  const account = user?.account || {};
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    // Email sign-ups start as "en" by default, so the device language is the better guess.
    language:
      (account.language && account.language !== 'en' ? account.language : deviceLanguage()) || 'en',
    countryCode: account.country_code || deviceCountry(),
    age: account.age ?? null,
    weightKg: account.weight_kg ?? null,
    heightCm: account.height_cm ?? null,
  });
  const [text, setText] = useState('');
  const [warning, setWarning] = useState(false);
  const [skipped, setSkipped] = useState<(keyof Answers)[]>([]);
  // Marketing consent is its own last screen and starts unticked.
  const [marketing, setMarketing] = useState<boolean>(!!account.marketing_opt_in);
  const TOTAL = STEPS.length + 1;
  const consentScreen = index >= STEPS.length;

  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const isList = step.key === 'countryCode' || step.key === 'language';
  const parsed = isList
    ? { value: answers[step.key] as string | null, error: '' }
    : parseNumber(text, step);
  const canContinue = parsed.value !== null && parsed.value !== '';

  const leave = () =>
    navigation.canGoBack()
      ? navigation.goBack()
      : navigation.reset({ index: 0, routes: [{ name: 'Home' }] });

  const finish = (final: Answers) =>
    run(async () => {
      await patch('/account', { ...final, marketingOptIn: marketing, onboardingComplete: true });
      await refresh();
      if (skipped.length || Object.values(final).some((v) => v === null))
        say('You can add the missing details any time in your profile for more accurate calories.');
      leave();
    });

  const goTo = (next: number, final: Answers) => {
    setWarning(false);
    if (next >= STEPS.length) {
      setIndex(STEPS.length);
      return;
    }
    const nextStep = STEPS[next];
    const existing = final[nextStep.key];
    const list = nextStep.key === 'countryCode' || nextStep.key === 'language';
    setText(list || existing === null ? '' : String(existing));
    setIndex(next);
  };

  const answer = () => {
    const final = { ...answers, [step.key]: parsed.value } as Answers;
    setAnswers(final);
    setSkipped((s) => s.filter((k) => k !== step.key));
    goTo(index + 1, final);
  };

  const skip = () => {
    // A skipped language keeps English rather than clearing the account's language.
    const final = { ...answers, [step.key]: step.key === 'language' ? 'en' : null } as Answers;
    setAnswers(final);
    setSkipped((s) => [...new Set([...s, step.key])]);
    goTo(index + 1, final);
  };

  return (
    <EntryPage>
        <EntryHeader step={index + 1} onBack={index > 0 ? () => {
          const current = !consentScreen && canContinue ? { ...answers, [step.key]: parsed.value } as Answers : answers;
          setAnswers(current);
          goTo(index - 1, current);
        } : undefined} />
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: TOTAL, now: index + 1 }} style={{ height: 7, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' }}>
          <View style={{ width: `${((index + 1) / TOTAL) * 100}%`, height: 7, borderRadius: 4, backgroundColor: C.blue }} />
        </View>

        {consentScreen ? (
          <View style={{ flex: 1 }}>
            <Label style={entry.eyebrow}>LAST ONE, PROMISE</Label>
            <Heading
              style={entry.title}
            >
              STAY IN THE LOOP?
            </Heading>
            <T style={entry.subtitle}>
              A short email each morning: today’s challenge, your record and activities worth
              getting out for. Totally optional.
            </T>
            <EntryToggle title="Daily ideas & offers" description="Send me the daily CRW+ email. Unsubscribe anytime." value={marketing} onChange={setMarketing} />
            <T style={{ fontSize: 11, lineHeight: 17, marginTop: 12 }}>
              Account emails like password resets and tickets always arrive, whatever you choose
              here.
            </T>
            <View style={entry.footer}>
            <Button
              title="Finish setup"
              icon="arrow-forward"
              loading={busy}
              onPress={() => finish(answers)}
            />
            <T style={{ fontSize: 12, textAlign: 'center' }}>Your preferences. Your pace.</T>
            </View>
          </View>
        ) : (
          <>
            <Label style={entry.eyebrow}>{step.eyebrow}</Label>
            <Heading
              style={entry.title}
            >
              {step.title}
            </Heading>
            <T style={entry.subtitle}>{step.why}</T>

            {step.key === 'language' ? (
              <View style={{ gap: 12 }}>
                <View style={[entry.panel, S.row, { gap: 17 }]}>
                  <Icon name="globe-outline" size={28} color={C.blue} />
                  <T style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>Choose a language available now, or save your preference for when it arrives.</T>
                </View>
                <OptionPicker
                  options={LANGUAGE_OPTIONS}
                  value={answers.language}
                  noun="languages"
                  onChange={(code) => {
                    setAnswers((a) => ({ ...a, language: code }));
                    // A translated language takes effect right away.
                    if (TRANSLATED.has(code)) setGlobalLanguage(code);
                  }}
                />
                {!TRANSLATED.has(answers.language || 'en') && (
                  <View style={[S.row, { gap: 8, alignItems: 'flex-start', paddingHorizontal: 4 }]}>
                    <Icon name="information-circle-outline" color={C.blue} size={16} />
                    <T style={{ flex: 1, fontSize: 12, lineHeight: 18 }}>
                      {languageName(answers.language)} is coming soon. We’ll save your choice and
                      show CRW+ in English until then.
                    </T>
                  </View>
                )}
              </View>
            ) : step.key === 'countryCode' ? (
              <OptionPicker
                options={COUNTRY_OPTIONS}
                value={answers.countryCode}
                noun="countries"
                onChange={(code) => setAnswers((a) => ({ ...a, countryCode: code }))}
              />
            ) : (
              <View>
                <View style={[S.row, { gap: 10 }]}>
                  <TextInput
                    accessibilityLabel={`${step.title} in ${step.unit}`}
                    value={text}
                    onChangeText={(v) => {
                      setText(v);
                      setWarning(false);
                    }}
                    onSubmitEditing={() => canContinue && answer()}
                    keyboardType={step.decimals ? 'decimal-pad' : 'number-pad'}
                    placeholder={step.placeholder}
                    placeholderTextColor={tint('#777D89')}
                    style={[
                      entry.input,
                      { flex: 1, minWidth: 0, fontSize: 36, minHeight: 100, fontFamily: 'InterBold' },
                    ]}
                  />
                  <View style={{ minWidth: 54, alignItems: 'center' }}>
                    <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 15 }}>
                      {step.unit}
                    </T>
                  </View>
                </View>
                {!!parsed.error && <T style={[S.error, { marginTop: 10 }]}>{parsed.error}</T>}
              </View>
            )}

            <T style={{ fontSize: 12, marginTop: 22 }}>You can change this later in Settings.</T>
            {warning ? (
              <View
                accessibilityRole="alert"
                style={{
                  marginTop: 24,
                  padding: 18,
                  borderRadius: 16,
                  backgroundColor: tint('#2A2112'),
                  borderWidth: 1,
                  borderColor: tint('#5C4520'),
                  gap: 14,
                }}
              >
                <View style={[S.row, { gap: 10, alignItems: 'flex-start' }]}>
                  <Icon name="warning-outline" color={tint('#FFD18B')} size={20} />
                  <T style={{ flex: 1, color: tint('#FFE3B8'), fontSize: 13, lineHeight: 20 }}>
                    {step.skipWarning}
                  </T>
                </View>
                <View style={[S.row, { gap: 10 }]}>
                  <Button
                    title="Go back"
                    variant="dark"
                    style={{ flex: 1 }}
                    onPress={() => setWarning(false)}
                  />
                  <Button
                    title="Skip anyway"
                    variant="outline"
                    style={{ flex: 1 }}
                    onPress={skip}
                  />
                </View>
              </View>
            ) : (
              <View style={entry.footer}>
                <Button
                  title="Continue"
                  icon="arrow-forward"
                  disabled={!canContinue}
                  loading={busy}
                  onPress={answer}
                />
                <Tap
                  label="Skip this question"
                  onPress={() => setWarning(true)}
                  style={{ alignItems: 'center', paddingVertical: 12 }}
                >
                  <T style={{ color: C.gray, fontFamily: 'InterBold', fontSize: 12 }}>
                    Skip for now
                  </T>
                </Tap>
              </View>
            )}
          </>
        )}
    </EntryPage>
  );
}
