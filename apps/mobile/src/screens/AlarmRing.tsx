import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { CameraView } from 'expo-camera';
import { clay } from '../claySurface';
import { tint } from '../theme';
import { Button, C, Icon, Label, S, T } from '../ui';
import { useTranslation } from '../translations';
import { useSession } from '../api';
import { recordSolo } from '../reps';
import { embeddedCounterPage } from '../reps/embedded';
import RepCounterView from '../components/RepCounterView';
import { CameraGate, counterQuery } from './Reps';
import { CrwAlarm } from '../../modules/crw-alarm';
import {
  EMERGENCY_HOLD_MS,
  SNOOZE_MINUTES,
  breakStreak,
  completeStreak,
  currentStreak,
  type Alarm,
} from '../alarms/model';
import { loadStreak, saveStreak } from '../alarms/store';
import { matchesCode } from '../alarms/qr';

// The alarm going off. Drawn over the whole navigator rather than pushed onto it, so
// there is nowhere to navigate away to and the back button has nothing to go back to.
//
// Three ways out, and only one of them is free: finish the reps, snooze if the alarm
// allows it, or hold the emergency button for fifteen seconds. The last one exists
// because the pose model needs light, and a dark bedroom is exactly where an alarm with
// no way out would trap somebody.

const pad = (n: number) => String(n).padStart(2, '0');

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Checked every second but only stored when the minute actually turns: the display
    // is never stale, and the screen is not re-rendered sixty times a minute for nothing.
    const timer = setInterval(() => {
      const next = new Date();
      setNow((current) => (next.getMinutes() === current.getMinutes() ? current : next));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The emergency way out: held down, not tapped, and long enough to be a decision rather
 * than a reflex at 7:00. The fill, the countdown and the taps on the wrist all say the
 * same thing, so it is obvious the button is doing something and how much is left.
 */
function EmergencyHold({ onGiveUp }: { onGiveUp: () => void }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const started = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ticked = useRef(0);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    started.current = null;
    ticked.current = 0;
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const begin = () => {
    if (timer.current) return;
    started.current = Date.now();
    ticked.current = 0;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    timer.current = setInterval(() => {
      const from = started.current;
      if (from === null) return;
      const held = Date.now() - from;
      const done = Math.min(1, held / EMERGENCY_HOLD_MS);
      setProgress(done);

      // One tap on the wrist per second, so the countdown is felt without looking.
      const second = Math.floor(held / 1000);
      if (second > ticked.current) {
        ticked.current = second;
        if (done < 1) void Haptics.selectionAsync().catch(() => {});
      }

      if (done >= 1) {
        stop();
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onGiveUp();
      }
    }, 50);
  };

  const holding = progress > 0;
  const left = Math.max(1, Math.ceil((EMERGENCY_HOLD_MS * (1 - progress)) / 1000));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('alarms.cantDoIt')}
      accessibilityHint={t('alarms.cantDoItWhy')}
      onPressIn={begin}
      onPressOut={stop}
      style={{
        // The same clay as the rest of the app, reddening as it is held.
        ...clay(holding ? 'ember' : 'graphite', holding ? 0.9 : 0.7),
        borderRadius: 18,
        overflow: 'hidden',
        paddingVertical: 15,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 64,
      }}
    >
      {/* Sweeps across as it is held, so the wait is visible rather than guessed at. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${Math.round(progress * 100)}%`,
          backgroundColor: tint('#42212C'),
        }}
      />
      <View style={[S.row, { gap: 9, alignItems: 'center' }]}>
        <Icon
          name={holding ? 'hourglass-outline' : 'hand-left-outline'}
          size={18}
          color={holding ? C.white : C.gray}
        />
        <T
          style={{
            color: holding ? C.white : C.gray,
            fontFamily: 'InterBold',
            fontSize: 14,
            lineHeight: 19,
          }}
        >
          {holding ? t('alarms.keepHolding', { seconds: left }) : t('alarms.cantDoIt')}
        </T>
      </View>
      <Label style={{ fontSize: 9, lineHeight: 13, marginTop: 4, textAlign: 'center' }}>
        {holding ? t('alarms.keepHoldingWhy') : t('alarms.cantDoItWhy')}
      </Label>
    </Pressable>
  );
}

/**
 * The time, breathing while the alarm rings: the digits swell a little and the colon
 * blinks, the way a clock radio does. Both stand still when the phone asks for less
 * motion.
 */
function RingingClock({ now }: { now: Date }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduced) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const colon = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });
  const digit = {
    fontFamily: 'Display',
    fontSize: 86,
    lineHeight: 96,
    color: C.white,
  } as const;

  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={`${pad(now.getHours())}:${pad(now.getMinutes())}`}
      style={[S.row, { alignItems: 'center', transform: [{ scale }] }]}
    >
      <T style={digit}>{pad(now.getHours())}</T>
      <Animated.Text style={[digit, { opacity: colon, marginHorizontal: 2 }]}>:</Animated.Text>
      <T style={digit}>{pad(now.getMinutes())}</T>
    </Animated.View>
  );
}

/**
 * The QR way out: the camera looking for this alarm's own printed code. A stray QR in the
 * kitchen carries no crw-alarm: prefix, so it cannot silence anything by accident.
 */
function QrScanner({ code, onMatch }: { code: string; onMatch: () => void }) {
  const { t } = useTranslation();
  const [wrong, setWrong] = useState(false);
  const done = useRef(false);

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          if (!matchesCode(data, code)) {
            setWrong(true);
            return;
          }
          done.current = true;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onMatch();
        }}
      />
      {wrong && (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 16,
            padding: 12,
            borderRadius: 14,
            backgroundColor: tint('#42212C'),
          }}
        >
          <T style={{ fontSize: 12, lineHeight: 18, color: C.white, textAlign: 'center' }}>
            {t('alarms.qrWrong')}
          </T>
        </View>
      )}
    </View>
  );
}

export default function AlarmRing({ alarm, onDismiss }: { alarm: Alarm; onDismiss: () => void }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const now = useClock();
  const [phase, setPhase] = useState<'wake' | 'counting' | 'done'>('wake');
  const [done, setDone] = useState(0);
  const [streak, setStreak] = useState(0);
  const [page, setPage] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const finishing = useRef(false);

  const isQr = alarm.challenge === 'qr';
  const target = alarm.reps;
  const label = isQr
    ? t('alarms.qrChallenge')
    : t(alarm.challenge === 'squat' ? 'alarms.squatsN' : 'alarms.pushupsN', { count: target });

  // Over the lock screen, screen on, and staying on while the alarm is up.
  useEffect(() => {
    CrwAlarm.showWhenLocked(true);
    return () => CrwAlarm.showWhenLocked(false);
  }, []);

  // The whole point is that it cannot be walked away from.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Getting the counter ready takes a moment on the first run after an install, so it
  // starts while the user is still looking at the clock.
  useEffect(() => {
    if (isQr) return;
    let live = true;
    const query = counterQuery(
      alarm.exercise,
      user?.display_name,
      'solo',
      user?.account?.language || undefined,
    );
    embeddedCounterPage()
      .then((base) => live && setPage(`${base}?${query}&lock=1`))
      .catch(() => live && setPage(null));
    return () => {
      live = false;
    };
  }, [alarm.exercise, isQr]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    await CrwAlarm.stopRinging().catch(() => {});

    const next = completeStreak(await loadStreak());
    await saveStreak(next);
    setStreak(currentStreak(next));

    // The same call the Play counter makes, so the reps land in the records and the
    // ranking. A phone with no signal still gets its alarm switched off.
    if (user && !isQr) {
      recordSolo({
        sessionId: `alarm-${alarm.id}-${Date.now().toString(36)}`,
        exercise: alarm.exercise,
        reps: target,
        bestSet: target,
        seconds: Math.max(0, Math.round((Date.now() - startedAt.current) / 1000)),
      }).catch(() => {
        /* the alarm is off either way */
      });
    }
    setPhase('done');
  }, [alarm.id, alarm.exercise, target, user, isQr]);

  const giveUp = useCallback(async () => {
    await CrwAlarm.stopRinging().catch(() => {});
    await saveStreak(breakStreak(await loadStreak()));
    onDismiss();
  }, [onDismiss]);

  const snooze = useCallback(
    async (minutes: number) => {
      await CrwAlarm.snooze(minutes).catch(() => {});
      onDismiss();
    },
    [onDismiss],
  );

  const onCounterMessage = useCallback(
    (data: any) => {
      if (!data || data.source !== 'pushups') return;
      if (data.type === 'rep') {
        const count = Math.max(0, Math.round(Number(data.count) || 0));
        setDone(count);
        if (count >= target) void finish();
        return;
      }
      // The counter can also end a set by itself; trust its total the same way.
      if (data.type === 'result') {
        const reps = Math.max(0, Math.round(Number(data.reps) || 0));
        setDone(reps);
        if (reps >= target) void finish();
      }
    },
    [target, finish],
  );

  const shell = (children: React.ReactNode) => (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: C.bg,
        zIndex: 999,
        elevation: 999,
      }}
    >
      {children}
    </View>
  );

  if (phase === 'counting') {
    return shell(
      <View style={{ flex: 1 }}>
        <View
          style={[
            S.row,
            S.between,
            { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12, alignItems: 'center' },
          ]}
        >
          <T style={{ fontFamily: 'Display', fontSize: 30, lineHeight: 38, color: C.white }}>
            {isQr ? t('alarms.qrFind') : `${done} / ${target}`}
          </T>
          <Label style={{ fontSize: 9 }}>
            {isQr
              ? t('alarms.qrForm')
              : t(alarm.challenge === 'squat' ? 'alarms.squatsForm' : 'alarms.pushupsForm')}
          </Label>
        </View>
        <View style={{ flex: 1, overflow: 'hidden' }}>
          {isQr ? (
            <CameraGate>
              <QrScanner code={alarm.code || ''} onMatch={() => void finish()} />
            </CameraGate>
          ) : page ? (
            <CameraGate>
              <RepCounterView src={page} onMessage={onCounterMessage} />
            </CameraGate>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <ActivityIndicator color={C.blue} />
              <T style={{ fontSize: 12 }}>{t('alarms.preparing')}</T>
            </View>
          )}
        </View>
        <View style={{ padding: 20, paddingBottom: 34 }}>
          <EmergencyHold onGiveUp={giveUp} />
        </View>
      </View>,
    );
  }

  if (phase === 'done') {
    return shell(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <Icon name="sunny" size={52} color={tint('#FFD18B')} />
        <T
          style={{
            fontFamily: 'Display',
            fontSize: 46,
            lineHeight: 56,
            color: C.white,
            textAlign: 'center',
          }}
        >
          {t('alarms.goodMorning')}
        </T>
        <T style={{ fontSize: 14, textAlign: 'center' }}>{t('alarms.challengeDone', { label })}</T>
        {streak > 0 && (
          <View style={[S.row, { gap: 8, alignItems: 'center', marginTop: 4 }]}>
            <Icon name="flame" size={20} color={tint('#FF7A3D')} />
            <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 15 }}>
              {t('alarms.streakDays', { count: streak })}
            </T>
          </View>
        )}
        <View style={{ alignSelf: 'stretch', marginTop: 18 }}>
          <Button title={t('common.done')} icon="checkmark" onPress={onDismiss} />
        </View>
      </View>,
    );
  }

  return shell(
    // Scrollable rather than a fixed three-way split: on a short screen the old layout
    // squeezed the middle block until the challenge was cut in half. flexGrow keeps the
    // spacing on a tall screen, and the scroll saves it on a small one.
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: 28,
        paddingTop: 64,
        paddingBottom: 34,
        justifyContent: 'space-between',
        gap: 26,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Label>{t('alarms.wakeUp')}</Label>
        <RingingClock now={now} />
      </View>

      <View style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: tint('#101D2D'),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={
              isQr
                ? 'qr-code-outline'
                : alarm.challenge === 'squat'
                  ? 'body-outline'
                  : 'fitness-outline'
            }
            size={40}
            color={C.blue}
          />
        </View>
        <T
          numberOfLines={2}
          style={{
            fontFamily: 'Display',
            fontSize: 38,
            // Barlow Condensed is a tall face: without room to breathe Android crops the
            // top and bottom of the line off, which is what clipped "10 push-ups".
            lineHeight: 46,
            color: C.white,
            textAlign: 'center',
            alignSelf: 'stretch',
          }}
        >
          {label}
        </T>
        <T style={{ fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
          {isQr ? t('alarms.qrToSwitchOff') : t('alarms.toSwitchOff')}
        </T>
      </View>

      <View style={{ gap: 10 }}>
        <Button
          title={isQr ? t('alarms.qrStart') : t('alarms.start')}
          icon={isQr ? 'qr-code-outline' : 'camera-outline'}
          onPress={() => {
            startedAt.current = Date.now();
            setPhase('counting');
          }}
        />
        {alarm.snooze && (
          <View style={[S.row, { gap: 10 }]}>
            {SNOOZE_MINUTES.map((minutes) => (
              <View key={minutes} style={{ flex: 1 }}>
                <Button
                  title={t('alarms.snoozeMinutes', { minutes })}
                  variant="outline"
                  onPress={() => void snooze(minutes)}
                />
              </View>
            ))}
          </View>
        )}
        <EmergencyHold onGiveUp={giveUp} />
      </View>
    </ScrollView>,
  );
}
