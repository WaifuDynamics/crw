import React, { useState } from 'react';
import { View, Image, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  useData,
  useSession,
  useAction,
  post,
  patch,
  invalidate,
  uid,
  money,
  dateLabel,
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
export function ApplyScreen({ navigation }: any) {
  const q = useData('/organizer/application');
  const catalog = useData('/catalog');
  const { busy, run } = useAction();
  const { say } = useSession();
  const [form, setForm] = useState<any>({
    name: '',
    category: 'running',
    description: '',
    cityId: '',
    contactEmail: '',
    phone: '',
    socialUrl: '',
    verificationInfo: '',
  });
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  return (
    <View style={S.page}>
      <Header title="BRING PEOPLE TOGETHER" onBack={navigation.goBack} />
      <Page>
        <Runner width={180} height={140} />
        <Heading
          style={{ fontFamily: 'DisplayItalic', fontSize: 50, lineHeight: 49, marginTop: 14 }}
        >
          GOOD COMMUNITIES{`\n`}START WITH YOU.
        </Heading>
        <T style={{ fontSize: 12, marginTop: 17, marginBottom: 25 }}>
          CRW+ partners with trusted hosts. Tell us about your community. Our team reviews every
          application before organizer tools are enabled.
        </T>
        <QueryState query={q}>
          {q.data &&
          ['submitted', 'under_review', 'approved', 'suspended'].includes(q.data.status) ? (
            <View style={S.card}>
              <Label style={{ color: C.blue }}>
                APPLICATION {q.data.status.replace('_', ' ').toUpperCase()}
              </Label>
              <Heading style={{ fontSize: 33, marginTop: 14 }}>{q.data.name}</Heading>
              <T style={{ fontSize: 12, marginTop: 10 }}>
                {q.data.review_note ||
                  'Your application is with our team. We’ll notify you when there is an update.'}
              </T>
            </View>
          ) : (
            <>
              <Field
                label="Community or organization name"
                value={form.name}
                onChange={(v: string) => set('name', v)}
              />
              <Field
                label="Tell us about your community"
                value={form.description}
                onChange={(v: string) => set('description', v)}
                multiline
              />
              <Label style={{ marginBottom: 12 }}>PRIMARY ACTIVITY</Label>
              <View style={[S.row, { gap: 8, flexWrap: 'wrap', marginBottom: 20 }]}>
                {catalog.data?.categories?.map((c: any) => (
                  <Chip
                    key={c.slug}
                    title={c.name}
                    active={form.category === c.slug}
                    onPress={() => set('category', c.slug)}
                  />
                ))}
              </View>
              <Label style={{ marginBottom: 12 }}>CITY</Label>
              <View style={[S.row, { gap: 8, flexWrap: 'wrap', marginBottom: 20 }]}>
                {catalog.data?.cities?.map((c: any) => (
                  <Chip
                    key={c.id}
                    title={c.name}
                    active={form.cityId === c.id}
                    onPress={() => set('cityId', c.id)}
                  />
                ))}
              </View>
              <Field
                label="Contact email"
                value={form.contactEmail}
                onChange={(v: string) => set('contactEmail', v)}
                keyboardType="email-address"
              />
              <Field
                label="Contact phone"
                value={form.phone}
                onChange={(v: string) => set('phone', v)}
                keyboardType="phone-pad"
              />
              <Field
                label="Website or social profile (optional, HTTPS)"
                value={form.socialUrl}
                onChange={(v: string) => set('socialUrl', v)}
              />
              <Field
                label="Experience, qualifications & verification information"
                value={form.verificationInfo}
                onChange={(v: string) => set('verificationInfo', v)}
                multiline
              />
              <Button
                title="Submit organizer application"
                loading={busy}
                onPress={() =>
                  run(async () => {
                    await post('/organizer/apply', {
                      ...form,
                      socialUrl: form.socialUrl || undefined,
                    });
                    await q.refetch();
                    say('Application submitted. We’ll be in touch.');
                  })
                }
              />
            </>
          )}
        </QueryState>
      </Page>
    </View>
  );
}
export function OrganizerScreen({ navigation }: any) {
  const q = useData('/organizer/overview');
  return (
    <View style={S.page}>
      <Header title="ORGANIZER STUDIO" onBack={navigation.goBack} />
      <QueryState query={q}>
        <Page>
          <Label style={{ color: C.blue, marginTop: 22 }}>GREAT EXPERIENCES START HERE</Label>
          <Heading style={{ fontSize: 46, lineHeight: 45, marginTop: 12 }}>
            YOUR CREW.{`\n`}YOUR NEXT BIG THING.
          </Heading>
          <View style={{ marginTop: 23, gap: 12 }}>
            <Button
              title="Create an activity"
              icon="add"
              onPress={() => navigation.navigate('EventEditor')}
            />
            <Button
              title="Scan tickets & check in"
              icon="scan-outline"
              variant="white"
              onPress={() => navigation.navigate('Scanner')}
            />
          </View>
          {q.data?.communities.map((co: any) => (
            <Button
              key={co.id}
              title={`Manage ${co.name}`}
              variant="outline"
              onPress={() => navigation.navigate('CommunityEditor', { community: co })}
              style={{ marginTop: 12 }}
            />
          ))}
          {q.data?.earnings.map((e: any) => (
            <View key={e.currency} style={[S.card, { marginTop: 22 }]}>
              <Label>{e.currency} EARNINGS</Label>
              <View style={[S.row, { gap: 15, marginTop: 15 }]}>
                {[
                  ['Gross', e.gross],
                  ['CRW+ fees', e.fees],
                  ['Your net', e.net],
                ].map(([label, value]) => (
                  <View key={label} style={{ flex: 1 }}>
                    <Heading
                      style={{ fontSize: 28, color: label === 'Your net' ? C.blue : C.white }}
                    >
                      {money(Number(value), e.currency)}
                    </Heading>
                    <T style={{ fontSize: 10 }}>{label}</T>
                  </View>
                ))}
              </View>
            </View>
          ))}
          <View style={{ marginTop: 30 }}>
            <SectionTitle title="YOUR ACTIVITIES." />
            {q.data?.events.length ? (
              q.data.events.map((e: any) => (
                <Tap
                  key={e.id}
                  onPress={() => navigation.navigate('ManageEvent', { event: e })}
                  style={[S.card, { marginBottom: 13 }]}
                >
                  <View style={S.between}>
                    <Label style={{ color: C.blue }}>{e.status.toUpperCase()}</Label>
                    <Icon name="arrow-forward" size={17} />
                  </View>
                  <Heading style={{ fontSize: 30, marginTop: 10 }}>{e.title.toUpperCase()}</Heading>
                  <T style={{ fontSize: 11, marginTop: 8 }}>
                    {dateLabel(e.starts_at)} · {e.booked} / {e.capacity} booked
                  </T>
                  <T style={{ fontSize: 10 }}>
                    {e.checked_in} checked in · {e.views} views
                  </T>
                </Tap>
              ))
            ) : (
              <Empty
                title="YOUR FIRST MOVE."
                body="Create an activity and invite your community to show up."
              />
            )}
          </View>
          <View style={{ marginTop: 25 }}>
            <SectionTitle title="PAYOUTS." />
            {q.data?.payouts.length ? (
              q.data.payouts.map((p: any) => (
                <View
                  key={p.id}
                  style={[
                    S.between,
                    { paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line },
                  ]}
                >
                  <View>
                    <T style={{ color: C.white, fontFamily: 'InterBold' }}>
                      {money(p.amount_minor, p.currency)}
                    </T>
                    <T style={{ fontSize: 10 }}>{p.provider_reference || 'Awaiting settlement'}</T>
                  </View>
                  <Label style={{ color: C.blue }}>{p.status}</Label>
                </View>
              ))
            ) : (
              <T style={{ fontSize: 12 }}>
                Eligible earnings are available for payout seven days after an activity ends.
                Payouts appear here when initiated by the platform.
              </T>
            )}
          </View>
        </Page>
      </QueryState>
    </View>
  );
}
export function EventEditorScreen({ navigation, route }: any) {
  const old = route.params?.event;
  const { user, say } = useSession();
  const catalog = useData('/catalog');
  const overview = useData(
    user?.roles.includes('ADMIN') ? '/admin/data/communities' : '/organizer/overview',
  );
  const communities = user?.roles.includes('ADMIN') ? overview.data : overview.data?.communities;
  const { busy, run } = useAction();
  const [form, setForm] = useState<any>(
    old
      ? {
          communityId: old.community_id,
          title: old.title,
          description: old.description,
          category: old.category,
          difficulty: old.difficulty,
          cityId: old.city_id,
          locationName: old.location_name,
          latitude: String(old.latitude),
          longitude: String(old.longitude),
          startsAt: new Date(old.starts_at).toISOString(),
          endsAt: new Date(old.ends_at).toISOString(),
          capacity: String(old.capacity),
          priceMinor: String(old.price_minor),
          currency: old.currency,
          coverUrl: old.cover_url || '',
          tags: old.tags.join(', '),
          requirements: old.requirements,
          included: old.included,
          safetyInfo: old.safety_info,
          cancellationHours: String(old.cancellation_hours),
          status: old.status,
        }
      : {
          communityId: '',
          title: '',
          description: '',
          category: 'running',
          difficulty: 'beginner',
          cityId: '',
          locationName: '',
          latitude: '',
          longitude: '',
          startsAt: '',
          endsAt: '',
          capacity: '20',
          priceMinor: '0',
          currency: 'USD',
          coverUrl: '',
          tags: '',
          requirements: '',
          included: '',
          safetyInfo: '',
          cancellationHours: '24',
          status: 'draft',
        },
  );
  const set = (key: string, value: any) => setForm({ ...form, [key]: value });
  const upload = () =>
    run(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0],
        blob = await (await fetch(asset.uri)).blob(),
        type = asset.mimeType || 'image/jpeg';
      const signed = await post('/uploads/presign', {
        contentType: type,
        size: blob.size,
        purpose: 'event',
      });
      const response = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': type },
        body: blob,
      });
      if (!response.ok) throw new Error('Upload failed');
      set('coverUrl', signed.mediaUrl);
    });
  const save = () =>
    run(async () => {
      const body = {
        ...form,
        communityId: form.communityId || communities?.[0]?.id,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        capacity: Number(form.capacity),
        priceMinor: Number(form.priceMinor),
        cancellationHours: Number(form.cancellationHours),
        coverUrl: form.coverUrl || null,
        tags: form.tags
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean),
      };
      if (old) await patch(`/organizer/events/${old.id}`, body);
      else await post('/organizer/events', body);
      await invalidate();
      say(old ? 'Activity updated.' : 'Your activity is created.');
      navigation.goBack();
    });
  return (
    <View style={S.page}>
      <Header
        title={old ? 'EDIT YOUR ACTIVITY' : 'MAKE SOMETHING HAPPEN'}
        onBack={navigation.goBack}
      />
      <Page>
        <Label style={{ marginTop: 18, marginBottom: 12 }}>COMMUNITY</Label>
        <View style={[S.row, { gap: 8, flexWrap: 'wrap', marginBottom: 22 }]}>
          {communities?.map((co: any) => (
            <Chip
              key={co.id}
              title={co.name}
              active={
                form.communityId === co.id || (!form.communityId && co.id === communities[0].id)
              }
              onPress={() => set('communityId', co.id)}
            />
          ))}
        </View>
        <Field
          label="Activity title"
          value={form.title}
          onChange={(v: string) => set('title', v)}
        />
        <Field
          label="The plan (at least 20 characters)"
          value={form.description}
          onChange={(v: string) => set('description', v)}
          multiline
        />
        <Label style={{ marginBottom: 12 }}>CATEGORY</Label>
        <View style={[S.row, { gap: 8, flexWrap: 'wrap', marginBottom: 22 }]}>
          {catalog.data?.categories?.map((c: any) => (
            <Chip
              key={c.slug}
              title={c.name}
              active={form.category === c.slug}
              onPress={() => set('category', c.slug)}
            />
          ))}
        </View>
        <Label style={{ marginBottom: 12 }}>LEVEL</Label>
        <View style={[S.row, { gap: 8, flexWrap: 'wrap', marginBottom: 22 }]}>
          {['beginner', 'intermediate', 'advanced', 'all'].map((d) => (
            <Chip
              key={d}
              title={d}
              active={form.difficulty === d}
              onPress={() => set('difficulty', d)}
            />
          ))}
        </View>
        <Label style={{ marginBottom: 12 }}>CITY</Label>
        <View style={[S.row, { gap: 8, flexWrap: 'wrap', marginBottom: 22 }]}>
          {catalog.data?.cities?.map((c: any) => (
            <Chip
              key={c.id}
              title={c.name}
              active={form.cityId === c.id}
              onPress={() => set('cityId', c.id)}
            />
          ))}
        </View>
        {[
          ['locationName', 'Meeting location', ''],
          ['latitude', 'Meeting latitude', 'Copy the actual meeting point latitude'],
          ['longitude', 'Meeting longitude', 'Copy the actual meeting point longitude'],
          ['startsAt', 'Starts at · include time zone', '2026-10-03T08:00:00+03:00'],
          ['endsAt', 'Ends at · include time zone', '2026-10-03T10:00:00+03:00'],
          ['capacity', 'Maximum people', '20'],
          ['priceMinor', 'Ticket price in minor units', '800 = $8.00 USD'],
          ['currency', 'Currency code', 'USD'],
          ['cancellationHours', 'Free cancellation · hours before start', '24'],
          ['tags', 'Tags · comma separated', '5 KM, SOCIAL PACE'],
        ].map(([key, label, placeholder]) => (
          <Field
            key={key}
            label={label}
            value={form[key]}
            onChange={(v: string) => set(key, v)}
            placeholder={placeholder}
          />
        ))}
        <Button
          title="Upload activity photo"
          variant="outline"
          onPress={upload}
          style={{ marginBottom: 18 }}
        />
        <Field
          label="Cover image URL (HTTPS)"
          value={form.coverUrl}
          onChange={(v: string) => set('coverUrl', v)}
        />
        {[
          ['requirements', 'What to bring'],
          ['included', 'What is included'],
          ['safetyInfo', 'Safety & emergency information'],
        ].map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={form[key]}
            onChange={(v: string) => set(key, v)}
            multiline
          />
        ))}
        <Toggle
          title="Publish activity"
          description="Published activities are visible to the CRW+ community."
          value={form.status === 'published'}
          onChange={(v: boolean) => set('status', v ? 'published' : 'draft')}
        />
        <Button
          title={
            old ? 'Save changes' : form.status === 'published' ? 'Publish activity' : 'Save draft'
          }
          loading={busy}
          onPress={save}
          style={{ marginTop: 20 }}
        />
      </Page>
    </View>
  );
}
export function ManageEventScreen({ navigation, route }: any) {
  const e = route.params.event;
  const q = useData(`/organizer/events/${e.id}/bookings`);
  const { busy, run } = useAction();
  const { say } = useSession();
  const [message, setMessage] = useState(''),
    [cancel, setCancel] = useState(false);
  return (
    <View style={S.page}>
      <Header title="ACTIVITY CONTROL" onBack={navigation.goBack} />
      <Page>
        <Heading style={{ fontSize: 43, lineHeight: 42, marginTop: 20 }}>
          {e.title.toUpperCase()}
        </Heading>
        <View style={{ gap: 10, marginTop: 22 }}>
          <Button
            title="Edit activity"
            variant="white"
            onPress={() => navigation.navigate('EventEditor', { event: e })}
          />
          <Button title="Scan tickets" onPress={() => navigation.navigate('Scanner')} />
        </View>
        <View style={{ marginTop: 27 }}>
          <SectionTitle title="KEEP YOUR CREW IN THE LOOP." />
          <Field
            label="Update for confirmed attendees"
            value={message}
            onChange={setMessage}
            multiline
          />
          <Button
            title="Send activity update"
            loading={busy}
            onPress={() =>
              run(async () => {
                await post(`/organizer/events/${e.id}/announce`, { message });
                setMessage('');
                say('Update sent to your confirmed attendees.');
              })
            }
          />
        </View>
        <View style={{ marginTop: 30 }}>
          <SectionTitle title="THE GUEST LIST." />
          <QueryState query={q}>
            {q.data?.map((b: any) => (
              <View key={b.id} style={[S.card, { marginBottom: 12 }]}>
                <View style={S.between}>
                  <T style={{ color: C.white, fontFamily: 'InterBold' }}>{b.display_name}</T>
                  <Label style={{ color: b.checked_in_at ? C.green : C.blue, fontSize: 8 }}>
                    {b.checked_in_at ? 'CHECKED IN' : b.status.toUpperCase()}
                  </Label>
                </View>
                <T style={{ fontSize: 11, marginTop: 8 }}>
                  {money(b.total_minor, b.currency)} · {b.id.slice(0, 8)}
                </T>
                {b.status === 'confirmed' && !b.checked_in_at && (
                  <Button
                    title="Cancel & refund this booking"
                    variant="outline"
                    onPress={() =>
                      run(async () => {
                        await post(`/organizer/bookings/${b.id}/refund`);
                        await q.refetch();
                        say('Booking cancelled; any paid amount is queued for refund.');
                      })
                    }
                    style={{ minHeight: 42, marginTop: 11 }}
                  />
                )}
              </View>
            ))}
          </QueryState>
        </View>
        <View style={S.divider} />
        {cancel ? (
          <View>
            <T style={{ marginBottom: 15 }}>
              Cancel this activity and refund all eligible paid bookings?
            </T>
            <Button
              title="Confirm activity cancellation"
              loading={busy}
              onPress={() =>
                run(async () => {
                  await post(`/organizer/events/${e.id}/cancel`);
                  await invalidate();
                  say('Activity cancelled. Refunds are queued.');
                  navigation.goBack();
                })
              }
            />
            <Button
              title="Keep activity"
              variant="outline"
              onPress={() => setCancel(false)}
              style={{ marginTop: 9 }}
            />
          </View>
        ) : (
          <Button title="Cancel activity" variant="outline" onPress={() => setCancel(true)} />
        )}
      </Page>
    </View>
  );
}
export function ScannerScreen({ navigation }: any) {
  const [permission, ask] = useCameraPermissions();
  const [token, setToken] = useState(''),
    [result, setResult] = useState<any>(null),
    [scanning, setScanning] = useState(false);
  const { busy, run } = useAction();
  const scan = (value: string) => {
    setScanning(false);
    run(async () => {
      const r = await post('/organizer/checkin', { token: value });
      setResult(r);
      if (Platform.OS !== 'web')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await invalidate();
    });
  };
  return (
    <View style={S.page}>
      <Header title="GOOD TO SEE YOU" onBack={navigation.goBack} />
      <Page>
        {result ? (
          <View style={{ alignItems: 'center', paddingTop: 45, gap: 22 }}>
            <View
              style={{
                backgroundColor: C.blue,
                width: 100,
                height: 100,
                borderRadius: 50,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="checkmark" size={60} color={C.onAccent} />
            </View>
            <Heading style={{ fontFamily: 'DisplayItalic', fontSize: 66 }}>YOU’RE IN.</Heading>
            <T style={{ color: C.white, fontSize: 20 }}>{result.name}</T>
            <Label style={{ color: C.blue }}>+{result.xp} ATTENDANCE XP</Label>
            <Button
              title="Scan the next ticket"
              onPress={() => {
                setResult(null);
                setToken('');
                setScanning(true);
              }}
            />
          </View>
        ) : (
          <>
            <Heading style={{ fontSize: 44, lineHeight: 44, marginTop: 26 }}>
              ONE SCAN.{`\n`}ONE REAL-WORLD MOVE.
            </Heading>
            <T style={{ fontSize: 12, marginVertical: 19 }}>
              Scan your attendee’s CRW+ QR ticket. Each ticket can only be checked in once.
            </T>
            {scanning && permission?.granted ? (
              <View style={{ height: 310, borderRadius: 20, overflow: 'hidden', marginBottom: 18 }}>
                <CameraView
                  style={{ flex: 1 }}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={busy ? undefined : ({ data }) => scan(data)}
                />
              </View>
            ) : (
              <Button
                title="Open QR scanner"
                icon="scan-outline"
                variant="white"
                onPress={() =>
                  run(async () => {
                    if (!permission?.granted) {
                      const p = await ask();
                      if (!p.granted) throw new Error('Camera access is needed to scan tickets.');
                    }
                    setScanning(true);
                  })
                }
              />
            )}
            <View style={{ marginTop: 25 }}>
              <Field label="Or paste a ticket token" value={token} onChange={setToken} multiline />
              <Button
                title="Validate & check in"
                loading={busy}
                onPress={() => scan(token.trim())}
              />
            </View>
          </>
        )}
      </Page>
    </View>
  );
}
