import { clay } from '../claySurface';
import { tint } from '../theme';
import React, { useEffect, useState } from 'react';
import { View, Image, Share, Platform, Linking, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useData,
  useSession,
  useAction,
  post,
  uid,
  money,
  dateLabel,
  timeLabel,
  invalidate,
  API,
} from '../api';
import {
  C,
  S,
  T,
  Heading,
  Label,
  Icon,
  Tap,
  Button,
  CircleButton,
  Avatar,
  Avatars,
  Page,
  QueryState,
  Progress,
  Header,
  Empty,
} from '../ui';
import QRCode from 'react-native-qrcode-svg';
import * as Haptics from 'expo-haptics';
export function EventScreen({ navigation, route }: any) {
  const q = useData(`/events/${route.params.id}`);
  const { user, say } = useSession();
  const { busy, run } = useAction();
  const [key] = useState(uid);
  const insets = useSafeAreaInsets();
  const e = q.data;
  useEffect(() => {
    if (e?.id) void post('/analytics', { eventId: e.id, name: 'event_view' }).catch(() => {});
  }, [e?.id]);
  async function book() {
    if (!user) {
      navigation.navigate('Auth');
      return;
    }
    run(async () => {
      const b = await post('/bookings', { eventId: e.id }, key);
      await invalidate();
      navigation.navigate('Booking', { id: b.id });
    });
  }
  const share = () =>
    run(async () => {
      await Share.share({
        title: e.title,
        message: `Join me at ${e.title} on CRW+. ${process.env.EXPO_PUBLIC_APP_URL || 'http://localhost:8081'}/?event=${e.id}`,
      });
      void post('/analytics', { eventId: e.id, name: 'share' });
    });
  return (
    <View style={S.page}>
      <QueryState query={q}>
        {e && (
          <>
            <Page pad={false}>
              <View style={{ height: 410 }}>
                <Image
                  source={{ uri: e.cover_url }}
                  style={{ width: '100%', height: '100%', backgroundColor: C.panel }}
                />
                <LinearGradient
                  colors={[tint('#00000055'), tint('#00000000'), C.bg]}
                  style={{ position: 'absolute', inset: 0 }}
                />
                <View style={[S.between, { position: 'absolute', top: 16, left: 24, right: 24 }]}>
                  <CircleButton label="Go back" icon="arrow-back" onPress={navigation.goBack} />
                  <CircleButton label="Share activity" icon="share-outline" onPress={share} />
                </View>
                <View style={{ position: 'absolute', bottom: 16, left: 24, right: 24 }}>
                  <Label style={{ color: C.blue, marginBottom: 12 }}>
                    {e.category.toUpperCase()} /{' '}
                    {e.difficulty === 'all' ? 'ALL LEVELS' : e.difficulty.toUpperCase()}
                  </Label>
                  <Heading style={{ fontFamily: 'DisplayItalic', fontSize: 54, lineHeight: 51 }}>
                    {e.title.toUpperCase()}
                  </Heading>
                  <View style={[S.row, { gap: 7, marginTop: 13 }]}>
                    {e.tags.map((tag: string) => (
                      <View
                        key={tag}
                        style={{
                          backgroundColor: tint('#FFFFFF18'),
                          paddingHorizontal: 9,
                          paddingVertical: 5,
                          borderRadius: 5,
                        }}
                      >
                        <Label style={{ fontSize: 8, color: C.white }}>{tag}</Label>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
              <View style={S.pad}>
                <Tap
                  onPress={() => navigation.navigate('Community', { id: e.community_id })}
                  style={[S.between, { paddingVertical: 17 }]}
                >
                  <View style={[S.row, { gap: 11 }]}>
                    <View
                      style={{
                        ...clay('cream'),
                        borderRadius: 22,
                        width: 42,
                        height: 42,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Heading style={{ color: C.black, fontSize: 25 }}>
                        {e.community_name.slice(0, 1)}
                      </Heading>
                    </View>
                    <View>
                      <Label style={{ fontSize: 8, marginBottom: 3 }}>HOSTED BY</Label>
                      <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13 }}>
                        {e.community_name} <Icon name="checkmark-circle" color={C.blue} size={13} />
                      </T>
                    </View>
                  </View>
                  <Icon name="chevron-forward" size={18} color={C.gray} />
                </Tap>
                <View style={[S.card, { marginTop: 7, gap: 19 }]}>
                  <View style={[S.row, { gap: 13 }]}>
                    <Icon name="calendar-outline" color={C.blue} />
                    <View>
                      <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13 }}>
                        {dateLabel(e.starts_at, e.timezone)}
                      </T>
                      <T style={{ fontSize: 11 }}>
                        {timeLabel(e.starts_at, e.timezone)} – {timeLabel(e.ends_at, e.timezone)} ·{' '}
                        {e.timezone}
                      </T>
                    </View>
                  </View>
                  <Tap
                    onPress={() =>
                      Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`,
                      )
                    }
                    style={[S.row, { gap: 13 }]}
                  >
                    <Icon name="location-outline" color={C.blue} />
                    <View style={{ flex: 1 }}>
                      <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13 }}>
                        {e.location_name}
                      </T>
                      <T style={{ fontSize: 11 }}>Open meeting point in Maps ↗</T>
                    </View>
                  </Tap>
                </View>
                <View style={{ marginTop: 25 }}>
                  <View style={S.between}>
                    <Heading style={{ fontSize: 28 }}>GOOD COMPANY, GUARANTEED.</Heading>
                  </View>
                  <View style={[S.row, { gap: 11, marginTop: 15 }]}>
                    <Avatars people={e.attendees} size={38} />
                    <View>
                      <T style={{ color: C.white, fontSize: 12, fontFamily: 'InterBold' }}>
                        {e.attendee_count} people going
                      </T>
                      <T style={{ fontSize: 10 }}>
                        {e.friends_going
                          ? `${e.friends_going} people you follow are joining`
                          : 'Show up solo. Leave with a few new friends.'}
                      </T>
                    </View>
                  </View>
                  <View style={{ marginTop: 17 }}>
                    <Progress value={e.attendee_count / e.capacity} />
                    <T style={{ fontSize: 10, marginTop: 7 }}>
                      {e.spots_remaining} of {e.capacity} spots left
                    </T>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, marginTop: 20 }}
                >
                  {e.media?.map((m: any) => (
                    <Image
                      key={m.id}
                      source={{ uri: m.url }}
                      style={{ width: 230, height: 165, borderRadius: 13 }}
                    />
                  ))}
                </ScrollView>
                <View style={S.divider} />
                <Heading style={{ fontSize: 30, marginBottom: 12 }}>THE PLAN.</Heading>
                <T style={{ fontSize: 13, lineHeight: 23 }}>{e.description}</T>
                {[
                  ['WHAT TO BRING', e.requirements, 'bag-outline'],
                  ['WHAT’S INCLUDED', e.included, 'checkmark-circle-outline'],
                  ['LOOKING OUT FOR EACH OTHER', e.safety_info, 'shield-checkmark-outline'],
                ].map(([title, text, icon]) => (
                  <View key={title} style={{ marginTop: 24 }}>
                    <View style={[S.row, { gap: 8, marginBottom: 9 }]}>
                      <Icon name={icon} size={17} color={C.blue} />
                      <Label style={{ color: C.white }}>{title}</Label>
                    </View>
                    <T style={{ fontSize: 12, lineHeight: 21 }}>
                      {text || 'Contact the host for details.'}
                    </T>
                  </View>
                ))}
                <View style={[S.card, clay('cream'), { marginTop: 28 }]}>
                  <Heading style={{ fontSize: 30, color: C.black, marginBottom: 16 }}>
                    KEEP IT SIMPLE.
                  </Heading>
                  <View style={S.between}>
                    <T style={{ color: tint('#666B76'), fontSize: 12 }}>Activity</T>
                    <T style={{ color: C.black, fontSize: 13 }}>
                      {money(e.price_minor, e.currency)}
                    </T>
                  </View>
                  <View style={[S.between, { marginTop: 9 }]}>
                    <T style={{ color: tint('#666B76'), fontSize: 12 }}>CRW+ service fee</T>
                    <T style={{ color: C.black, fontSize: 13 }}>{money(e.fee_minor, e.currency)}</T>
                  </View>
                  <View
                    style={{ height: 1, backgroundColor: tint('#DDE0E4'), marginVertical: 16 }}
                  />
                  <View style={S.between}>
                    <T style={{ color: C.black, fontFamily: 'InterBold' }}>Your total</T>
                    <Heading style={{ color: C.black, fontSize: 32 }}>
                      {e.total_minor ? money(e.total_minor, e.currency) : 'FREE'}
                    </Heading>
                  </View>
                </View>
                <View style={{ marginTop: 24 }}>
                  <Label style={{ marginBottom: 9 }}>PLANS CHANGE. WE GET IT.</Label>
                  <T style={{ fontSize: 11, lineHeight: 19 }}>
                    Cancel at least {e.cancellation_hours} hours before the activity for a full
                    refund, including your service fee. If the host cancels, your payment will be
                    refunded.
                  </T>
                </View>
                <Button
                  title="Report this activity"
                  variant="outline"
                  style={{ marginTop: 24, minHeight: 44 }}
                  onPress={() =>
                    navigation.navigate(user ? 'Report' : 'Auth', {
                      targetType: 'event',
                      targetId: e.id,
                    })
                  }
                />
              </View>
            </Page>
            <View
              style={[
                S.between,
                {
                  paddingHorizontal: 24,
                  paddingTop: 15,
                  paddingBottom: Math.max(16, insets.bottom),
                  backgroundColor: C.bg,
                  borderTopWidth: 1,
                  borderColor: C.line,
                  gap: 20,
                },
              ]}
            >
              <View>
                <Heading style={{ fontSize: 32 }}>
                  {e.total_minor ? money(e.total_minor, e.currency) : 'FREE'}
                </Heading>
                <T style={{ fontSize: 10 }}>per person · all fees included</T>
              </View>
              <Button
                title={
                  e.spots_remaining <= 0
                    ? 'Fully booked'
                    : e.price_minor
                      ? 'Book my spot'
                      : 'Count me in'
                }
                disabled={e.spots_remaining <= 0 || new Date(e.starts_at) < new Date()}
                icon="arrow-forward"
                onPress={book}
                loading={busy}
                style={{ minWidth: 164 }}
              />
            </View>
          </>
        )}
      </QueryState>
    </View>
  );
}
export function BookingScreen({ navigation, route }: any) {
  const q = useData(`/bookings/${route.params.id}`);
  const { busy, run } = useAction();
  const { say } = useSession();
  const [checkout, setCheckout] = useState<any>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const b = q.data;
  const pay = () =>
    run(async () => {
      const p = await post(`/bookings/${b.id}/checkout`);
      setCheckout(p);
      if (p.provider !== 'sandbox') {
        await Linking.openURL(p.checkout_url);
        say('Complete your payment securely, then return here and refresh your ticket.');
      }
    });
  return (
    <View style={S.page}>
      <Header title="YOUR NEXT MOVE" onBack={navigation.goBack} />
      <QueryState query={q}>
        {b && (
          <Page refresh={q.refetch} refreshing={q.isRefetching}>
            <View style={{ alignItems: 'center', marginTop: 17, marginBottom: 25 }}>
              <View
                style={{
                  height: 58,
                  width: 58,
                  borderRadius: 29,
                  backgroundColor: b.status === 'confirmed' ? tint('#168BFF22') : C.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 15,
                }}
              >
                <Icon
                  name={b.status === 'confirmed' ? 'checkmark' : 'ticket-outline'}
                  color={C.blue}
                  size={32}
                />
              </View>
              <Heading style={{ fontSize: 44 }}>
                {b.checked_in_at
                  ? 'YOU’RE IN.'
                  : b.status === 'confirmed'
                    ? 'YOU’RE ON THE LIST.'
                    : b.status === 'reserved'
                      ? 'MAKE IT OFFICIAL.'
                      : b.status.replace('_', ' ').toUpperCase()}
              </Heading>
              <T style={{ fontSize: 12, marginTop: 7 }}>
                {b.status === 'confirmed'
                  ? 'A good time is waiting. Keep this ticket handy.'
                  : b.status === 'reserved'
                    ? 'Your place is held for 35 minutes.'
                    : 'Your booking status is up to date.'}
              </T>
            </View>
            <View style={{ ...clay('cream'), borderRadius: 22, overflow: 'hidden' }}>
              <Image
                source={{ uri: b.cover_url }}
                style={{ height: 160, width: '100%', backgroundColor: C.line }}
              />
              <View style={{ padding: 23 }}>
                <Label style={{ color: C.blue, marginBottom: 7 }}>CRW+ / ADMIT ONE</Label>
                <Heading style={{ color: C.black, fontSize: 35, lineHeight: 35 }}>
                  {b.title.toUpperCase()}
                </Heading>
                <T style={{ color: tint('#666B76'), fontSize: 12, marginTop: 11 }}>
                  {dateLabel(b.starts_at, b.timezone)} · {timeLabel(b.starts_at, b.timezone)}
                </T>
                <T style={{ color: tint('#666B76'), fontSize: 12 }}>{b.location_name}</T>
                <View
                  style={{
                    height: 1,
                    borderTopWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: tint('#CCD0D8'),
                    marginVertical: 23,
                  }}
                />
                {b.qr ? (
                  <View style={{ alignItems: 'center', gap: 14 }}>
                    <QRCode value={b.qr} size={205} color={C.black} backgroundColor={C.white} />
                    <Label style={{ color: tint('#666B76'), fontSize: 9 }}>
                      SHOW THIS AT CHECK-IN
                    </Label>
                    <T style={{ color: C.black, fontFamily: 'InterBold' }}>{b.display_name}</T>
                  </View>
                ) : (
                  <T style={{ color: tint('#666B76'), textAlign: 'center' }}>
                    {b.status === 'reserved'
                      ? 'Your secure QR ticket appears after payment confirmation.'
                      : 'This ticket is no longer valid.'}
                  </T>
                )}
                <View style={{ height: 1, backgroundColor: tint('#E0E2E7'), marginVertical: 20 }} />
                {b.items.map((item: any) => (
                  <View key={item.kind} style={[S.between, { marginBottom: 8 }]}>
                    <T style={{ color: tint('#666B76'), fontSize: 11, flex: 1 }}>
                      {item.description}
                    </T>
                    <T style={{ color: C.black, fontSize: 12 }}>
                      {money(item.amount_minor, b.currency)}
                    </T>
                  </View>
                ))}
                <View style={S.between}>
                  <T style={{ color: C.black, fontFamily: 'InterBold', fontSize: 12 }}>Total</T>
                  <Heading style={{ color: C.black, fontSize: 29 }}>
                    {money(b.total_minor, b.currency)}
                  </Heading>
                </View>
                <T style={{ color: tint('#848995'), fontSize: 9, marginTop: 15 }}>
                  REFERENCE {b.id.toUpperCase()}
                </T>
              </View>
            </View>
            {b.status === 'reserved' && (
              <View style={{ marginTop: 20, gap: 12 }}>
                <Button
                  title="Continue to secure checkout"
                  icon="lock-closed-outline"
                  onPress={pay}
                  loading={busy}
                />
                {checkout?.provider === 'sandbox' && (
                  <View style={S.card}>
                    <Label style={{ color: C.blue, marginBottom: 10 }}>DEVELOPMENT CHECKOUT</Label>
                    <T style={{ fontSize: 12, marginBottom: 15 }}>
                      No money will be charged. This uses the isolated sandbox payment adapter.
                    </T>
                    <Button
                      title="Complete test payment"
                      variant="white"
                      loading={busy}
                      onPress={() =>
                        run(async () => {
                          await post(`/sandbox/checkout/${b.id}/pay`);
                          await invalidate();
                          await q.refetch();
                          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        })
                      }
                    />
                  </View>
                )}
              </View>
            )}
            <Button
              title="Refresh payment & ticket status"
              variant="outline"
              onPress={q.refetch}
              style={{ marginTop: 14 }}
            />
            {['confirmed', 'reserved'].includes(b.status) && !b.checked_in_at && (
              <View style={{ marginTop: 14 }}>
                {confirmCancel ? (
                  <View style={S.card}>
                    <T style={{ color: C.white, marginBottom: 15 }}>
                      Release your spot? Eligible paid bookings receive a full refund.
                    </T>
                    <Button
                      title="Yes, cancel my booking"
                      loading={busy}
                      onPress={() =>
                        run(async () => {
                          await post(`/bookings/${b.id}/cancel`);
                          setConfirmCancel(false);
                          await invalidate();
                        })
                      }
                    />
                    <Button
                      title="Keep my booking"
                      variant="outline"
                      onPress={() => setConfirmCancel(false)}
                      style={{ marginTop: 8 }}
                    />
                  </View>
                ) : (
                  <Button
                    title="Cancel booking"
                    variant="dark"
                    onPress={() => setConfirmCancel(true)}
                  />
                )}
              </View>
            )}
          </Page>
        )}
      </QueryState>
    </View>
  );
}
export function BookingsScreen({ navigation }: any) {
  const q = useData('/bookings');
  return (
    <View style={S.page}>
      <Header title="YOUR PLANS" onBack={navigation.goBack} />
      <QueryState query={q}>
        <Page refresh={q.refetch} refreshing={q.isRefetching}>
          {q.data?.length ? (
            q.data.map((b: any) => (
              <Tap
                key={b.id}
                onPress={() => navigation.navigate('Booking', { id: b.id })}
                style={[S.card, { marginTop: 15, gap: 8 }]}
              >
                <View style={S.between}>
                  <Label style={{ color: b.status === 'confirmed' ? C.blue : C.gray }}>
                    {b.status.replace('_', ' ').toUpperCase()}
                  </Label>
                  <Icon name="ticket-outline" color={C.blue} />
                </View>
                <Heading style={{ fontSize: 30 }}>{b.title.toUpperCase()}</Heading>
                <T style={{ fontSize: 12 }}>
                  {dateLabel(b.starts_at, b.timezone)} · {timeLabel(b.starts_at, b.timezone)}
                </T>
                <T style={{ fontSize: 12 }}>{money(b.total_minor, b.currency)} · View ticket →</T>
              </Tap>
            ))
          ) : (
            <Empty
              title="MAKE A PLAN."
              body="Your booked experiences and tickets will live here."
              action="Discover activities"
              onPress={() => navigation.navigate('Discover')}
            />
          )}
        </Page>
      </QueryState>
    </View>
  );
}
