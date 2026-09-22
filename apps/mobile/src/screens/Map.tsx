import { clay } from '../claySurface';
import { tint } from '../theme';
import React, { useState } from 'react';
import { View, Image } from 'react-native';
import MobileModal from '../components/MobileModal';
import { useData, queryString, money, timeLabel } from '../api';
import {
  C,
  S,
  T,
  Heading,
  Label,
  Icon,
  Tap,
  Button,
  Chips,
  Chip,
  Header,
  QueryState,
  CircleButton,
  Page,
  Field,
  Empty,
} from '../ui';
import ActivityMap from '../components/ActivityMap';
export default function MapScreen({ navigation }: any) {
  const [when, setWhen] = useState('today'),
    [category, setCategory] = useState(''),
    [selected, setSelected] = useState<any>(null),
    [filters, setFilters] = useState(false),
    [free, setFree] = useState(false),
    [beginner, setBeginner] = useState(false),
    [max, setMax] = useState('');
  const q = useData(
    '/events?' +
      queryString({
        when,
        category,
        free: free ? 'true' : undefined,
        beginner: beginner ? 'true' : undefined,
        maxPrice: max ? Math.round(Number(max) * 100) : undefined,
        limit: 100,
      }),
  );
  const catalog = useData('/catalog');
  const events = q.data?.events || [];
  return (
    <View style={S.page}>
      <View style={[S.between, S.pad, { paddingTop: 19, paddingBottom: 18 }]}>
        <View>
          <Label style={{ color: C.blue, marginBottom: 5 }}>GO WHERE THE ENERGY IS</Label>
          <Heading style={{ fontSize: 40, lineHeight: 42 }}>FIND YOUR OUTSIDE.</Heading>
        </View>
        <CircleButton icon="options-outline" label="Map filters" onPress={() => setFilters(true)} />
      </View>
      <View style={{ paddingBottom: 14 }}>
        <Chips>
          {[
            ['today', 'Today'],
            ['now', 'Live now'],
            ['tonight', 'Tonight'],
            ['tomorrow', 'Tomorrow'],
            ['weekend', 'Weekend'],
            ['', 'All upcoming'],
          ].map(([key, label]) => (
            <Chip
              key={key}
              title={label}
              active={when === key}
              onPress={() => {
                setWhen(key);
                setSelected(null);
              }}
            />
          ))}
        </Chips>
      </View>
      <View style={{ flex: 1, position: 'relative', minHeight: 430 }}>
        <QueryState query={catalog}>
          {catalog.data?.cities?.[0] && (
            <ActivityMap
              events={events}
              center={
                catalog.data.cities.find((c: any) => c.name === 'Beirut') || catalog.data.cities[0]
              }
              onSelect={setSelected}
            />
          )}
        </QueryState>
        <View
          style={{
            position: 'absolute',
            top: 18,
            left: 20,
            backgroundColor: C.bg,
            padding: 12,
            borderRadius: 12,
          }}
        >
          <View style={[S.row, { gap: 7 }]}>
            <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: C.blue }} />
            <T style={{ fontSize: 11, color: C.white, fontFamily: 'InterBold' }}>
              {q.isPending ? 'Finding activities…' : `${events.length} activities on the map`}
            </T>
          </View>
        </View>
        {q.error && (
          <View style={{ position: 'absolute', bottom: 25, left: 20, right: 20 }}>
            <Button title="Could not load activities. Tap to retry." onPress={q.refetch} />
          </View>
        )}
        {selected ? (
          <View
            style={{
              position: 'absolute',
              bottom: 25,
              left: 18,
              right: 18,
              ...clay('cream'),
              borderRadius: 22,
              padding: 18,
            }}
          >
            <View style={[S.between, { marginBottom: 10 }]}>
              <View
                style={{
                  height: 4,
                  width: 34,
                  backgroundColor: tint('#D9DEE6'),
                  borderRadius: 2,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              />
              <Tap onPress={() => setSelected(null)} label="Close activity preview">
                <Icon name="close" size={20} color={C.black} />
              </Tap>
            </View>
            <View style={[S.row, { gap: 13 }]}>
              <Image
                source={{ uri: selected.cover_url }}
                style={{ width: 78, height: 88, borderRadius: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Label style={{ color: C.blue, fontSize: 8 }}>
                  {selected.category.toUpperCase()} ·{' '}
                  {timeLabel(selected.starts_at, selected.timezone)}
                </Label>
                <Heading style={{ color: C.black, fontSize: 29, lineHeight: 29, marginTop: 5 }}>
                  {selected.title.toUpperCase()}
                </Heading>
                <T style={{ fontSize: 10, color: tint('#707681'), marginTop: 4 }}>
                  {selected.attendee_count} going · {selected.spots_remaining} spots left
                </T>
              </View>
            </View>
            <Button
              title={`Let’s go · ${selected.price_minor ? money(selected.price_minor, selected.currency) : 'Free'}`}
              onPress={() => navigation.navigate('Event', { id: selected.id })}
              icon="arrow-forward"
              style={{ marginTop: 16 }}
            />
          </View>
        ) : (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 32,
              left: 40,
              right: 40,
              backgroundColor: tint('#08090BED'),
              borderRadius: 14,
              padding: 15,
            }}
          >
            <T style={{ textAlign: 'center', fontSize: 12, color: C.white }}>
              {events.length
                ? 'Tap a blue pin. Find your next plan.'
                : 'No activities match. Try another day or filter.'}
            </T>
          </View>
        )}
      </View>
      <MobileModal
        visible={filters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFilters(false)}
      >
        <View style={S.page}>
          <Header title="YOUR KIND OF MOVE" onBack={() => setFilters(false)} />
          <Page>
            <T style={{ marginVertical: 16 }}>Make the map yours.</T>
            <Chips style={{ paddingHorizontal: 0, flexWrap: 'wrap' }}>
              <Chip title="Free" active={free} onPress={() => setFree(!free)} />
              <Chip
                title="Beginner friendly"
                active={beginner}
                onPress={() => setBeginner(!beginner)}
              />
            </Chips>
            <Field
              label="Maximum activity price (USD)"
              value={max}
              onChange={setMax}
              keyboardType="numeric"
              placeholder="Any price"
              style={{ marginTop: 20 }}
            />
            <Label style={{ marginBottom: 12 }}>ACTIVITY</Label>
            <View style={[S.row, { flexWrap: 'wrap', gap: 8 }]}>
              <Chip title="All moves" active={!category} onPress={() => setCategory('')} />
              {catalog.data?.categories.map((c: any) => (
                <Chip
                  key={c.slug}
                  title={c.name}
                  active={category === c.slug}
                  onPress={() => setCategory(c.slug)}
                />
              ))}
            </View>
            <Button
              title="Show activities"
              onPress={() => {
                setFilters(false);
                setSelected(null);
              }}
              style={{ marginTop: 30 }}
            />
          </Page>
        </View>
      </MobileModal>
    </View>
  );
}
