import { clay } from '../claySurface';
import { tint } from '../theme';
import React, { useState } from 'react';
import { View, Image } from 'react-native';
import { useData, useSession, useAction, post, remove, invalidate, queryString } from '../api';
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
  EventCard,
  SectionTitle,
  Runner,
} from '../ui';
export function SearchScreen({ navigation }: any) {
  const [term, setTerm] = useState(''),
    [submitted, setSubmitted] = useState(''),
    [city, setCity] = useState(''),
    [category, setCategory] = useState('');
  const results = useData(`/search?q=${encodeURIComponent(submitted)}`, !!submitted);
  const events = useData('/events?' + queryString({ city, category, q: submitted }));
  const catalog = useData('/catalog');
  const suggestions = useData('/search/suggestions');
  return (
    <View style={S.page}>
      <Header title="WHAT ARE YOU UP FOR?" onBack={navigation.goBack} />
      <Page>
        <View style={{ marginTop: 15 }}>
          <Field
            label="Find activities, people or communities"
            value={term}
            onChange={setTerm}
            placeholder="Run & coffee, hiking, Beirut…"
          />
          <Button
            title="Find my next move"
            icon="search-outline"
            onPress={() => setSubmitted(term.trim())}
          />
        </View>
        <View style={[S.row, { gap: 8, flexWrap: 'wrap', marginTop: 22 }]}>
          {(suggestions.data?.recent || []).map((s: any) => (
            <Chip
              key={s.term}
              title={s.term}
              onPress={() => {
                setTerm(s.term);
                setSubmitted(s.term);
              }}
            />
          ))}
        </View>
        <Label style={{ marginTop: 20, marginBottom: 13 }}>WHERE</Label>
        <View style={[S.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Chip title="Anywhere" active={!city} onPress={() => setCity('')} />
          {catalog.data?.cities?.map((c: any) => (
            <Chip key={c.id} title={c.name} active={city === c.id} onPress={() => setCity(c.id)} />
          ))}
        </View>
        <Label style={{ marginTop: 22, marginBottom: 13 }}>WHAT MOVES YOU</Label>
        <View style={[S.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Chip title="All activities" active={!category} onPress={() => setCategory('')} />
          {catalog.data?.categories?.map((c: any) => (
            <Chip
              key={c.slug}
              title={c.name}
              active={category === c.slug}
              onPress={() => setCategory(c.slug)}
            />
          ))}
        </View>
        {results.data?.people?.length > 0 && (
          <View style={{ marginTop: 25 }}>
            <SectionTitle title="YOUR PEOPLE." />
            {results.data.people.map((p: any) => (
              <Tap
                key={p.id}
                onPress={() => navigation.navigate('Person', { id: p.id })}
                style={[S.row, { gap: 12, paddingVertical: 11 }]}
              >
                <Avatar url={p.avatar_url} name={p.display_name} />
                <T style={{ color: C.white }}>{p.display_name}</T>
                <Icon name="arrow-forward" size={16} />
              </Tap>
            ))}
          </View>
        )}
        {results.data?.communities?.length > 0 && (
          <View style={{ marginTop: 25 }}>
            <SectionTitle title="THE CREWS." />
            {results.data.communities.map((co: any) => (
              <Tap
                key={co.id}
                onPress={() => navigation.navigate('Community', { id: co.id })}
                style={[
                  S.between,
                  { padding: 15, ...clay('graphite', 0.7), borderRadius: 12, marginBottom: 8 },
                ]}
              >
                <T style={{ color: C.white, fontSize: 13 }}>{co.name}</T>
                <Icon name="checkmark-circle" color={C.blue} size={16} />
              </Tap>
            ))}
          </View>
        )}
        <View style={{ marginTop: 28 }}>
          <SectionTitle title="GOOD PLANS START HERE." />
          <QueryState query={events}>
            {events.data?.events?.length ? (
              events.data.events.map((e: any) => (
                <EventCard
                  key={e.id}
                  event={e}
                  compact
                  onPress={() => navigation.navigate('Event', { id: e.id })}
                />
              ))
            ) : (
              <Empty
                title="NOTHING JUST YET."
                body="Try a different search or widen your filters."
              />
            )}
          </QueryState>
        </View>
      </Page>
    </View>
  );
}
export function CommunitiesScreen({ navigation }: any) {
  const q = useData('/communities');
  return (
    <View style={S.page}>
      <Header title="FIND YOUR CREW" onBack={navigation.goBack} />
      <QueryState query={q}>
        <Page>
          {q.data?.length ? (
            q.data.map((co: any) => (
              <Tap
                key={co.id}
                onPress={() => navigation.navigate('Community', { id: co.id })}
                style={{
                  marginTop: 20,
                  ...clay('graphite', 0.7),
                  borderRadius: 18,
                  overflow: 'hidden',
                }}
              >
                <Image source={{ uri: co.cover_url }} style={{ height: 175, width: '100%' }} />
                <View style={{ padding: 20 }}>
                  <Heading style={{ fontSize: 33 }}>
                    {co.name.toUpperCase()}{' '}
                    <Icon name="checkmark-circle" color={C.blue} size={18} />
                  </Heading>
                  <T style={{ fontSize: 12, marginTop: 7 }}>
                    {co.city} · {co.followers} people · {co.category}
                  </T>
                </View>
              </Tap>
            ))
          ) : (
            <Empty
              title="THE COMMUNITY STARTS HERE."
              body="Verified communities will appear here as they join CRW+."
            />
          )}
        </Page>
      </QueryState>
    </View>
  );
}
export function CommunityScreen({ navigation, route }: any) {
  const q = useData(`/communities/${route.params.id}`);
  const { user } = useSession();
  const { busy, run } = useAction();
  const co = q.data;
  return (
    <View style={S.page}>
      <Header title="GOOD PEOPLE. GOOD MOVES." onBack={navigation.goBack} />
      <QueryState query={q}>
        {co && (
          <Page pad={false}>
            <Image
              source={{ uri: co.cover_url }}
              style={{ height: 235, width: '100%', backgroundColor: C.panel }}
            />
            <View style={S.pad}>
              <View style={[S.row, { gap: 7, marginTop: 25 }]}>
                <Label style={{ color: C.blue }}>VERIFIED COMMUNITY</Label>
                <Icon name="checkmark-circle" size={14} color={C.blue} />
              </View>
              <Heading
                style={{ fontFamily: 'DisplayItalic', fontSize: 51, lineHeight: 50, marginTop: 12 }}
              >
                {co.name.toUpperCase()}
              </Heading>
              <T style={{ fontSize: 12, marginTop: 13 }}>
                {co.city} · {co.followers} people
              </T>
              <T style={{ fontSize: 13, marginTop: 18, lineHeight: 23 }}>{co.description}</T>
              <Button
                title={co.followed ? 'Part of the crew ✓' : 'Follow this community'}
                variant={co.followed ? 'outline' : 'blue'}
                loading={busy}
                onPress={() => {
                  if (!user) {
                    navigation.navigate('Auth');
                    return;
                  }
                  run(async () => {
                    if (co.followed) await remove(`/communities/${co.id}/follow`);
                    else await post(`/communities/${co.id}/follow`);
                    await invalidate();
                  });
                }}
                style={{ marginTop: 23 }}
              />
              <View style={{ marginTop: 32 }}>
                <SectionTitle title="NEXT UP WITH THIS CREW." />
                {co.events
                  .filter((e: any) => new Date(e.ends_at) > new Date())
                  .map((e: any) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      compact
                      onPress={() => navigation.navigate('Event', { id: e.id })}
                    />
                  ))}
              </View>
              <View style={{ marginTop: 28 }}>
                <SectionTitle title="THE GOOD TIMES SO FAR." />
                {co.events
                  .filter((e: any) => new Date(e.ends_at) <= new Date())
                  .slice(0, 10)
                  .map((e: any) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      compact
                      onPress={() => navigation.navigate('Event', { id: e.id })}
                    />
                  ))}
              </View>
              <Button
                title="Report community"
                variant="dark"
                onPress={() =>
                  navigation.navigate(user ? 'Report' : 'Auth', {
                    targetType: 'community',
                    targetId: co.id,
                  })
                }
                style={{ marginTop: 20 }}
              />
            </View>
          </Page>
        )}
      </QueryState>
    </View>
  );
}
export function NotificationsScreen({ navigation }: any) {
  const q = useData('/notifications');
  const { run } = useAction();
  return (
    <View style={S.page}>
      <Header title="IN THE LOOP" onBack={navigation.goBack} />
      <QueryState query={q}>
        <Page>
          {q.data?.length ? (
            q.data.map((n: any) => (
              <Tap
                key={n.id}
                onPress={() =>
                  run(async () => {
                    await post(`/notifications/${n.id}/read`);
                    await q.refetch();
                    if (n.link?.startsWith('booking/'))
                      navigation.navigate('Booking', { id: n.link.split('/')[1] });
                    else if (n.link?.startsWith('event/'))
                      navigation.navigate('Event', { id: n.link.split('/')[1] });
                    else if (n.link?.startsWith('profile/'))
                      navigation.navigate('Person', { id: n.link.split('/')[1] });
                    else if (n.link === 'compete') navigation.navigate('Compete');
                    else if (n.link === 'friends') navigation.navigate('Friends');
                    else if (n.link === 'play') navigation.navigate('Compete');
                    else if (n.link === 'tracking') navigation.navigate('Tracking');
                  })
                }
                style={[
                  S.row,
                  { gap: 13, paddingVertical: 20, borderBottomWidth: 1, borderColor: C.line },
                ]}
              >
                <View
                  style={{
                    padding: 11,
                    backgroundColor: n.read_at ? C.panel : tint('#168BFF22'),
                    borderRadius: 13,
                  }}
                >
                  <Icon name="notifications-outline" color={n.read_at ? C.gray : C.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 12 }}>{n.title}</T>
                  <T style={{ fontSize: 11, lineHeight: 18, marginTop: 4 }}>{n.body}</T>
                </View>
                {!n.read_at && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.blue }} />
                )}
              </Tap>
            ))
          ) : (
            <Empty
              title="ALL CAUGHT UP."
              body="Booking updates, new connections, and achievements will land here."
            />
          )}
        </Page>
      </QueryState>
    </View>
  );
}
export function ReportScreen({ navigation, route }: any) {
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  const { say } = useSession();
  return (
    <View style={S.page}>
      <Header title="LOOKING OUT FOR EACH OTHER" onBack={navigation.goBack} />
      <Page>
        <T style={{ marginVertical: 22 }}>
          Tell us what happened. Your report goes to the CRW+ moderation team.
        </T>
        <Field
          label="What should we know?"
          value={reason}
          onChange={setReason}
          multiline
          placeholder="Please share at least 10 characters of detail."
        />
        <Button
          title="Send report"
          loading={busy}
          onPress={() =>
            run(async () => {
              await post('/reports', { ...route.params, reason });
              say('Your report has been sent to our moderation team.');
              navigation.goBack();
            })
          }
        />
        {route.params.targetType === 'user' && (
          <Button
            title="Block this person"
            variant="outline"
            style={{ marginTop: 15 }}
            onPress={() =>
              run(async () => {
                await post(`/profiles/${route.params.targetId}/block`);
                await invalidate();
                say('This person is blocked.');
                navigation.popToTop();
              })
            }
          />
        )}
      </Page>
    </View>
  );
}
