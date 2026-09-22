import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import MobileModal from '../components/MobileModal';
import AlarmQrCard from '../components/AlarmQrCard';
import { tint } from '../theme';
import { C, Heading, Icon, S, T, Tap, Toggle } from '../ui';
import { useTranslation } from '../translations';
import { CLAY, ClayButton, ClayIconButton, Slab, Well, clay, type ClayTone } from '../components/clay';
import { MAX_REPS, MIN_REPS, type Alarm, type Challenge } from '../alarms/model';
import { newCode } from '../alarms/qr';

// Editing one alarm. Dressed in the Tracking page's clay: puffy slabs for anything you
// press, wells for anything you read a value out of. See components/clay.

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const pad = (n: number) => String(n).padStart(2, '0');
const ITEM = 46;

function Wheel({
  values,
  value,
  onChange,
  label,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, values.indexOf(value));

  const settle = (offset: number) => {
    const i = Math.round(offset / ITEM);
    const next = values[Math.min(values.length - 1, Math.max(0, i))];
    if (next !== value) onChange(next);
  };

  useEffect(() => {
    // Jump to the current value once the wheel has a size to scroll within.
    const id = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM, animated: false }), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <ScrollView
      ref={ref}
      accessibilityLabel={label}
      showsVerticalScrollIndicator={false}
      // Without this the sheet's own ScrollView swallows the drag on Android and the
      // wheel never moves: two vertical scroll views, one inside the other.
      nestedScrollEnabled
      snapToInterval={ITEM}
      snapToAlignment="start"
      decelerationRate="fast"
      // A blank row above and below, so the first and last value can sit in the middle.
      contentContainerStyle={{ paddingVertical: ITEM }}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      // A slow drag that stops where it is never fires onMomentumScrollEnd. One that was
      // flung still has momentum to run off, and settling here would pick the number the
      // finger left rather than the one it lands on, so that case is left to the handler
      // above.
      onScrollEndDrag={(e) => {
        if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e.nativeEvent.contentOffset.y);
      }}
      style={{ height: ITEM * 3, width: 84 }}
    >
      {values.map((v) => (
        <View key={v} style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}>
          <T
            style={{
              fontFamily: 'Display',
              fontSize: v === value ? 42 : 33,
              lineHeight: ITEM,
              color: v === value ? C.white : tint('#5C6675'),
            }}
          >
            {pad(v)}
          </T>
        </View>
      ))}
    </ScrollView>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/** A heading at the size and weight the Tracking sections use. */
function Section({ title }: { title: string }) {
  return (
    <T
      style={{
        fontFamily: 'Display',
        fontSize: 27,
        lineHeight: 30,
        color: C.white,
        marginTop: 26,
        marginBottom: 12,
      }}
    >
      {title}
    </T>
  );
}

/**
 * A day of the week. Round rather than a squeezed oval: seven of these across a phone
 * leaves about forty points each, which is a circle, and a circle does not pretend to
 * have room for more text than it has.
 */
function DayChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const tone: ClayTone = active ? 'blue' : 'graphite';
  return (
    <Tap
      label={label}
      onPress={onPress}
      style={[
        clay(tone, active ? 1 : 0.6),
        {
          flex: 1,
          minWidth: 0,
          aspectRatio: 1,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <T
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontFamily: 'InterBold', fontSize: 12, lineHeight: 15, color: CLAY[tone].ink }}
      >
        {label}
      </T>
    </Tap>
  );
}

/** Weekdays, the weekend, every day: the three sets people actually pick. */
function DayPresets({
  days,
  onPick,
}: {
  days: number[];
  onPick: (days: number[]) => void;
}) {
  const { t } = useTranslation();
  const sets: [string, number[]][] = [
    [t('alarms.weekdays'), [1, 2, 3, 4, 5]],
    [t('alarms.weekends'), [6, 7]],
    [t('alarms.everyDay'), [1, 2, 3, 4, 5, 6, 7]],
  ];
  const current = [...days].sort((a, b) => a - b).join();
  return (
    <View style={[S.row, { gap: 6, marginBottom: 10 }]}>
      {sets.map(([label, set]) => {
        const active = current === set.join();
        return (
          <Tap
            key={label}
            label={label}
            onPress={() => onPick(active ? [] : set)}
            style={[
              clay(active ? 'blue' : 'graphite', active ? 0.9 : 0.5),
              { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
            ]}
          >
            <T
              style={{
                fontFamily: 'InterBold',
                fontSize: 11,
                lineHeight: 15,
                color: CLAY[active ? 'blue' : 'graphite'].ink,
              }}
            >
              {label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

/**
 * One way of switching the alarm off, full width. Three of these side by side would be
 * cramped on a phone, and the QR option needs a sentence to explain itself.
 */
function ChallengeRow({
  icon,
  title,
  description,
  active,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  active: boolean;
  onPress: () => void;
}) {
  const tone: ClayTone = active ? 'blue' : 'graphite';
  const ink = CLAY[tone].ink;
  return (
    <Tap
      label={title}
      onPress={onPress}
      style={[
        clay(tone, active ? 1 : 0.6),
        {
          borderRadius: 22,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        },
      ]}
    >
      <View
        style={[
          clay(active ? 'cream' : 'blue', 0.7),
          { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <Icon name={icon} size={20} color={CLAY[active ? 'cream' : 'blue'].ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={{ fontFamily: 'InterBold', fontSize: 15, lineHeight: 20, color: ink }}>
          {title}
        </T>
        <T style={{ fontSize: 12, lineHeight: 17, color: ink, opacity: 0.75, marginTop: 2 }}>
          {description}
        </T>
      </View>
      {active && <Icon name="checkmark-circle" size={22} color={ink} />}
    </Tap>
  );
}

export default function AlarmSheet({
  visible,
  alarm,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  alarm: Alarm | null;
  onClose: () => void;
  onSave: (a: Alarm) => void;
  onDelete: ((id: string) => void) | null;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Alarm | null>(alarm);
  // Which QR sheet is open: the one that explains before choosing, or the one that just
  // hands back the code of an alarm that already uses it.
  const [qr, setQr] = useState<'choosing' | 'viewing' | null>(null);

  // Minted once per alarm, not per render: `draft.code || newCode()` in the render body
  // would hand the QR sheet a different code every time React drew it.
  const minted = useRef<string>('');
  useEffect(() => {
    setDraft(alarm);
    setQr(null);
    minted.current = alarm?.code || newCode();
  }, [alarm?.id, visible]);
  if (!draft) return null;

  const set = (patch: Partial<Alarm>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggleDay = (day: number) =>
    set({
      days: draft.days.includes(day)
        ? draft.days.filter((d) => d !== day)
        : [...draft.days, day].sort((a, b) => a - b),
    });

  // The code has to exist before the sheet can show it, so it is ready before the
  // challenge is finally chosen.
  const code = draft.code || minted.current;
  const pickChallenge = (challenge: Challenge) => {
    if (challenge === 'qr') {
      set({ code });
      setQr('choosing');
      return;
    }
    set({ challenge, exercise: challenge });
  };

  const isQr = draft.challenge === 'qr';

  return (
    <MobileModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={S.page}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 40,
            width: '100%',
            maxWidth: 480,
            alignSelf: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[S.between, { alignItems: 'center', gap: 12, marginBottom: 6 }]}>
            <ClayIconButton icon="arrow-back" label={t('common.back')} onPress={onClose} />
            {!!onDelete && (
              <ClayIconButton
                icon="trash-outline"
                label={t('common.delete')}
                tone="ember"
                onPress={() => onDelete(draft.id)}
              />
            )}
          </View>

          <Heading style={{ fontSize: 46, lineHeight: 50, marginBottom: 18 }}>
            {t('alarms.title')}
          </Heading>

          {/* The time is read rather than pressed, so it sits in a well, not on a slab. */}
          <Well radius={28} style={{ paddingVertical: 6 }}>
            <View
              style={[
                S.row,
                { justifyContent: 'center', alignItems: 'center', gap: 2, overflow: 'hidden' },
              ]}
            >
              <View
                pointerEvents="none"
                style={[
                  clay('blue', 0.7),
                  {
                    position: 'absolute',
                    left: 16,
                    right: 16,
                    // The wheels are three rows tall and the chosen value is the middle
                    // one, so the band starts exactly one row down.
                    top: ITEM,
                    height: ITEM,
                    borderRadius: 16,
                  },
                ]}
              />
              <Wheel
                values={HOURS}
                value={draft.hour}
                onChange={(hour) => set({ hour })}
                label={t('alarms.hour')}
              />
              <T style={{ fontFamily: 'Display', fontSize: 36, lineHeight: 44, color: C.gray }}>
                :
              </T>
              <Wheel
                values={MINUTES}
                value={draft.minute}
                onChange={(minute) => set({ minute })}
                label={t('alarms.minute')}
              />
            </View>
          </Well>

          <Section title={t('alarms.days')} />
          <DayPresets days={draft.days} onPick={(days) => set({ days })} />
          <View style={[S.row, { gap: 6 }]}>
            {DAY_KEYS.map((key, i) => (
              <DayChip
                key={key}
                label={t(`alarms.${key}`)}
                active={draft.days.includes(i + 1)}
                onPress={() => toggleDay(i + 1)}
              />
            ))}
          </View>
          <T style={{ fontSize: 11, lineHeight: 16, color: C.gray, marginTop: 8 }}>
            {t('alarms.onceWhy')}
          </T>

          <Section title={t('alarms.challenge')} />
          <View style={{ gap: 10 }}>
            <ChallengeRow
              icon="fitness-outline"
              title={t('alarms.pushups')}
              description={t('alarms.pushupsWhy')}
              active={draft.challenge === 'pushup'}
              onPress={() => pickChallenge('pushup')}
            />
            <ChallengeRow
              icon="body-outline"
              title={t('alarms.squats')}
              description={t('alarms.squatsWhy')}
              active={draft.challenge === 'squat'}
              onPress={() => pickChallenge('squat')}
            />
            <ChallengeRow
              icon="qr-code-outline"
              title={t('alarms.qrChallenge')}
              description={t('alarms.qrChallengeWhy')}
              active={isQr}
              onPress={() => pickChallenge('qr')}
            />
          </View>

          {isQr ? (
            <Slab radius={26} style={{ marginTop: 12, padding: 16 }}>
              <View style={[S.between, { alignItems: 'center', gap: 12 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T
                    style={{ fontFamily: 'InterSemi', fontSize: 14, lineHeight: 20, color: C.white }}
                  >
                    {t('alarms.qrYourCode')}
                  </T>
                  <T style={{ fontSize: 11, lineHeight: 16, color: C.gray, marginTop: 2 }}>
                    {t('alarms.qrReprint')}
                  </T>
                </View>
                <ClayIconButton
                  icon="qr-code-outline"
                  label={t('alarms.qrYourCode')}
                  size={44}
                  tone="blue"
                  onPress={() => setQr('viewing')}
                />
              </View>
            </Slab>
          ) : (
            <Slab radius={26} style={{ marginTop: 12, padding: 16 }}>
              <View style={[S.between, { alignItems: 'center', gap: 12 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T
                    style={{ fontFamily: 'InterSemi', fontSize: 14, lineHeight: 20, color: C.white }}
                  >
                    {t('alarms.reps')}
                  </T>
                  <T style={{ fontSize: 11, lineHeight: 16, color: C.gray, marginTop: 2 }}>
                    {t('alarms.repsWhy')}
                  </T>
                </View>
                <View style={[S.row, { gap: 10, alignItems: 'center' }]}>
                  <ClayIconButton
                    icon="remove"
                    label={t('alarms.fewer')}
                    size={40}
                    onPress={() => set({ reps: Math.max(MIN_REPS, draft.reps - 1) })}
                  />
                  <T
                    style={{
                      fontFamily: 'Display',
                      fontSize: 34,
                      lineHeight: 40,
                      color: C.white,
                      minWidth: 48,
                      textAlign: 'center',
                    }}
                  >
                    {draft.reps}
                  </T>
                  <ClayIconButton
                    icon="add"
                    label={t('alarms.more')}
                    size={40}
                    tone="blue"
                    onPress={() => set({ reps: Math.min(MAX_REPS, draft.reps + 1) })}
                  />
                </View>
              </View>
            </Slab>
          )}

          <Slab radius={26} style={{ marginTop: 10, paddingHorizontal: 16, paddingVertical: 2 }}>
            <Toggle
              title={t('alarms.snooze')}
              description={t('alarms.snoozeWhy')}
              value={draft.snooze}
              onChange={(snooze: boolean) => set({ snooze })}
            />
          </Slab>

          <View style={{ marginTop: 26 }}>
            <ClayButton
              title={t('common.save')}
              icon="checkmark"
              tone="lime"
              size="large"
              onPress={() => onSave(draft)}
            />
          </View>
        </ScrollView>
      </View>

      <AlarmQrCard
        visible={qr !== null}
        code={draft.code || code}
        hour={draft.hour}
        minute={draft.minute}
        onClose={() => setQr(null)}
        onChoose={
          qr === 'choosing'
            ? () => {
                set({ challenge: 'qr', code });
                setQr(null);
              }
            : undefined
        }
      />
    </MobileModal>
  );
}
