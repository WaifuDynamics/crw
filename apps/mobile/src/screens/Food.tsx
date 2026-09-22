import { themed, tint } from '../theme';
import ProfileButton from '../components/ProfileButton';
import PageBrand from '../components/PageBrand';
import React, { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '../api';
import { useFoodCatalog, FoodItem } from '../foodCatalog';
import { useCurrentPlace } from '../place';
import { C, S, T, Heading, Label, Icon, Tap, Page } from '../ui';
import { DOCK_SPACE } from '../layout';

function FoodPhoto({ item, style }: { item?: FoodItem; style?: any }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item?.imageUrl]);
  return item?.imageUrl && !failed ? (
    <Image source={{ uri: item.imageUrl }} accessibilityLabel={item.name} onError={() => setFailed(true)} resizeMode="cover" style={[{ backgroundColor: C.panel2 }, style]} />
  ) : (
    <View style={[{ backgroundColor: tint('#142A42'), alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name="leaf-outline" size={36} color={C.blue} />
    </View>
  );
}
function FoodSearch({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return <View style={st.search}>
    <Icon name="search-outline" size={20} color={C.gray} />
    <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={C.gray} value={value} onChangeText={onChange} style={st.input} />
    {!!value && <Tap label={`Clear ${label.toLowerCase()}`} onPress={() => onChange('')} style={st.clear}><Icon name="close" size={18} color={C.gray} /></Tap>}
  </View>;
}
function Filter({ title, active, onPress }: { title: string; active: boolean; onPress: () => void }) {
  return <Tap label={title} accessibilityState={{ selected: active }} onPress={onPress} style={[st.filter, active && st.filterActive]}>
    <T style={[st.filterText, active && { color: C.black }]}>{title}</T>
  </Tap>;
}
function Nutrition({ item }: { item: FoodItem }) {
  return <View style={st.nutrition}>
    {item.calories != null && <T style={st.meta}>{item.calories} kcal</T>}
    {item.proteinGrams != null && <T style={[st.meta, { color: C.blue }]}>{item.proteinGrams}g protein</T>}
    {item.calories == null && item.proteinGrams == null && <T style={st.meta}>Explore the menu</T>}
  </View>;
}
function Empty({ reset }: { reset: () => void }) {
  return <View style={st.empty}>
    <Icon name="search-outline" size={28} color={C.blue} />
    <Heading style={st.sectionTitle}>NO MATCHES YET.</Heading>
    <T style={st.copy}>Try a different dish or category in this menu.</T>
    <Tap label="Clear food filters" onPress={reset} style={st.action}><T style={st.actionText}>Clear filters</T><Icon name="arrow-forward" color={C.black} size={17} /></Tap>
  </View>;
}
function useOpenMenu() {
  const { say } = useSession();
  return async (url: string) => {
    try {
      if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
      else await Linking.openURL(url);
    } catch { say('Could not open the restaurant menu. Please try again.'); }
  };
}
function DishCard({ item, kitchen, onPress }: { item: FoodItem; kitchen?: string; onPress: () => void }) {
  return <Tap testID="food-menu-item" label={`Source menu for ${item.name}`} onPress={onPress} style={st.dish}>
    <FoodPhoto item={item} style={st.dishPhoto} />
    <View style={st.dishBody}>
      {!!kitchen && <Label style={st.eyebrow}>{kitchen}</Label>}
      <T style={st.dishName}>{item.name}</T>
      <Nutrition item={item} />
      {!!item.nutritionBasis && <T style={st.basis}>{item.nutritionBasis}</T>}
      <View style={[S.between, { marginTop: 12, gap: 8 }]}>
        <T style={st.price}>{item.priceLabel || 'View price'}</T>
        <View style={st.smallArrow}><Icon name="arrow-up-right" size={17} color={C.blue} /></View>
      </View>
    </View>
  </Tap>;
}

export default function Food({ navigation }: any) {
  const [search, setSearch] = useState('');
  const { user } = useSession();
  const here = useCurrentPlace(user?.account?.country_code);
  const catalog = useFoodCatalog();
  const query = search.trim().toLowerCase();
  const stores = catalog.stores.filter((store) =>
    `${store.name} ${store.area} ${store.specialty}`.toLowerCase().includes(query),
  );

  return (
    <Page style={{ paddingBottom: DOCK_SPACE + 24 }}>
      <View style={st.header}>
        <PageBrand title="FOOD" />
        <View style={[S.row, { gap: 10 }]}>
          <Icon name="location-outline" size={14} color={C.blue} />
          <T numberOfLines={1} style={st.location}>{here.label}</T>
          <ProfileButton navigation={navigation} />
        </View>
      </View>
      <View style={st.intro}>
        <Heading style={st.title}>EAT WELL{`\n`}<T style={st.titleAccent}>FEEL GOOD.</T></Heading>
        <T style={st.introCopy}>Choose a restaurant, then explore its menu.</T>
      </View>
      <FoodSearch label="Search restaurants" value={search} onChange={setSearch} placeholder="Restaurant name or cuisine" />
      <View style={st.sectionHeader}>
        <Heading style={st.sectionTitle}>CHOOSE YOUR KITCHEN</Heading>
        <Label style={st.count}>{stores.length} PLACES</Label>
      </View>
      {stores.map((store) => {
        const menu = catalog.items.filter((item) => item.storeId === store.id);
        return (
          <Tap
            key={store.id}
            testID="food-store-card"
            label={`View ${store.name} menu`}
            onPress={() => navigation.navigate('FoodStore', { id: store.id })}
            style={st.restaurant}
          >
            <View style={st.restaurantCover}>
              <FoodPhoto item={menu.find((item) => item.imageUrl)} style={StyleSheet.absoluteFill} />
              <View style={st.restaurantBadge}>
                <Icon name="restaurant-outline" size={12} color="#123659" />
                <Label style={st.heroBadgeText}>{menu.length} DISHES</Label>
              </View>
            </View>
            <View style={st.restaurantBody}>
              <Heading style={st.restaurantName}>{store.name}</Heading>
              <T style={st.copy}>{store.specialty}</T>
              <View style={[S.row, { gap: 5, marginTop: 4 }]}>
                <Icon name="location-outline" size={13} color={C.gray} />
                <T style={{ fontSize: 10, flexShrink: 1 }}>{store.area}</T>
              </View>
              <View style={st.restaurantAction}>
                <T style={st.actionText}>View menu</T>
                <Icon name="arrow-forward" size={18} color={C.black} />
              </View>
            </View>
          </Tap>
        );
      })}
      {!stores.length && (
        <View style={st.empty}>
          <Icon name="search-outline" size={28} color={C.blue} />
          <Heading style={st.sectionTitle}>NO RESTAURANTS FOUND.</Heading>
          <T style={st.copy}>Try another name or cuisine.</T>
          <Tap label="Show all restaurants" onPress={() => setSearch('')} style={st.action}>
            <T style={st.actionText}>Show all restaurants</T>
          </Tap>
        </View>
      )}
      <View style={st.footer}>
        <Icon name="leaf-outline" size={22} color={C.blue} />
        <Heading style={st.footerTitle}>GOOD FOOD. YOUR CHOICE.</Heading>
        <T style={st.footerCopy}>Explore each kitchen?s dishes, prices and nutrition in its own menu.</T>
      </View>
    </Page>
  );
}

export function FoodStoreScreen({ route, navigation }: any) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All dishes');
  const catalog = useFoodCatalog();
  const openMenu = useOpenMenu();
  const store = catalog.stores.find((candidate) => candidate.id === route.params?.id);
  const menu = catalog.items.filter((item) => item.storeId === store?.id);
  const categories = [...new Set(menu.map((item) => item.category))];
  const items = menu.filter((item) => (category === 'All dishes' || item.category === category) && `${item.name} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  if (!store) return <Page><Tap label="Back to kitchens" onPress={() => navigation.goBack()} style={st.header}><Icon name="arrow-back" /><T>Kitchen unavailable. Back to kitchens</T></Tap></Page>;
  return <Page style={{ paddingBottom: DOCK_SPACE + 24 }}>
    <View style={st.header}><Tap label="Back to kitchens" onPress={() => navigation.goBack()} style={[S.row, { gap: 8, minHeight: 44 }]}><Icon name="arrow-back" size={20} /><T style={{ color: C.white }}>Kitchens</T></Tap><Label style={st.eyebrow}>CRW+ / FOOD</Label></View>
    <View style={[st.hero, { height: 240 }]}>
      <FoodPhoto item={menu.find((item) => item.imageUrl)} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['#07132100', '#071321EF']} style={StyleSheet.absoluteFill} />
      <View style={st.heroBadge}><Icon name="restaurant-outline" size={13} color="#123659" /><Label style={st.heroBadgeText}>LOCAL KITCHEN</Label></View>
      <View style={st.heroBottom}><View style={{ flex: 1 }}><Heading style={[st.heroTitle, { fontSize: 40, lineHeight: 43 }]}>{store.name}</Heading><T style={st.heroMeta}>{store.area}</T></View></View>
    </View>
    <T style={[st.copy, { marginTop: 17 }]}>{store.specialty}</T>
    <View style={[S.between, { gap: 12, marginTop: 14, marginBottom: 22 }]}><Label style={st.count}>{menu.length} DISHES TO DISCOVER</Label><Tap label={`Open ${store.name} website`} onPress={() => void openMenu(store.sourceUrl)} style={[S.row, { gap: 5, minHeight: 44 }]}><T style={{ color: C.blue, fontSize: 11 }}>Visit kitchen</T><Icon name="arrow-up-right" size={15} color={C.blue} /></Tap></View>
    <FoodSearch label="Search this menu" value={search} onChange={setSearch} placeholder={`Search ${store.name}'s menu`} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filters}>{['All dishes', ...categories].map((value) => <Filter key={value} title={value} active={category === value} onPress={() => setCategory(value)} />)}</ScrollView>
    {categories.filter((group) => items.some((item) => item.category === group)).map((group) => <View key={group}><View style={st.sectionHeader}><Heading style={st.sectionTitle}>{group.toUpperCase()}</Heading><Label style={st.count}>{items.filter((item) => item.category === group).length} DISHES</Label></View>{items.filter((item) => item.category === group).map((item) => <DishCard key={item.id} item={item} onPress={() => void openMenu(item.sourceUrl)} />)}</View>)}
    {!items.length && <Empty reset={() => { setSearch(''); setCategory('All dishes'); }} />}
    <T style={[st.footerCopy, { marginTop: 20 }]}>Menu checked {new Date(catalog.updatedAt).toLocaleDateString('en-GB')}. Nutrition is restaurant-listed. Tap a dish for ingredients, allergens and the current menu price.</T>
  </Page>;
}

const st = themed(() => StyleSheet.create({
  header: { ...S.between, paddingTop: 16, marginBottom: 26, minHeight: 48, flexWrap: 'wrap', gap: 12 },
  location: { fontSize: 10, color: C.gray, maxWidth: 72 },
  intro: { marginBottom: 24 },
  eyebrow: { color: C.blue, fontSize: 8, letterSpacing: 1.6 },
  title: { fontFamily: 'DisplayItalic', fontSize: 57, lineHeight: 56, letterSpacing: -0.8 },
  titleAccent: { fontFamily: 'DisplayItalic', fontSize: 57, lineHeight: 56, letterSpacing: -0.8, color: C.blue },
  introCopy: { fontSize: 12, lineHeight: 20, marginTop: 15 },
  hero: { height: 258, borderRadius: 24, overflow: 'hidden', backgroundColor: C.panel },
  heroBadge: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D9EBFF', borderRadius: 30, paddingHorizontal: 11, paddingVertical: 8 },
  heroBadgeText: { color: '#123659', fontSize: 7, letterSpacing: 1 },
  heroBottom: { position: 'absolute', bottom: 20, left: 20, right: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 32, lineHeight: 34 },
  heroMeta: { color: '#E1EBF7', fontSize: 10, lineHeight: 17, marginTop: 6 },
  restaurant: { borderRadius: 22, overflow: 'hidden', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, marginBottom: 18 },
  restaurantCover: { height: 174, backgroundColor: C.panel2 },
  restaurantBadge: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, backgroundColor: '#D9EBFF', paddingHorizontal: 11, paddingVertical: 8 },
  restaurantBody: { paddingHorizontal: 16, paddingVertical: 11, gap: 2 },
  restaurantName: { fontSize: 34, lineHeight: 37 },
  restaurantAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: C.blue, paddingHorizontal: 16, minHeight: 44, marginTop: 6 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 16, borderWidth: 1, borderColor: C.line, paddingLeft: 15, paddingRight: 5, gap: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 52, color: C.white, fontFamily: 'Inter', fontSize: 12 },
  clear: { padding: 12 },
  filters: { gap: 8, paddingTop: 13, paddingBottom: 7 },
  filter: { minHeight: 42, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: C.line, justifyContent: 'center', backgroundColor: C.panel },
  filterActive: { backgroundColor: C.blue, borderColor: C.blue },
  filterText: { fontFamily: 'InterSemi', fontSize: 11, color: C.gray },
  sectionHeader: { ...S.between, gap: 10, marginTop: 29, marginBottom: 15 },
  sectionTitle: { fontSize: 27, lineHeight: 31, marginTop: 4, flexShrink: 1 },
  count: { fontSize: 7, letterSpacing: 0.8, color: C.gray, flexShrink: 0 },
  dish: { flexDirection: 'row', alignItems: 'stretch', padding: 11, gap: 14, marginBottom: 12, borderRadius: 20, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  dishPhoto: { width: 100, minHeight: 126, borderRadius: 13 },
  dishBody: { flex: 1, paddingVertical: 4, minWidth: 0 },
  dishName: { fontFamily: 'InterBold', color: C.white, fontSize: 12, lineHeight: 18, marginTop: 5 },
  nutrition: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2, marginTop: 7 },
  meta: { fontSize: 10, lineHeight: 16 },
  basis: { fontSize: 8, lineHeight: 13, marginTop: 3 },
  price: { fontFamily: 'InterBold', color: C.white, fontSize: 12 },
  smallArrow: { width: 28, height: 28, borderRadius: 14, backgroundColor: tint('#142A42'), justifyContent: 'center', alignItems: 'center' },
  copy: { fontSize: 12, lineHeight: 20 },
  empty: { alignItems: 'center', padding: 25, gap: 10, backgroundColor: C.panel, borderRadius: 20, marginVertical: 20 },
  action: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: C.blue, paddingHorizontal: 20, minHeight: 44, borderRadius: 24, marginTop: 8 },
  actionText: { fontFamily: 'InterBold', fontSize: 12, color: C.black },
  footer: { alignItems: 'center', borderTopWidth: 1, borderColor: C.line, marginTop: 24, paddingTop: 25, gap: 10 },
  footerTitle: { fontSize: 23, textAlign: 'center' },
  footerCopy: { fontSize: 9, lineHeight: 16, textAlign: 'center', color: C.gray },
}));
