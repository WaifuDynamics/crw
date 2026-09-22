import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, ScrollView, View } from 'react-native';
import AlarmSheet from './AlarmSheet';
import { tint } from '../theme';
import { C, Heading, Icon, S, T, Tap } from '../ui';
import { useTranslation } from '../translations';
import { CLAY, ClayButton, ClayIconButton, ClayTag, Slab, clay } from '../components/clay';
import { CrwAlarm, type AlarmPermissions } from '../../modules/crw-alarm';
import {
  currentStreak,
  newAlarm,
  nextOccurrence,
  ringsIn,
  type Alarm,
  type Streak,
} from '../alarms/model';
import { alarmId, loadAlarms, loadStreak, saveAlarms } from '../alarms/store';

// The alarms the user keeps, and the permission cards standing between an alarm and
// actually ringing. Editing one is AlarmSheet; the ringing is AlarmRing; the scheduling
// is the native module. Everything here wears the Tracking page's clay.

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

/** "Weekdays", "Every day" and so on, falling back to the list of days. */
function daysLabel(alarm: Alarm, t: (k: string, p?: any) => string) {
  const days = [...alarm.days].sort((a, b) => a - b);
  if (days.length === 0) return t('alarms.once');
  if (days.length === 7) return t('alarms.everyDay');
  if (days.join() === '1,2,3,4,5') return t('alarms.weekdays');
  if (days.join() === '6,7') return t('alarms.weekends');
  return days.map((d) => t(`alarms.${DAY_KEYS[d - 1]}`)).join(' · ');
}

function challengeLabel(alarm: Alarm, t: (k: string, p?: any) => string) {
  if (alarm.challenge === 'qr') return t('alarms.qrChallenge');
  return t(alarm.challenge === 'squat' ? 'alarms.squatsN' : 'alarms.pushupsN', {
    count: alarm.reps,
  });
}

const challengeIcon = (alarm: Alarm) =>
  alarm.challenge === 'qr'
    ? 'qr-code-outline'
    : alarm.challenge === 'squat'
      ? 'body-outline'
      : 'fitness-outline';

/** A permission the alarm needs and does not have. */
function PermissionCard({
  icon,
  title,
  why,
  action,
  onPress,
}: {
  icon: string;
  title: string;
  why: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Slab tone="amber" radius={22} depth={0.8} style={{ padding: 16, marginBottom: 10 }}>
      <View style={[S.row, { gap: 12, alignItems: 'flex-start' }]}>
        <Icon name={icon} size={20} color={CLAY.amber.ink} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T style={{ fontFamily: 'InterBold', fontSize: 14, lineHeight: 19, color: CLAY.amber.ink }}>
            {title}
          </T>
          <T
            style={{
              fontSize: 12,
              lineHeight: 18,
              marginTop: 3,
              color: CLAY.amber.ink,
              opacity: 0.8,
            }}
          >
            {why}
          </T>
          <Tap label={action} onPress={onPress} style={{ marginTop: 9 }}>
            <T style={{ fontFamily: 'InterBold', fontSize: 13, color: CLAY.amber.ink }}>
              {action} ›
            </T>
          </Tap>
        </View>
      </View>
    </Slab>
  );
}

export default function Alarms({ navigation }: any) {
  const { t } = useTranslation();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [editing, setEditing] = useState<Alarm | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [permissions, setPermissions] = useState<AlarmPermissions | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    void loadAlarms().then(setAlarms);
    void loadStreak().then(setStreak);
  }, []);

  const refreshPermissions = useCallback(() => {
    void CrwAlarm.permissions().then(setPermissions);
  }, []);

  useEffect(() => {
    refreshPermissions();
    // Coming back from the system settings: look again.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshPermissions();
        setNow(new Date());
      }
    });
    return () => sub.remove();
  }, [refreshPermissions]);

  // Keeps the "rings in" line honest without a timer for every second.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const commit = useCallback((next: Alarm[]) => {
    setAlarms(next);
    void saveAlarms(next);
  }, []);

  const add = () => {
    setIsNew(true);
    setEditing(newAlarm(alarmId()));
  };

  const days = currentStreak(streak ?? { count: 0, lastDate: null, best: 0 });

  const nextRing = useMemo(() => {
    const times = alarms
      .map((a) => nextOccurrence(a, now))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    return times[0] ?? null;
  }, [alarms, now]);

  if (!CrwAlarm.available) {
    return (
      <View style={S.page}>
        <View style={{ padding: 20, paddingTop: 16 }}>
          <ClayIconButton
            icon="arrow-back"
            label={t('common.back')}
            onPress={() => navigation.goBack()}
          />
        </View>
        <View style={{ alignItems: 'center', marginTop: 30, gap: 12, paddingHorizontal: 28 }}>
          <Icon name="alarm-outline" size={40} color={C.gray} />
          <T
            style={{ fontFamily: 'Display', fontSize: 30, color: C.white, textAlign: 'center' }}
          >
            {t('alarms.unavailable')}
          </T>
          <T style={{ fontSize: 13, lineHeight: 20, textAlign: 'center', color: C.gray }}>
            {Platform.OS === 'ios' ? t('alarms.unavailableIos') : t('alarms.unavailableWeb')}
          </T>
        </View>
      </View>
    );
  }

  return (
    <View style={S.page}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 44,
          width: '100%',
          maxWidth: 480,
          alignSelf: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[S.between, { alignItems: 'center', gap: 12 }]}>
          <ClayIconButton
            icon="arrow-back"
            label={t('common.back')}
            onPress={() => navigation.goBack()}
          />
          <ClayIconButton icon="add" label={t('alarms.add')} tone="blue" onPress={add} />
        </View>

        <Heading style={{ fontSize: 46, lineHeight: 50, marginTop: 12 }}>
          {t('alarms.title')}
        </Heading>
        {!!nextRing && (
          <T style={{ fontSize: 12, lineHeight: 18, color: C.gray, marginTop: 6 }}>
            {t('alarms.nextRing', {
              hours: ringsIn(nextRing, now).hours,
              minutes: ringsIn(nextRing, now).minutes,
            })}
          </T>
        )}

        {days > 0 && (
          <Slab tone="ember" radius={24} style={{ marginTop: 16, padding: 16 }}>
            <View style={[S.row, { gap: 12, alignItems: 'center' }]}>
              <Icon name="flame" size={24} color={CLAY.ember.ink} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T
                  style={{
                    fontFamily: 'Display',
                    fontSize: 26,
                    lineHeight: 30,
                    color: CLAY.ember.ink,
                  }}
                >
                  {t('alarms.streakDays', { count: days })}
                </T>
                <T
                  style={{ fontSize: 11, lineHeight: 15, color: CLAY.ember.ink, opacity: 0.8 }}
                >
                  {t('alarms.best', { count: streak?.best ?? 0 })}
                </T>
              </View>
            </View>
          </Slab>
        )}

        <View style={{ marginTop: 16 }}>
          {permissions && !permissions.notifications && (
            <PermissionCard
              icon="notifications-off-outline"
              title={t('alarms.permNotifications')}
              why={t('alarms.permNotificationsWhy')}
              action={t('alarms.fix')}
              onPress={() => navigation.navigate('Permissions')}
            />
          )}
          {permissions && !permissions.exactAlarm && (
            <PermissionCard
              icon="time-outline"
              title={t('alarms.permExact')}
              why={t('alarms.permExactWhy')}
              action={t('alarms.fix')}
              onPress={() => CrwAlarm.openExactAlarmSettings()}
            />
          )}
          {permissions && !permissions.fullScreenIntent && (
            <PermissionCard
              icon="phone-portrait-outline"
              title={t('alarms.permFullScreen')}
              why={t('alarms.permFullScreenWhy')}
              action={t('alarms.fix')}
              onPress={() => CrwAlarm.openFullScreenIntentSettings()}
            />
          )}
          <PermissionCard
            icon="battery-charging-outline"
            title={t('alarms.permBattery')}
            why={t('alarms.permBatteryWhy')}
            action={t('alarms.fix')}
            onPress={() => CrwAlarm.openBatterySettings()}
          />
        </View>

        {alarms.length === 0 ? (
          <Slab radius={26} style={{ padding: 22, alignItems: 'center', gap: 12 }}>
            <Icon name="alarm-outline" size={36} color={C.gray} />
            <T
              style={{ fontFamily: 'Display', fontSize: 26, lineHeight: 30, color: C.white }}
            >
              {t('alarms.empty')}
            </T>
            <T style={{ fontSize: 13, lineHeight: 20, textAlign: 'center', color: C.gray }}>
              {t('alarms.emptyWhy')}
            </T>
            <View style={{ alignSelf: 'stretch', marginTop: 6 }}>
              <ClayButton title={t('alarms.add')} icon="add" tone="lime" onPress={add} />
            </View>
          </Slab>
        ) : (
          <View style={{ gap: 12 }}>
            {alarms.map((alarm) => (
              <Slab
                key={alarm.id}
                radius={26}
                depth={alarm.enabled ? 1 : 0.6}
                style={{ padding: 18, opacity: alarm.enabled ? 1 : 0.6 }}
              >
                <Tap
                  label={`${pad(alarm.hour)}:${pad(alarm.minute)}`}
                  onPress={() => {
                    setIsNew(false);
                    setEditing(alarm);
                  }}
                  style={[S.between, { alignItems: 'flex-start', gap: 12 }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T
                      style={{
                        fontFamily: 'Display',
                        fontSize: 48,
                        lineHeight: 54,
                        color: C.white,
                      }}
                    >
                      {pad(alarm.hour)}:{pad(alarm.minute)}
                    </T>
                    <View style={[S.row, { gap: 6, marginTop: 8, flexWrap: 'wrap' }]}>
                      <ClayTag text={daysLabel(alarm, t)} />
                      <ClayTag
                        text={challengeLabel(alarm, t)}
                        tone="blue"
                        icon={challengeIcon(alarm)}
                      />
                    </View>
                  </View>
                  <ClayIconButton
                    icon={alarm.enabled ? 'notifications' : 'notifications-off-outline'}
                    label={alarm.enabled ? t('alarms.turnOff') : t('alarms.turnOn')}
                    size={46}
                    tone={alarm.enabled ? 'blue' : 'graphite'}
                    onPress={() =>
                      commit(
                        alarms.map((a) =>
                          a.id === alarm.id ? { ...a, enabled: !a.enabled } : a,
                        ),
                      )
                    }
                  />
                </Tap>
              </Slab>
            ))}
            <View style={{ marginTop: 4 }}>
              <ClayButton title={t('alarms.add')} icon="add" tone="graphite" onPress={add} />
            </View>
          </View>
        )}
      </ScrollView>

      <AlarmSheet
        visible={!!editing}
        alarm={editing}
        onClose={() => setEditing(null)}
        onSave={(saved) => {
          commit(
            isNew ? [...alarms, saved] : alarms.map((a) => (a.id === saved.id ? saved : a)),
          );
          setEditing(null);
        }}
        onDelete={
          isNew
            ? null
            : (id) => {
                commit(alarms.filter((a) => a.id !== id));
                setEditing(null);
              }
        }
      />
    </View>
  );
}
