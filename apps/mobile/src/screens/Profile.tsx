import { setThemeMode, ThemeMode, tint, useTheme } from '../theme';
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation, TRANSLATED_LANGUAGES, languageName, t } from '../translations';
import MobileModal from '../components/MobileModal';
import { CityModal, LanguageModal } from '../components/Pickers';
import { CLAY, ClayButton, ClayIconButton, Slab, clay } from '../components/clay';
import { ClayRow } from '../components/ClayPage';
import GoogleSignIn from '../components/GoogleSignIn';
import AppleSignIn from '../components/AppleSignIn';
import Logo from '../components/Logo';
import { useOnline } from '../network';
import { registerForPush } from '../push';
import { View, Image, Platform, TextInput, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CrwAlarm } from '../../modules/crw-alarm';
import {
  useData,
  useSession,
  useAction,
  post,
  patch,
  remove,
  invalidate,
  dateLabel,
  money,
  request,
} from '../api';
import {
  C,
  S,
  T,
  Heading,
  Label,
  Icon,
  Tap,
  Avatar,
  Button,
  Chip,
  Page,
  QueryState,
  Empty,
  Header,
  Field,
  Toggle,
  Runner,
  SectionTitle,
} from '../ui';
function NotificationsBell({ navigation }: any) {
  const q = useData<any[]>('/notifications');
  const unread = (q.data || []).filter((n) => !n.read_at).length;
  return (
    <Tap
      label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      onPress={() => navigation.navigate('Notifications')}
    >
      <Icon name={unread ? 'notifications' : 'notifications-outline'} />
      {unread > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -6,
            right: -8,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 3,
            borderRadius: 9,
            backgroundColor: '#FF5A5F',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T style={{ color: '#FFFFFF', fontSize: 9, lineHeight: 12, fontFamily: 'InterBold' }}>
            {unread > 9 ? '9+' : unread}
          </T>
        </View>
      )}
    </Tap>
  );
}
export default function ProfileScreen({ navigation, route }: any) {
  const { user, logout } = useSession();
  const { t, language, availableLanguages } = useTranslation();
  const other = route?.params?.id;
  const profileId = other || user?.id;
  const q = useData(`/profiles/${profileId}`, !!profileId);
  const { run } = useAction();
  const own = !other || other === user?.id;
  if (!profileId)
    return (
      <View style={S.page}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <ClayIconButton icon="arrow-back" label={t('common.back')} onPress={navigation.goBack} />
        </View>
        <Page>
          <Slab radius={26} style={{ marginTop: 24, alignItems: 'center', paddingVertical: 30 }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 26,
                backgroundColor: tint('#17385B'),
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
              }}
            >
              <Icon name="person-outline" size={36} color={tint('#B7D9FF')} />
            </View>
            <Label style={{ color: C.blue }}>{t('profile.guestMode')}</Label>
            <Heading style={{ fontSize: 38, marginTop: 10 }}>{t('profile.yourOwnCrw')}</Heading>
            <T style={{ textAlign: 'center', fontSize: 12, marginTop: 12 }}>
              {t('profile.guestDesc')}
            </T>
          </Slab>
          <View style={{ marginTop: 22, gap: 10 }}>
            <ClayRow
              icon="pulse-outline"
              title={t('profile.openTracking')}
              tone="cream"
              onPress={() => navigation.navigate('Tracking')}
            />
            <ClayRow
              icon="settings-outline"
              title={t('profile.settings')}
              onPress={() => navigation.navigate('Settings')}
            />
            <ClayRow
              icon="people-outline"
              title={t('profile.exploreCommunities')}
              onPress={() => navigation.navigate('Communities')}
            />
          </View>
          <View style={{ marginTop: 30, paddingTop: 24, borderTopWidth: 1, borderColor: C.line }}>
            <Heading style={{ fontSize: 26 }}>{t('profile.makeItPersonal')}</Heading>
            <T style={{ fontSize: 12, marginTop: 9, marginBottom: 18 }}>
              {t('profile.guestSignInDesc')}
            </T>
            <ClayButton
              title={t('profile.signInOrCreate')}
              icon="arrow-forward"
              tone="lime"
              size="large"
              onPress={() => navigation.navigate('Auth')}
            />
          </View>
        </Page>
      </View>
    );
  const p = q.data;
  return (
    <View style={S.page}>
      <View
        style={[
          S.between,
          { alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
        ]}
      >
        <ClayIconButton icon="arrow-back" label={t('common.back')} onPress={navigation.goBack} />
        {own && (
          <View style={[S.row, { gap: 8 }]}>
            {/* Only where an alarm can actually ring: see modules/crw-alarm. */}
            {CrwAlarm.available && (
              <ClayIconButton
                icon="alarm-outline"
                label={t('alarms.title')}
                size={42}
                onPress={() => navigation.navigate('Alarms')}
              />
            )}
            <ClayIconButton
              icon="people-outline"
              label={t('nav.friends')}
              size={42}
              onPress={() => navigation.navigate('Friends')}
            />
            <NotificationsBell navigation={navigation} />
            <ClayIconButton
              icon="settings-outline"
              label={t('profile.settings')}
              size={42}
              tone="blue"
              onPress={() => navigation.navigate('Settings')}
            />
          </View>
        )}
      </View>
      <QueryState query={q}>
        {p && (
          <Page refresh={q.refetch} refreshing={q.isRefetching}>
            <View style={[S.between, { marginTop: 20 }]}>
              <Avatar
                url={p.avatar_url}
                name={p.display_name}
                size={91}
                style={{ borderColor: C.blue, borderWidth: 3 }}
              />
              {p.xp !== undefined && (
                <Slab
                  tone="cream"
                  radius={18}
                  style={{ paddingHorizontal: 19, paddingVertical: 11 }}
                >
                  <Label style={{ color: tint('#626B77'), fontSize: 8 }}>
                    {t('profile.currentLevel')}
                  </Label>
                  <Heading style={{ color: C.black, fontSize: 39, lineHeight: 42 }}>
                    {String(p.level).padStart(2, '0')}{' '}
                    <Icon name="flash" color={C.blue} size={18} />
                  </Heading>
                </Slab>
              )}
            </View>
            <Heading
              style={{ fontFamily: 'DisplayItalic', fontSize: 53, lineHeight: 51, marginTop: 22 }}
            >
              {p.display_name.toUpperCase()}
            </Heading>
            {p.city && (
              <View style={[S.row, { gap: 5, marginTop: 9 }]}>
                <Icon name="location-outline" size={13} color={C.blue} />
                <T style={{ fontSize: 12 }}>{p.city}</T>
              </View>
            )}
            <T style={{ fontSize: 12, marginTop: 14 }}>{p.bio}</T>
            {!own && (
              <FriendButton
                person={p}
                signedIn={!!user}
                onSignIn={() => navigation.navigate('Auth')}
                onFriends={() => navigation.navigate('Friends')}
              />
            )}
            {p.visibility === 'private' && !own ? (
              <Empty
                title="A LITTLE PERSONAL SPACE."
                body="This person keeps their profile private."
              />
            ) : (
              <>
                <View style={[S.row, { gap: 17, marginTop: 16 }]}>
                  <T style={{ fontSize: 11 }}>
                    <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 11 }}>
                      {p.followers}
                    </T>{' '}
                    {t('profile.followers')}
                  </T>
                  <T style={{ fontSize: 11 }}>
                    <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 11 }}>
                      {p.following}
                    </T>{' '}
                    {t('profile.following')}
                  </T>
                </View>
                {!own && (
                  <View style={{ marginTop: 20 }}>
                    <ClayButton
                      tone={p.followed ? 'graphite' : 'blue'}
                      title={p.followed ? t('profile.followingCheck') : t('profile.follow')}
                      onPress={() => {
                        if (!user) {
                          navigation.navigate('Auth');
                          return;
                        }
                        run(async () => {
                          if (p.followed) await remove(`/profiles/${p.user_id}/follow`);
                          else await post(`/profiles/${p.user_id}/follow`);
                          await invalidate();
                        });
                      }}
                    />
                    <ClayButton
                      title={t('profile.reportOrBlock')}
                      tone="graphite"
                      onPress={() =>
                        navigation.navigate(user ? 'Report' : 'Auth', {
                          targetType: 'user',
                          targetId: p.user_id,
                        })
                      }
                      style={{ marginTop: 9 }}
                    />
                  </View>
                )}
                <View style={[S.row, { gap: 9, marginTop: 24 }]}>
                  {[
                    [p.activities, t('profile.activities')],
                    [p.communities, t('profile.communities')],
                    [Number(p.xp).toLocaleString(), t('profile.xpEarned')],
                  ].map(([value, label]) => (
                    <Slab
                      key={label}
                      radius={20}
                      style={{ flex: 1, paddingHorizontal: 13, paddingVertical: 19 }}
                    >
                      <Heading
                        style={{
                          fontSize: 34,
                          lineHeight: 37,
                          color: label === t('profile.xpEarned') ? C.blue : C.white,
                        }}
                      >
                        {value}
                      </Heading>
                      <Label style={{ fontSize: 7, marginTop: 6, letterSpacing: 1 }}>{label}</Label>
                    </Slab>
                  ))}
                </View>
                {own && !user?.verified && (
                  <Slab tone="amber" radius={22} style={{ marginTop: 20, padding: 18, gap: 13 }}>
                    <T style={{ color: CLAY.amber.ink, fontSize: 13, lineHeight: 19 }}>
                      {t('profile.verifyNotice')}
                    </T>
                    <ClayButton
                      title={t('profile.resendVerification')}
                      tone="graphite"
                      onPress={() =>
                        run(async () => {
                          await post('/auth/resend');
                        })
                      }
                    />
                  </Slab>
                )}
                <View style={{ marginTop: 30 }}>
                  <SectionTitle title={t('profile.artOfShowingUp')} />
                  <Slab radius={24} style={{ padding: 18 }}>
                    <View style={[S.between, { marginBottom: 17 }]}>
                      <Label style={{ fontSize: 8 }}>{t('profile.last12Weeks')}</Label>
                      <T style={{ fontSize: 10 }}>
                        {p.streak} {t('profile.bestStreak')}{' '}
                        <Icon name="flame" size={13} color={C.blue} />
                      </T>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      {Array.from({ length: 12 }, (_, week) => (
                        <View key={week} style={{ flex: 1, gap: 5 }}>
                          {Array.from({ length: 7 }, (_, day) => {
                            const d = new Date();
                            d.setUTCDate(d.getUTCDate() - (83 - (week * 7 + day)));
                            const key = d.toISOString().slice(0, 10);
                            const count =
                              (p.history?.filter(
                                (h: any) =>
                                  new Date(h.starts_at).toISOString().slice(0, 10) === key,
                              ).length || 0) +
                              // Personal workouts logged in Tracking count too.
                              (p.workout_days?.find((w: any) => w.day === key)?.n || 0);
                            return (
                              <View
                                key={day}
                                accessibilityLabel={`${key}: ${count} activities`}
                                style={{
                                  aspectRatio: 1,
                                  borderRadius: 3,
                                  backgroundColor:
                                    count > 1 ? C.blue : count ? tint('#185FA3') : tint('#2A2E35'),
                                }}
                              />
                            );
                          })}
                        </View>
                      ))}
                    </View>
                    <View style={[S.row, { justifyContent: 'flex-end', gap: 5, marginTop: 13 }]}>
                      <T style={{ fontSize: 8 }}>Less</T>
                      {[tint('#2A2E35'), tint('#185FA3'), C.blue].map((color) => (
                        <View
                          key={color}
                          style={{ height: 9, width: 9, borderRadius: 2, backgroundColor: color }}
                        />
                      ))}
                      <T style={{ fontSize: 8 }}>More</T>
                    </View>
                  </Slab>
                </View>
                {!!p.achievements?.length && (
                  <View style={{ marginTop: 30 }}>
                    <SectionTitle title={t('profile.earnedNotGiven')} />
                    <View style={[S.row, { gap: 10 }]}>
                      {p.achievements.slice(0, 3).map((a: any) => (
                        <Slab
                          key={a.id}
                          tone="cream"
                          radius={18}
                          style={{
                            flex: 1,
                            alignItems: 'center',
                            paddingVertical: 20,
                            paddingHorizontal: 7,
                          }}
                        >
                          <Icon name={a.badge} size={29} color={C.blue} />
                          <Heading
                            style={{
                              fontSize: 19,
                              lineHeight: 20,
                              textAlign: 'center',
                              color: C.black,
                              marginTop: 13,
                            }}
                          >
                            {a.title}
                          </Heading>
                        </Slab>
                      ))}
                    </View>
                  </View>
                )}
                <View style={{ marginTop: 30 }}>
                  <SectionTitle title={t('profile.highlights')} />
                  {p.history?.length ? (
                    p.history.slice(0, 12).map((h: any) => (
                      <View
                        key={h.id}
                        style={[
                          S.row,
                          {
                            gap: 13,
                            paddingVertical: 14,
                            borderBottomWidth: 1,
                            borderColor: C.line,
                          },
                        ]}
                      >
                        <View
                          style={[
                            clay('blue', 0.7),
                            {
                              width: 42,
                              height: 42,
                              borderRadius: 21,
                              alignItems: 'center',
                              justifyContent: 'center',
                            },
                          ]}
                        >
                          <Icon name="checkmark" size={18} color={CLAY.blue.ink} />
                        </View>
                        <Tap
                          onPress={() => navigation.navigate('Event', { id: h.event_id })}
                          style={{ flex: 1 }}
                        >
                          <T style={{ fontSize: 12, color: C.white, fontFamily: 'InterBold' }}>
                            {h.title}
                          </T>
                          <T style={{ fontSize: 10 }}>
                            {dateLabel(h.starts_at, h.timezone)} · Verified attendance
                          </T>
                        </Tap>
                        <Tap
                          onPress={() => {
                            if (!user) {
                              navigation.navigate('Auth');
                              return;
                            }
                            run(async () => {
                              if (h.reacted) await remove(`/activity/${h.id}/react`);
                              else await post(`/activity/${h.id}/react`);
                              await q.refetch();
                            });
                          }}
                          label="Celebrate this activity"
                          style={[S.row, { gap: 4, padding: 8 }]}
                        >
                          <Icon
                            name={h.reacted ? 'heart' : 'heart-outline'}
                            size={18}
                            color={h.reacted ? C.blue : C.gray}
                          />
                          <T style={{ fontSize: 11 }}>{h.reactions}</T>
                        </Tap>
                      </View>
                    ))
                  ) : (
                    <T style={{ fontSize: 12 }}>{t('profile.firstActivity')}</T>
                  )}
                </View>
                {!!p.followed_communities?.length && (
                  <View style={{ marginTop: 28 }}>
                    <SectionTitle title={t('profile.yourCrews')} />
                    {p.followed_communities.map((co: any) => (
                      <View key={co.id} style={{ marginBottom: 8 }}>
                        <ClayRow
                          icon="people-outline"
                          title={co.name}
                          onPress={() => navigation.navigate('Community', { id: co.id })}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
            {own && (
              <View style={{ marginTop: 30, gap: 10 }}>
                <ClayRow
                  icon="ticket-outline"
                  title={t('profile.myBookings')}
                  tone="cream"
                  onPress={() => navigation.navigate('Bookings')}
                />
                <ClayRow
                  icon="settings-outline"
                  title={t('profile.settings')}
                  onPress={() => navigation.navigate('Settings')}
                />
                <ClayRow
                  icon="megaphone-outline"
                  title={t('profile.becomeOrganizer')}
                  onPress={() => navigation.navigate('Apply')}
                />
                <ClayRow
                  icon="log-out-outline"
                  title={t('profile.signOut')}
                  tone="ember"
                  trailingIcon={null}
                  onPress={() => run(logout)}
                />
              </View>
            )}
          </Page>
        )}
      </QueryState>
    </View>
  );
}
function FriendButton({ person, signedIn, onSignIn, onFriends }: any) {
  const { say } = useSession();
  const { busy, run } = useAction();
  const relation = person.friendship || 'none';
  const act = (fn: () => Promise<any>, message: string) =>
    run(async () => {
      await fn();
      await invalidate();
      say(message);
    });
  if (!signedIn)
    return (
      <ClayButton
        title="Add friend"
        icon="person-add"
        onPress={onSignIn}
        style={{ marginTop: 18 }}
      />
    );
  if (relation === 'friends')
    return (
      <View style={[S.row, { gap: 10, marginTop: 18 }]}>
        <View style={[S.row, { gap: 6, flex: 1 }]}>
          <Icon name="people" size={18} color={C.green} />
          <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13 }}>Friends</T>
        </View>
        <ClayButton
          title="Remove"
          tone="ember"
          loading={busy}
          onPress={() =>
            act(() => remove(`/friends/${person.user_id}`), `${person.display_name} removed.`)
          }
        />
      </View>
    );
  if (relation === 'incoming')
    return (
      <View style={[S.row, { gap: 10, marginTop: 18 }]}>
        <ClayButton
          title="Accept friend request"
          icon="checkmark"
          tone="lime"
          loading={busy}
          style={{ flex: 1 }}
          onPress={() =>
            act(
              () => post(`/friends/${person.user_id}/accept`),
              `You and ${person.display_name} are friends.`,
            )
          }
        />
        <ClayButton
          title="Decline"
          tone="graphite"
          onPress={() => act(() => remove(`/friends/${person.user_id}`), 'Request declined.')}
        />
      </View>
    );
  if (relation === 'outgoing')
    return (
      <ClayButton
        title="Friend request sent · Cancel"
        tone="graphite"
        loading={busy}
        style={{ marginTop: 18 }}
        onPress={() => act(() => remove(`/friends/${person.user_id}`), 'Request cancelled.')}
      />
    );
  return (
    <View style={{ marginTop: 18, gap: 8 }}>
      <ClayButton
        title="Add friend"
        icon="person-add"
        loading={busy}
        onPress={() => act(() => post(`/friends/${person.user_id}`), 'Friend request sent.')}
      />
      <Tap
        label="See your friends"
        onPress={onFriends}
        style={{ alignItems: 'center', padding: 6 }}
      >
        <T style={{ color: C.gray, fontFamily: 'InterBold', fontSize: 11 }}>See your friends</T>
      </Tap>
    </View>
  );
}

// Dark (the default), light, or following the phone. Applies at once and is kept on
// this device; it is not part of the saved profile.
