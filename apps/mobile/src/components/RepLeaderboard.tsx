import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import WalkingPersonIcon from './WalkingPersonIcon';
import { isLight, themed } from '../theme';
import { useData, useSession } from '../api';
import { Avatar, C, Icon, QueryState, T, Tap } from '../ui';
import { ClayButton } from './clay';
import { countryName } from '../countries';
import { useTranslation } from '../translations';

type Period = 'weekly' | 'monthly' | 'all';
type Scope = 'global' | 'friends' | 'country';
type Row = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  country_code: string | null;
  value: number;
  rank: number;
};
type Board = { rows: Row[]; me: Row | null; total: number; nextOffset: number | null };
type FilterKey = 'scope' | 'period';
type Filter = {
  key: FilterKey;
  label: string;
  icon: string;
  value: string;
  options: [string, string, string][];
  onChange: (value: string) => void;
};
const PAGE = 25;
// The distance endpoint returns metres, including tracked and imported workouts.
const kilometres = (metres: number) => (metres / 1000).toLocaleString(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const location = (row: Row) => row.country_code ? countryName(row.country_code) : '';

function Surface({ blue = false }: { blue?: boolean }) {
  return <LinearGradient
    pointerEvents="none"
    colors={blue ? ['#009FFF', '#0065F4'] : isLight() ? ['#FFFFFF', '#EAF0F6'] : ['#202A34', '#0D131A']}
    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}
  />;
}

function FilterPill({ filter, open, onPress }: { filter: Filter; open: boolean; onPress: () => void }) {
  const name = filter.options.find(([value]) => value === filter.value)?.[1] ?? '';
  return (
    <Tap label={`${filter.label}: ${name}`} accessibilityState={{ expanded: open }} onPress={onPress} style={[st.pill, open && st.pillOpen]}>
      <Surface />
      <View style={st.pillArt}><Icon name={filter.icon} size={19} color={C.gray} /></View>
      <View style={st.copy}>
        <T style={st.pillLabel}>{filter.label.toUpperCase()}</T>
        <T numberOfLines={1} style={st.pillValue}>{name}</T>
      </View>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={C.gray} />
    </Tap>
  );
}

function Podium({ rows, onOpen, narrow }: { rows: Row[]; onOpen: (row: Row) => void; narrow: boolean }) {
  const champion = rows[0];
  if (!champion) return null;
  return (
    <View style={st.podium}>
      <Tap testID="km-champion" label={`${champion.display_name}, place ${champion.rank}, ${kilometres(champion.value)} kilometres`} onPress={() => onOpen(champion)} style={st.champion}>
        <Surface blue />
        <T accessible={false} style={st.championNumber}>{String(champion.rank).padStart(2, '0')}</T>
        <View style={st.championPortrait}>
          <Icon name="trophy" size={narrow ? 25 : 30} color="#FFDA69" />
          <View style={st.championAvatarRing}>
            <Avatar url={champion.avatar_url} name={champion.display_name} size={narrow ? 60 : 78} style={st.championAvatar} />
          </View>
        </View>
        <View style={st.copy}>
          <T style={st.championLabel}>CHAMPION</T>
          <T numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[st.championName, narrow && { fontSize: 22 }]}>{champion.display_name}</T>
          <View style={st.scoreLine}>
            <T numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={[st.championValue, narrow && { fontSize: 44, lineHeight: 48 }]}>{kilometres(champion.value)}</T>
            <T style={st.championUnit}>KM</T>
          </View>
          {!!location(champion) && <T numberOfLines={1} style={st.championCountry}>{location(champion)}</T>}
        </View>
        <T accessible={false} style={st.motto}>{'MOVE\nSWEAT\nBELONG'}</T>
      </Tap>
      {rows.length > 1 && <View style={st.runners}>
        {rows.slice(1, 3).map((row) => (
          <View key={row.id} style={st.runnerSlot}>
          <Tap label={`${row.display_name}, place ${row.rank}, ${kilometres(row.value)} kilometres`} onPress={() => onOpen(row)} style={st.runner}>
            <Surface />
            <T style={st.runnerRank}>{String(row.rank).padStart(2, '0')}</T>
            <View style={st.runnerBody}>
              <Avatar url={row.avatar_url} name={row.display_name} size={narrow ? 32 : 46} style={st.runnerAvatar} />
              <View style={st.copy}>
                <T numberOfLines={1} style={[st.runnerName, narrow && { fontSize: 14 }]}>{row.display_name}</T>
                <View style={st.scoreLine}>
                  <T numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[st.runnerValue, narrow && { fontSize: 25 }]}>{kilometres(row.value)}</T>
                  <T style={st.runnerUnit}>KM</T>
                </View>
                {!!location(row) && <T numberOfLines={1} style={st.runnerCountry}>{location(row)}</T>}
              </View>
            </View>
          </Tap>
          </View>
        ))}
      </View>}
    </View>
  );
}

export default function RepLeaderboard({ navigation, embedded = false }: { navigation: any; embedded?: boolean }) {
  const { user } = useSession();
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('all');
  const [scope, setScope] = useState<Scope>('global');
  const [offset, setOffset] = useState(0);
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [narrow, setNarrow] = useState(false);
  const needsAccount = scope !== 'global' && !user;
  const board = useData<Board>(`/reps/leaderboard?metric=km&period=${period}&scope=${scope}&limit=${PAGE}&offset=${offset}`, !needsAccount);
  const reset = <V,>(set: (value: V) => void) => (value: V) => {
    set(value); setOffset(0); setOpenFilter(null);
  };
  const filters: Filter[] = [
    {
      key: 'scope', label: 'Scope', icon: scope === 'global' ? 'earth-outline' : scope === 'country' ? 'flag-outline' : 'people-outline',
      value: scope, onChange: (value) => reset(setScope)(value as Scope),
      options: [
        ['global', t('compete.scopes.global'), 'earth-outline'],
        ['country', user?.account?.country_code ? countryName(user.account.country_code) : t('compete.scopes.country'), 'flag-outline'],
        ['friends', t('compete.scopes.friends'), 'people-outline'],
      ],
    },
    {
      key: 'period', label: 'Period', icon: period === 'all' ? 'infinite-outline' : 'calendar-outline',
      value: period, onChange: (value) => reset(setPeriod)(value as Period),
      options: [
        ['weekly', t('compete.periods.weekly'), 'calendar-outline'],
        ['monthly', t('compete.periods.monthly'), 'calendar-number-outline'],
        ['all', t('compete.periods.all'), 'infinite-outline'],
      ],
    },
  ];
  const openMenu = filters.find((filter) => filter.key === openFilter);
  const open = (row: Row) => navigation.navigate('Person', { id: row.id });
  const data = board.data;
  return (
    <View testID="km-leaderboard" onLayout={(event) => setNarrow(event.nativeEvent.layout.width < 350)} style={[st.wrap, embedded && { paddingHorizontal: 0 }]}>
      <View style={[st.filters, { marginTop: 0 }]}>{filters.map((filter) => (
        <FilterPill key={filter.key} filter={filter} open={openFilter === filter.key} onPress={() => setOpenFilter(openFilter === filter.key ? null : filter.key)} />
      ))}</View>
      {openMenu && <View style={st.menu}>
        <Surface />
        {openMenu.options.map(([value, label, icon]) => (
          <Tap key={value} label={label} accessibilityState={{ selected: value === openMenu.value }} onPress={() => openMenu.onChange(value)} style={[st.option, value === openMenu.value && st.optionSelected]}>
            <Icon name={icon} size={17} color={value === openMenu.value ? '#FFFFFF' : C.gray} />
            <T style={[st.optionText, value === openMenu.value && { color: '#FFFFFF' }]}>{label}</T>
            {value === openMenu.value && <Icon name="checkmark" size={17} color="#FFFFFF" />}
          </Tap>
        ))}
      </View>}
      <View testID="km-panel" accessible accessibilityLabel="Kilometers, KM" style={st.distanceBanner}>
        <Svg width="100%" height="100%" viewBox="132 183 1796 290" accessible={false}>
          <Defs>
            <SvgLinearGradient id="km-panel-fill" x1="0" y1="0" x2="1" y2="0.65">
              <Stop offset="0" stopColor="#00CBEE" />
              <Stop offset="0.45" stopColor="#008BFF" />
              <Stop offset="1" stopColor="#0050FF" />
            </SvgLinearGradient>
            <SvgLinearGradient id="km-panel-border" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#2FEAFF" />
              <Stop offset="1" stopColor="#008AFF" />
            </SvgLinearGradient>
            <SvgLinearGradient id="km-badge-fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.55" stopColor="#F7FCFF" />
              <Stop offset="1" stopColor="#DFF3FF" />
            </SvgLinearGradient>
          </Defs>
          <Rect x={137} y={188} width={1786} height={280} rx={107} fill="url(#km-panel-fill)" stroke="url(#km-panel-border)" strokeWidth={10} />
          <Rect x={145} y={196} width={1770} height={264} rx={100} fill="none" stroke="#006CEB" strokeWidth={3} />
          <G transform="translate(283 328) scale(0.85) translate(-283 -328)">
            <Circle cx={286} cy={333} r={103} fill="#006DD6" opacity={0.35} />
            <Circle cx={283} cy={328} r={102} fill="url(#km-badge-fill)" stroke="#8DEBFF" strokeWidth={3} />
            <WalkingPersonIcon size={108} />
          </G>
          <SvgText x={438} y={382} fill="#FFFFFF" fontFamily="Display" fontSize={154}>Kilometers</SvgText>
          <SvgText x={1848} y={382} textAnchor="end" fill="#9DDEFF" fontFamily="DisplayItalic" fontSize={154}>KM</SvgText>
        </Svg>
      </View>
      {needsAccount ? <View style={st.panel}>
        <Surface />
        <Icon name="lock-closed-outline" size={26} color={C.blue} />
        <T style={st.panelTitle}>Sign in to see this ranking</T>
        <T style={st.detail}>Country and friends boards need an account. Global is open to everyone.</T>
        <ClayButton title="Sign in" onPress={() => navigation.navigate('Auth')} />
      </View> : <QueryState query={board}>
        {data && <View key={`${period}-${scope}-${offset}`}>
          {data.rows.length === 0 ? <View style={st.panel}>
            <Surface />
            <Icon name="walk-outline" size={30} color={C.blue} />
            <T style={st.panelTitle}>{scope === 'friends' ? 'No friends on the board yet' : 'No kilometres on the board yet'}</T>
            <T style={st.detail}>Every run, walk or ride you track adds its distance here.</T>
            <ClayButton title="Start tracking" icon="navigate" onPress={() => navigation.navigate('Tracking')} />
            {scope === 'friends' && <ClayButton title="Add friends" tone="graphite" onPress={() => navigation.navigate('Friends')} />}
          </View> : <>
            {offset === 0 && <Podium rows={data.rows} narrow={narrow} onOpen={open} />}
            <T style={st.sectionTitle}>{scope === 'friends' ? t('compete.scopes.friends') : t('compete.topCompetitors')}</T>
            <View style={st.rows}>
              <Surface />
              {data.rows.map((row, index) => (
                <Tap key={row.id} label={`${row.display_name}, place ${row.rank}, ${kilometres(row.value)} kilometres`} onPress={() => open(row)} style={[st.row, index > 0 && st.rowDivider, row.id === user?.id && st.myRow]}>
                  <T style={[st.rank, row.rank <= 3 && { color: C.blue }]}>{row.rank}</T>
                  <Avatar url={row.avatar_url} name={row.display_name} size={narrow ? 34 : 40} />
                  <View style={st.copy}>
                    <T numberOfLines={1} style={[st.rowName, narrow && { fontSize: 16 }]}>{row.display_name}{row.id === user?.id ? ' (you)' : ''}</T>
                    {!!location(row) && <T numberOfLines={1} style={st.detail}>{location(row)}</T>}
                  </View>
                  <View style={st.rowScore}>
                    <T numberOfLines={1} adjustsFontSizeToFit style={st.rowValue}>{kilometres(row.value)}</T>
                    <T style={st.rowUnit}>KM</T>
                  </View>
                </Tap>
              ))}
            </View>
            {(offset > 0 || data.nextOffset !== null) && <View style={st.pager}>
              {offset > 0 && <ClayButton title="Previous" size="compact" tone="graphite" onPress={() => setOffset(Math.max(0, offset - PAGE))} style={st.copy} />}
              {data.nextOffset !== null && <ClayButton title="Next people" size="compact" tone="graphite" onPress={() => setOffset(data.nextOffset!)} style={st.copy} />}
            </View>}
          </>}
          {data.me && <View style={st.myRank}>
            <Icon name="trending-up" size={18} color={C.blue} />
            <T style={[st.detail, st.copy]}>Your rank <T style={st.myRankText}>#{data.me.rank}</T> of {data.total.toLocaleString()}</T>
            <T style={st.myRankText}>{kilometres(data.me.value)} KM</T>
          </View>}
          <T style={st.note}>Kilometres come from workouts you track or import in Tracking. Weeks and months follow UTC.</T>
        </View>}
      </QueryState>}
    </View>
  );
}

const st = themed(() => StyleSheet.create({
  wrap: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 20 },
  copy: { flex: 1, minWidth: 0 },
  distanceBanner: { width: '100%', aspectRatio: 1796 / 290, marginTop: 10 },
  filters: { flexDirection: 'row', gap: 9, marginTop: 10 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 58, paddingHorizontal: 10, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line, boxShadow: 'inset 0 1px 2px #B0C7E022' },
  pillOpen: { borderColor: C.blue },
  pillArt: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  pillLabel: { fontFamily: 'InterBold', fontSize: 8, lineHeight: 12, letterSpacing: 1, color: C.gray },
  pillValue: { fontFamily: 'Display', fontSize: 19, lineHeight: 23, color: C.white },
  menu: { padding: 5, marginTop: 8, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
  optionSelected: { backgroundColor: C.blue },
  optionText: { flex: 1, fontSize: 13, color: C.white },
  podium: { marginTop: 12, gap: 9 },
  champion: { minHeight: 152, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, paddingRight: 24, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#31CAFF' },
  championNumber: { position: 'absolute', right: 12, top: -16, fontFamily: 'DisplayItalic', fontSize: 150, lineHeight: 172, color: '#B4E6FF', opacity: 0.22 },
  championPortrait: { gap: 1, alignItems: 'flex-start' },
  championAvatarRing: { padding: 2, borderWidth: 2, borderColor: '#57EDFF', borderRadius: 60, boxShadow: '0 0 10px #41DDFF99' },
  championAvatar: { backgroundColor: '#253541', borderColor: '#1271C9' },
  championLabel: { fontFamily: 'InterBold', fontSize: 9, lineHeight: 14, letterSpacing: 1.7, color: '#A3EEFF' },
  championName: { fontFamily: 'Display', fontSize: 26, lineHeight: 30, color: '#FFFFFF', marginTop: 4 },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  championValue: { flexShrink: 1, fontFamily: 'Display', fontSize: 57, lineHeight: 61, color: '#FFFFFF' },
  championUnit: { fontFamily: 'Display', fontSize: 20, color: '#9ED9FF' },
  championCountry: { fontSize: 12, lineHeight: 18, color: '#E0F2FF' },
  motto: { position: 'absolute', right: 10, bottom: 10, textAlign: 'right', fontFamily: 'DisplayItalic', fontSize: 7, lineHeight: 10, letterSpacing: 2, color: '#A7D8FF' },
  runners: { flexDirection: 'row', alignItems: 'stretch', width: '100%', gap: 9 },
  runnerSlot: { flex: 1, minWidth: 0 },
  runner: { width: '100%', height: 112, padding: 12, paddingTop: 23, borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: 'hidden', boxShadow: 'inset 0 1px 2px #B0C7E022' },
  runnerRank: { position: 'absolute', top: 7, left: 12, fontFamily: 'DisplayItalic', fontSize: 19, lineHeight: 21, color: '#91A4B9' },
  runnerBody: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 6 },
  runnerAvatar: { borderColor: '#06121B', boxShadow: '0 0 0 2px #355467' },
  runnerName: { fontFamily: 'Display', fontSize: 18, lineHeight: 22, color: C.white },
  runnerValue: { flexShrink: 1, fontFamily: 'Display', fontSize: 30, lineHeight: 34, color: C.blue },
  runnerUnit: { fontFamily: 'Display', fontSize: 12, color: C.gray },
  runnerCountry: { fontSize: 10, lineHeight: 15, color: C.gray },
  sectionTitle: { fontFamily: 'Display', fontSize: 28, lineHeight: 34, color: C.white, marginTop: 12, marginBottom: 8, paddingHorizontal: 4 },
  rows: { paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: C.line, overflow: 'hidden', boxShadow: 'inset 0 1px 2px #B0C7E022' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 9, paddingHorizontal: 3 },
  rowDivider: { borderTopWidth: 1, borderTopColor: isLight() ? '#D3DDE7' : '#2A3948' },
  myRow: { backgroundColor: '#168BFF14' },
  rank: { width: 20, textAlign: 'center', fontFamily: 'Display', fontSize: 26, color: C.gray },
  rowName: { fontFamily: 'Display', fontSize: 20, lineHeight: 24, color: C.white },
  rowScore: { alignItems: 'flex-end', maxWidth: '26%' },
  rowValue: { fontFamily: 'Display', fontSize: 26, lineHeight: 28, color: C.blue },
  rowUnit: { fontFamily: 'InterSemi', fontSize: 10, lineHeight: 14, color: isLight() ? C.gray : '#9ABAD8' },
  detail: { fontSize: 11, lineHeight: 17, color: C.gray },
  panel: { marginTop: 12, padding: 18, gap: 10, borderRadius: 22, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  panelTitle: { fontFamily: 'Display', fontSize: 23, lineHeight: 27, color: C.white },
  pager: { flexDirection: 'row', gap: 10, marginTop: 12 },
  myRank: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, backgroundColor: C.panel, borderRadius: 16 },
  myRankText: { fontFamily: 'InterBold', fontSize: 12, color: C.blue },
  note: { marginTop: 14, fontSize: 10, lineHeight: 16, color: C.gray },
}));
