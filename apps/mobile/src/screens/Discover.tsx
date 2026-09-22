import { clay } from '../claySurface';
import ProfileButton from '../components/ProfileButton';
import PageBrand from '../components/PageBrand';
import { isLight, tint } from '../theme';
import React, { useState } from 'react';
import { View, ScrollView, Image, Text } from 'react-native';
import * as Location from 'expo-location';
import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
// The photo campaigns rotate here again; AdMob (components/SponsoredPanel) is parked for
// now, and with it the ad-consent dialog it opened on first launch.
import AdPanel from '../components/AdPanel';
import DiscoverBackground from '../components/DiscoverBackground';
import { PeoplePanel } from '../components/DiscoverPanels';
import { useData, useSession, queryString, useAction, request } from '../api';
import { useCurrentPlace } from '../place';
import { DOCK_SPACE } from '../layout';
import { useTranslation } from '../translations';
import {
  C,
  S,
  T,
  Heading,
  Label,
  Icon,
  Tap,
  Chip,
  Chips,
  EventCard,
  SectionTitle,
  Page,
  QueryState,
  Runner,
  Empty,
  categoryIcon,
} from '../ui';
export default function Discover({ navigation }: any) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const [controlsTop, setControlsTop] = useState(367);
  const [searchHovered, setSearchHovered] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const { user, say } = useSession();
  const { run } = useAction();
  const [filter, setFilter] = useState('For you'),
    [category, setCategory] = useState(''),
    // Set only by the card below, so tapping it narrows Today to where you are without
    // changing what the Today chip means when it is tapped directly.
    [nearToday, setNearToday] = useState(false),
    [coords, setCoords] = useState<any>(null);
  const here = useCurrentPlace(user?.account?.country_code);
  // Where to count from: what "Near me" was granted, or the position the place lookup
  // already has. Null means we genuinely do not know, and nothing may claim a city.
  const statsAt =
    coords ||
    (here.place?.lat !== undefined && here.place?.lng !== undefined
      ? { lat: here.place.lat, lng: here.place.lng, radius: 25 }
      : null);
  const filters: any = {
    Today: { when: 'today', ...(nearToday && statsAt ? statsAt : {}) },
    Tonight: { when: 'tonight' },
    Tomorrow: { when: 'tomorrow' },
    Weekend: { when: 'weekend' },
    Free: { free: true },
    Paid: { free: false },
    Trending: { sort: 'trending' },
    'Friends going': { friends: true },
    Beginner: { beginner: true },
    'Near me': coords || {},
  };
  const events = useData('/events?' + queryString({ ...filters[filter], category }));
  const stats = useData('/discover/stats' + (statsAt ? '?' + queryString(statsAt) : ''));
  const catalog = useData('/catalog');
  const communities = useData('/communities');
  // The card may name a place only when the numbers behind it are about that place.
  // With no position the counts are worldwide, and saying "TODAY IN WARSAW" would lie.
  const placeName =
    statsAt && (here.place?.city || here.place?.country)
      ? (here.place.city || here.place.country)!.toLocaleUpperCase()
      : null;
  // Three zeros tell nobody anything; a sentence does.
  const quietHere = stats.isSuccess && !(Number(stats.data?.activities) > 0);
  const hasFilters = filter !== 'For you' || !!category;
  const history = useQuery({
    queryKey: ['discover-community-history', communities.data?.map((co: any) => co.id)],
    enabled:
      !hasFilters &&
      events.isSuccess &&
      events.data.events.length === 0 &&
      !!communities.data?.length,
    queryFn: async () => {
      const crews = await Promise.all(
        communities.data.slice(0, 3).map((co: any) => request(`/communities/${co.id}`)),
      );
      const unique = new Map<string, any>();
      for (const crew of crews)
        for (const event of crew.events || [])
          if (new Date(event.ends_at).getTime() <= Date.now()) unique.set(event.id, event);
      return [...unique.values()]
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
        .slice(0, 8);
    },
  });
  const showingHistory =
    !hasFilters && events.isSuccess && events.data.events.length === 0 && !!history.data?.length;
  const all = showingHistory ? history.data! : events.data?.events || [];
  const featured = all.find((e: any) => e.featured) || all[0];
  const others = all.filter((e: any) => e.id !== featured?.id);
  const selectFilter = (f: string) => {
    setNearToday(false);
    if (f === 'Friends going' && !user) {
      navigation.navigate('Auth');
      return;
    }
    if (f === 'Near me') {
      run(async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          say('Location access is off. You can still browse by city or activity.');
          return;
        }
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords({ lat: location.coords.latitude, lng: location.coords.longitude, radius: 25 });
        setFilter(f);
      });
    } else setFilter(f);
  };
  return (
    <Page
      pad={false}
      style={{ paddingBottom: DOCK_SPACE }}
      refresh={() => {
        events.refetch();
        stats.refetch();
      }}
      refreshing={events.isRefetching}
    >
      <DiscoverBackground focused={focused} controlsTop={controlsTop} />
      <View style={[S.between, S.pad, { paddingTop: 16, paddingBottom: 27, flexWrap: 'wrap', gap: 12 }]}>
        <Tap
          onPress={() => {
            setFilter('For you');
            setCategory('');
          }}
          label="CRW+ home"
          style={S.row}
        >
          <PageBrand title="DISCOVER" />
        </Tap>
        <View style={[S.row, { gap: 12 }]}>
          <Tap
            label={here.located ? `Current location ${here.label}` : 'Use my location'}
            onPress={() => {
              if (here.located) navigation.navigate('Search');
              else
                void here.locate().then((p) => {
                  if (!p) say('Allow location to show your city. You can still browse everywhere.');
                });
            }}
            style={[S.row, { gap: 5, padding: 5 }]}
          >
            <Icon name={here.located ? 'location' : 'location-outline'} size={15} color={C.blue} />
            <T
              numberOfLines={1}
              style={{ fontSize: 12, color: C.white, fontFamily: 'InterBold', maxWidth: 130 }}
            >
              {here.label}
            </T>
            <Icon name="chevron-down" size={12} color={C.gray} />
          </Tap>
          <ProfileButton navigation={navigation} />
        </View>
      </View>
      <View
        style={S.pad}
        onLayout={({ nativeEvent: { layout } }) => setControlsTop(layout.y + layout.height)}
      >
        <Heading
          style={{ fontFamily: 'DisplayItalic', fontSize: 62, lineHeight: 58, letterSpacing: -0.8 }}
        >
          GOOD DAYS{`\n`}START{' '}
          <T style={{ fontFamily: 'DisplayItalic', fontSize: 62, lineHeight: 58, color: C.blue }}>
            OUTSIDE.
          </T>
        </Heading>
        <Tap
          label="Search activities, places and people"
          onPress={() => navigation.navigate('Search')}
          onHoverIn={() => setSearchHovered(true)}
          onHoverOut={() => setSearchHovered(false)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          style={[
            S.row,
            {
              // A light field in both themes: pale grey on the dark page, white on the light one.
              backgroundColor: isLight()
                ? '#FFFFFF'
                : searchHovered || searchFocused
                  ? C.white
                  : '#E9EDF1',
              borderWidth: 2,
              borderColor: searchFocused
                ? C.blue
                : isLight()
                  ? searchHovered
                    ? C.gray
                    : C.line
                  : searchHovered
                    ? C.white
                    : '#E9EDF1',
              borderRadius: 28,
              minHeight: 56,
              paddingHorizontal: 18,
              paddingVertical: 12,
              gap: 11,
              marginTop: 23,
              marginBottom: 22,
            },
          ]}
        >
          <Icon name="search-outline" size={20} color="#46515E" />
          <T style={{ flex: 1, color: '#596370', fontSize: 13, lineHeight: 20 }}>
            {t('discover.searchPlaceholder')}
          </T>
        </Tap>
      </View>
      <Chips>
        {[
          ['For you', t('discover.filters.forYou')],
          ['Today', t('discover.filters.today')],
          ['Tonight', t('discover.filters.tonight')],
          ['Near me', t('discover.filters.nearMe')],
          ['Weekend', t('discover.filters.weekend')],
          ['Free', t('discover.filters.free')],
          ['Paid', t('discover.filters.paid')],
          ['Trending', t('discover.filters.trending')],
          ['Friends going', t('discover.filters.friendsGoing')],
          ['Beginner', t('discover.filters.beginner')],
          ['Tomorrow', t('discover.filters.tomorrow')],
        ].map(([f, label]) => (
          <Chip key={f} title={label} glass active={filter === f} onPress={() => selectFilter(f)} />
        ))}
      </Chips>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 21, paddingBottom: 6, gap: 23 }}
      >
        {[{ slug: '', name: t('discover.allMoves') }, ...(catalog.data?.categories || [])].map(
          (c: any) => (
            <Tap
              key={c.slug}
              onPress={() => setCategory(c.slug)}
              label={c.name}
              style={{ alignItems: 'center', gap: 9, minWidth: 51 }}
            >
              <View
                style={{
                  width: 47,
                  height: 47,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: category === c.slug ? C.blue : C.line,
                  backgroundColor: category === c.slug ? tint('#168BFF18') : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={c.slug ? categoryIcon(c.slug) : 'grid-outline'}
                  size={21}
                  color={category === c.slug ? C.blue : C.gray}
                />
              </View>
              <T
                style={{
                  fontSize: 9,
                  fontFamily: 'InterBold',
                  lineHeight: 13,
                  color: category === c.slug ? C.white : C.gray,
                }}
              >
                {c.name}
              </T>
            </Tap>
          ),
        )}
      </ScrollView>
      <AdPanel />
      <QueryState query={events}>
        <View style={[S.pad, { marginTop: 27 }]}>
          <SectionTitle
            title={
              showingHistory
                ? 'GOOD TIMES WITH YOUR CREW.'
                : filter === 'For you' && !category
                  ? 'YOUR NEXT GOOD THING.'
                  : 'FIND YOUR NEXT MOVE.'
            }
            action={showingHistory ? 'Explore crews' : `${all.length} activities`}
            onPress={() => navigation.navigate(showingHistory ? 'Communities' : 'Search')}
            eyebrow={
              showingHistory
                ? 'PAST COMMUNITY ACTIVITIES'
                : filter === 'For you'
                  ? 'PICKED FOR A GOOD DAY'
                  : filter.toUpperCase()
            }
          />
          {showingHistory && (
            <T style={{ fontSize: 12, lineHeight: 19, marginBottom: 16 }}>
              These activities have ended. Explore what our crews have been doing while new dates
              are being planned.
            </T>
          )}
          {featured ? (
            <EventCard
              event={featured}
              wide
              onPress={() => navigation.navigate('Event', { id: featured.id })}
            />
          ) : (
            <Empty
              title="A FRESH START."
              body={
                hasFilters
                  ? 'No activities match these filters. Try another day or a different move.'
                  : 'No upcoming activities just yet. Find a crew to move with.'
              }
              action={hasFilters ? 'Reset filters' : 'Explore communities'}
              onPress={() => {
                if (!hasFilters) {
                  navigation.navigate('Communities');
                  return;
                }
                setFilter('For you');
                setCategory('');
              }}
            />
          )}
        </View>
      </QueryState>
      <View style={[S.pad, { marginTop: 24 }]}>
        <Tap
          label={t('discover.exploreToday')}
          onPress={() => {
            // Tapping the card should land on what the card just promised.
            setNearToday(!!statsAt);
            setFilter('Today');
          }}
          style={{ ...clay('cream'), borderRadius: 18, padding: 20, overflow: 'hidden' }}
        >
          <View style={[S.between, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              <Label style={{ color: tint('#737781'), fontSize: 9 }}>
                {t('discover.cityIsMoving')}
              </Label>
              <Heading style={{ color: C.black, fontSize: 32, lineHeight: 34, marginTop: 6 }}>
                {/* Only name a place when the numbers are actually about that place. */}
                {placeName
                  ? t('discover.todayIn', { place: placeName })
                  : t('discover.todayEverywhere')}
              </Heading>
            </View>
            <Icon name="arrow-up-right" color={C.black} size={21} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 17 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
          {quietHere ? (
            <T style={{ color: tint('#646974'), fontSize: 13, lineHeight: 19, marginTop: 17 }}>
              {placeName
                ? t('discover.nothingHere', { place: placeName })
                : t('discover.nothingToday')}
            </T>
          ) : (
            <View style={[S.row, { gap: 16, flexWrap: 'wrap' }]}>
              {[
                ['runs', t('discover.runs')],
                ['hikes', t('discover.hikes')],
                ['games', t('discover.games')],
              ].map(([key, label]) => (
                <View key={key}>
                  <Heading style={{ color: C.black, fontSize: 46, lineHeight: 47 }}>
                    {stats.data?.[key] ?? '—'}
                  </Heading>
                  <Label style={{ color: tint('#737781'), fontSize: 8 }}>{label}</Label>
                </View>
              ))}
            </View>
          )}
          </View>
          <View style={{ width: 124, flexShrink: 0, alignItems: 'center', marginRight: 8 }}>
            <Runner width={124} height={124} ink="#182431" />
          </View>
          </View>
          {!quietHere && (
            <>
              <View style={{ height: 1, backgroundColor: tint('#DDE0E5'), marginVertical: 17 }} />
              <View style={[S.row, { gap: 7 }]}>
                <View
                  style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: C.blue }}
                />
                <T style={{ color: tint('#646974'), fontSize: 11 }}>
                  <T style={{ color: C.black, fontFamily: 'InterBold', fontSize: 11 }}>
                    {stats.data?.people ?? '—'}
                  </T>{' '}
                  {t('discover.peopleJoining')}
                </T>
              </View>
            </>
          )}
        </Tap>
      </View>
      {others.length > 0 && (
        <View style={{ marginTop: 30 }}>
          <View style={S.pad}>
            <SectionTitle
              title="MORE WAYS TO MOVE."
              eyebrow={showingHistory ? 'PAST COMMUNITY ACTIVITIES' : undefined}
              action={showingHistory ? 'Explore crews' : 'Explore'}
              onPress={() => navigation.navigate(showingHistory ? 'Communities' : 'Search')}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={308}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 24, gap: 16 }}
          >
            {others.map((e: any) => (
              <EventCard
                key={e.id}
                event={e}
                onPress={() => navigation.navigate('Event', { id: e.id })}
              />
            ))}
          </ScrollView>
        </View>
      )}
      <View style={[S.pad, { marginTop: 28 }]}>
        <PeoplePanel
          signedIn={!!user}
          friends={stats.data?.friends || 0}
          onPress={() => (user ? selectFilter('Friends going') : navigation.navigate('Auth'))}
        />
      </View>
      {!!communities.data?.length && (
        <View style={[S.pad, { marginTop: 30 }]}>
          <SectionTitle
            title="FIND YOUR KIND OF PEOPLE."
            action="All crews"
            onPress={() => navigation.navigate('Communities')}
          />
          {communities.data.slice(0, 3).map((co: any) => (
            <Tap
              key={co.id}
              onPress={() => navigation.navigate('Community', { id: co.id })}
              style={[
                S.row,
                { paddingVertical: 13, gap: 13, borderBottomWidth: 1, borderColor: C.line },
              ]}
            >
              <Image
                source={{ uri: co.cover_url }}
                style={{ width: 49, height: 49, borderRadius: 25 }}
              />
              <View style={{ flex: 1 }}>
                <View style={[S.row, { gap: 5 }]}>
                  <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13 }}>{co.name}</T>
                  <Icon name="checkmark-circle" size={13} color={C.blue} />
                </View>
                <T style={{ fontSize: 11 }}>
                  {co.city} · {co.followers} people
                </T>
              </View>
              <Icon name="arrow-up-right" size={17} />
            </Tap>
          ))}
        </View>
      )}
      <View style={{ alignItems: 'center', paddingTop: 35, paddingBottom: 4 }}>
        <Heading style={{ fontFamily: 'DisplayItalic', fontSize: 27, color: tint('#42464E') }}>
          LESS SCROLL. MORE SOUL.
        </Heading>
        <Label style={{ marginTop: 7, fontSize: 8, color: tint('#626771') }}>
          MEET YOU OUT THERE. / CRW+
        </Label>
      </View>
    </Page>
  );
}
