import { C, tint, themed } from './theme';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  AccessibilityInfo,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Ellipse, Line, SvgXml } from 'react-native-svg';
import { runningIllustration } from './components/runningIllustration';
import LiquidGlass from './components/LiquidGlass';
import { dateLabel, timeLabel, money } from './api';
import { t } from './translations';
import { errorKey } from './errors';
// The clay surfaces only - not components/clay, which imports this file back.
import { CLAY, clay, well, type ClayTone } from './claySurface';
export { C, tint };
export const S = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    grow: { flex: 1 },
    gap: { gap: 12 },
    page: { flex: 1, backgroundColor: C.bg },
    pad: { paddingHorizontal: 24 },
    section: { marginTop: 30 },
    body: { fontFamily: 'Inter', fontSize: 14, lineHeight: 22, color: C.gray },
    label: { fontFamily: 'InterBold', fontSize: 10, letterSpacing: 1.7, color: C.gray },
    title: { fontFamily: 'Display', fontSize: 36, lineHeight: 38, color: C.white },
    card: { ...clay('graphite'), borderRadius: 22, padding: 20 },
    divider: { height: 1, backgroundColor: C.line, marginVertical: 20 },
    // Text you type into is pressed into the page rather than raised off it.
    input: {
      ...well(),
      color: C.white,
      padding: 16,
      borderRadius: 16,
      fontFamily: 'Inter',
      fontSize: 14,
      minHeight: 52,
    },
    inputLabel: { fontFamily: 'InterBold', fontSize: 12, color: C.white, marginBottom: 9 },
    error: { color: tint('#FFA6A6'), fontFamily: 'Inter', fontSize: 13, lineHeight: 20 },
    chip: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 30,
      backgroundColor: C.panel,
      borderWidth: 1,
      borderColor: C.line,
    },
    button: {
      minHeight: 54,
      borderRadius: 14,
      paddingHorizontal: 21,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      backgroundColor: C.blue,
    },
  }),
);
export function T({ children, style, ...props }: any) {
  return (
    <Text {...props} style={[S.body, style]}>
      {children}
    </Text>
  );
}
export function Heading({ children, style }: any) {
  return <Text style={[S.title, style]}>{children}</Text>;
}
export function Label({ children, style, ...props }: any) {
  return (
    <Text {...props} style={[S.label, style]}>
      {children}
    </Text>
  );
}
export function Icon({ name, size = 22, color = C.white }: any) {
  return name === 'arrow-up-right' ? (
    <Feather name="arrow-up-right" size={size} color={color} />
  ) : (
    <Ionicons name={name} size={size} color={color} />
  );
}
export function Tap({ children, onPress, style, label, disabled = false, ...props }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  const animate = (v: number) => {
    if (!reduced)
      Animated.spring(scale, {
        toValue: v,
        useNativeDriver: Platform.OS !== 'web',
        speed: 30,
        bounciness: 3,
      }).start();
  };
  return (
    <Animated.View style={{ transform: [{ scale }], ...(props.flex ? { flex: 1 } : {}) }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        onPress={() => {
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
          onPress?.();
        }}
        style={[style, disabled && { opacity: 0.5 }]}
        {...props}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
// The four variants this app has always had, mapped onto clay tones so every screen
// still calling <Button> gets the new material without being edited.
const BUTTON_TONE: Record<string, ClayTone> = {
  blue: 'blue',
  white: 'cream',
  dark: 'graphite',
  outline: 'graphite',
};

export function Button({
  title,
  onPress,
  loading = false,
  variant = 'blue',
  icon,
  style,
  disabled = false,
}: any) {
  const tone = BUTTON_TONE[variant] || 'blue';
  const ink = CLAY[tone].ink;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      label={title}
      style={[
        S.button,
        // Outline used to be a hairline on nothing; as clay it is the quietest slab.
        clay(tone, variant === 'outline' ? 0.55 : 1),
        { borderRadius: 26 },
        disabled && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <>
          <T style={{ fontFamily: 'InterBold', color: ink, fontSize: 13 }}>{title}</T>
          {icon && <Icon name={icon} size={18} color={ink} />}
        </>
      )}
    </Tap>
  );
}
export function CircleButton({ icon, onPress, label, light = false }: any) {
  // Every screen's back arrow is one of these, so dressing it in clay moves the whole
  // app's chrome over at once.
  const tone: ClayTone = light ? 'cream' : 'graphite';
  return (
    <Tap
      label={label}
      onPress={onPress}
      style={[
        clay(tone, 0.8),
        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
      ]}
    >
      <Icon name={icon} color={CLAY[tone].ink} size={21} />
    </Tap>
  );
}
export function Chip({ title, active, onPress, icon, glass }: any) {
  // A glass chip is the dock's surface at chip size: the page bends through its rim on
  // the web, and it is painted glass on a phone. The chosen chip stays solid white.
  if (glass && !active)
    return (
      <LiquidGlass radius={30} compact style={{ overflow: 'visible' }}>
        <Tap
          onPress={onPress}
          label={title}
          style={[
            S.chip,
            S.row,
            { gap: 7, backgroundColor: 'transparent', borderColor: 'transparent' },
          ]}
        >
          {icon && <Icon name={icon} size={15} color={C.gray} />}
          <T style={{ fontFamily: 'InterBold', fontSize: 12, lineHeight: 16, color: C.white }}>
            {title}
          </T>
        </Tap>
      </LiquidGlass>
    );
  const tone: ClayTone = active ? 'blue' : 'graphite';
  return (
    <Tap
      onPress={onPress}
      label={title}
      style={[
        S.chip,
        S.row,
        clay(tone, active ? 0.9 : 0.5),
        { gap: 7, borderWidth: 0 },
      ]}
    >
      {icon && <Icon name={icon} size={15} color={CLAY[tone].ink} />}
      <T
        style={{
          fontFamily: 'InterBold',
          fontSize: 12,
          lineHeight: 16,
          color: CLAY[tone].ink,
        }}
      >
        {title}
      </T>
    </Tap>
  );
}
export function Chips({ children, style }: any) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[{ gap: 8, paddingHorizontal: 24, paddingVertical: 4 }, style]}
    >
      {children}
    </ScrollView>
  );
}
export function Avatar({ url, name, size = 34, style }: any) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tint('#324350'),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderWidth: 2,
          borderColor: C.bg,
        },
        style,
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <T style={{ color: C.white, fontSize: size * 0.36, fontFamily: 'InterBold' }}>
          {name?.slice(0, 1) || 'P'}
        </T>
      )}
    </View>
  );
}
export function Avatars({ people = [], size = 30, light = false }: any) {
  return (
    <View style={{ flexDirection: 'row', paddingLeft: 5 }}>
      {people.slice(0, 4).map((p: any, i: number) => (
        <Avatar
          key={p.id || i}
          url={p.avatar_url}
          name={p.display_name}
          size={size}
          style={{ marginLeft: -5, borderColor: light ? C.white : C.bg }}
        />
      ))}
    </View>
  );
}
export const categoryIcon = (category: string) =>
  (
    ({
      running: 'walk-outline',
      hiking: 'trail-sign-outline',
      cycling: 'bicycle-outline',
      yoga: 'body-outline',
      padel: 'tennisball-outline',
      football: 'football-outline',
      basketball: 'basketball-outline',
      volleyball: 'basketball-outline',
      bootcamp: 'barbell-outline',
      wellness: 'leaf-outline',
      other: 'fitness-outline',
    }) as any
  )[category] || 'fitness-outline';
export function EventCard({ event: e, onPress, compact = false, wide = false }: any) {
  if (compact)
    return (
      <Tap
        onPress={onPress}
        label={e.title}
        style={[S.row, { gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.line }]}
      >
        <Image
          source={{ uri: e.cover_url }}
          style={{ height: 98, width: 90, borderRadius: 12, backgroundColor: C.panel }}
        />
        <View style={{ flex: 1, gap: 5 }}>
          <Label style={{ color: C.blue, fontSize: 9 }}>
            {dateLabel(e.starts_at, e.timezone).toUpperCase()} ·{' '}
            {timeLabel(e.starts_at, e.timezone)}
          </Label>
          <Heading style={{ fontSize: 24, lineHeight: 25 }}>{e.title.toUpperCase()}</Heading>
          <T style={{ fontSize: 11 }}>{e.community_name || e.location_name}</T>
          <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 12 }}>
            {e.price_minor === 0 ? 'Free' : money(e.price_minor, e.currency)}
          </T>
        </View>
        <Icon name="arrow-up-right" />
      </Tap>
    );
  return (
    <Tap
      onPress={onPress}
      label={e.title}
      style={{
        width: wide ? '100%' : 292,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: C.panel,
      }}
    >
      <View style={{ height: wide ? 300 : 252 }}>
        <Image source={{ uri: e.cover_url }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['#00000000', '#00000010', '#000000E8']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[S.between, { padding: 16 }]}>
          <View
            style={[
              S.row,
              {
                backgroundColor: '#F7F8FA',
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 6,
                gap: 5,
              },
            ]}
          >
            <Icon name={categoryIcon(e.category)} color="#101216" size={13} />
            <Label style={{ color: '#101216', fontSize: 9, letterSpacing: 1 }}>
              {e.category.toUpperCase()}
            </Label>
          </View>
          <View style={{ backgroundColor: '#0B0B0B90', borderRadius: 20, padding: 8 }}>
            <Icon name="arrow-up-right" size={17} color={C.onAccent} />
          </View>
        </View>
        <View style={{ position: 'absolute', bottom: 18, left: 18, right: 18 }}>
          <Label style={{ color: '#FFFFFFD0', fontSize: 9, marginBottom: 7 }}>
            {dateLabel(e.starts_at, e.timezone).toUpperCase()} ·{' '}
            {timeLabel(e.starts_at, e.timezone)}
          </Label>
          <Heading
            style={{
              fontSize: wide ? 40 : 32,
              lineHeight: wide ? 39 : 32,
              maxWidth: 270,
              color: C.onAccent,
            }}
          >
            {e.title.toUpperCase()}
          </Heading>
          <View style={[S.row, { gap: 5, marginTop: 9 }]}>
            <Icon name="location-outline" size={12} color="#CCCCD0" />
            <T numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, color: '#CCCCD0' }}>
              {e.location_name}
              {e.distance_km != null ? ` · ${Number(e.distance_km).toFixed(1)} km` : ''}
            </T>
          </View>
        </View>
      </View>
      <View style={[S.between, { padding: 16 }]}>
        <View style={[S.row, { gap: 8 }]}>
          <Avatars people={e.attendees} />
          <T style={{ fontSize: 11, color: C.gray }}>{e.attendee_count} going</T>
        </View>
        <T
          style={{
            fontSize: 16,
            color: e.price_minor === 0 ? C.green : C.white,
            fontFamily: 'InterBold',
          }}
        >
          {e.price_minor === 0 ? 'Free' : money(e.price_minor, e.currency)}
        </T>
      </View>
    </Tap>
  );
}
export function SectionTitle({ title, action, onPress, eyebrow }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      {eyebrow && <Label style={{ marginBottom: 7, color: C.blue }}>{eyebrow}</Label>}
      <View style={S.between}>
        <Heading style={{ fontSize: 30, lineHeight: 32 }}>{title}</Heading>
        {action && (
          <Tap onPress={onPress} style={[S.row, { gap: 6, minHeight: 40 }]}>
            <T style={{ fontSize: 11, color: C.gray }}>{action}</T>
            <Icon name="arrow-forward" size={15} color={C.gray} />
          </Tap>
        )}
      </View>
    </View>
  );
}
export function Page({ children, refresh, refreshing = false, style, pad = true }: any) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.page}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          refresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.blue} />
          ) : undefined
        }
        contentContainerStyle={[{ paddingBottom: 32 }, pad && S.pad, style]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Header({ title, onBack, right }: any) {
  return (
    <View
      style={[S.between, { paddingHorizontal: 24, paddingVertical: 14, backgroundColor: C.bg }]}
    >
      <View style={[S.row, { gap: 12 }]}>
        {onBack && <CircleButton icon="arrow-back" onPress={onBack} label="Go back" />}
        {typeof title === 'string' ? (
          <Heading style={{ fontSize: 26, lineHeight: 30 }}>{title}</Heading>
        ) : (
          title
        )}
      </View>
      {right}
    </View>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  secure = false,
  keyboardType = 'default',
  style,
}: any) {
  return (
    <View style={[{ marginBottom: 17 }, style]}>
      <Text style={S.inputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={String(value ?? '')}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={tint('#777D89')}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={secure || keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={!secure}
        multiline={multiline}
        style={[S.input, multiline && { minHeight: 110, textAlignVertical: 'top' }]}
      />
    </View>
  );
}
export function Toggle({ title, description, value, onChange }: any) {
  return (
    <View style={[S.between, { paddingVertical: 15, gap: 15 }]}>
      <View style={{ flex: 1 }}>
        <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13 }}>{title}</T>
        {description && <T style={{ fontSize: 11, lineHeight: 17, marginTop: 3 }}>{description}</T>}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.line, true: C.blue }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
export function Progress({ value, light = false }: any) {
  const progress = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) =>
      Animated.timing(progress, {
        toValue: Math.min(1, value),
        duration: reduced ? 0 : 650,
        useNativeDriver: false,
      }).start(),
    );
  }, [value]);
  return (
    <View
      style={{
        height: 6,
        borderRadius: 4,
        backgroundColor: light ? tint('#DCE2EA') : tint('#FFFFFF18'),
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          height: 6,
          borderRadius: 4,
          backgroundColor: C.blue,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}
export function Empty({
  title = 'ROOM FOR SOMETHING GOOD.',
  body = 'Nothing here just yet. Your next move is out there.',
  action,
  onPress,
}: any) {
  return (
    <View style={{ padding: 28, alignItems: 'center', gap: 16 }}>
      <Runner width={150} height={120} />
      <Heading style={{ textAlign: 'center', fontSize: 30 }}>{title}</Heading>
      <T style={{ textAlign: 'center', fontSize: 13 }}>{body}</T>
      {action && <Button title={action} onPress={onPress} />}
    </View>
  );
}
export function Loading() {
  return (
    <View accessibilityLabel="Loading activities" style={{ padding: 24, gap: 18 }}>
      <View style={{ width: 120, height: 18, borderRadius: 8, backgroundColor: C.panel2 }} />
      <View style={{ height: 260, borderRadius: 20, backgroundColor: C.panel }} />
      <ActivityIndicator color={C.blue} />
    </View>
  );
}
/** Shown where a screen needs the internet and has nothing saved from before. */
export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={{ padding: 28, alignItems: 'center', gap: 12 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: '#3A2A08',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="cloud-offline-outline" size={30} color="#FFD18B" />
      </View>
      <Heading style={{ textAlign: 'center', fontSize: 30 }}>YOU’RE OFFLINE.</Heading>
      <T style={{ textAlign: 'center', fontSize: 13 }}>
        This part of CRW+ needs the internet. It loads by itself when you’re back online. Recording
        workouts keeps working.
      </T>
      {onRetry && <Button title="Try again" variant="dark" icon="refresh" onPress={onRetry} />}
    </View>
  );
}
export function QueryState({ query, children }: any) {
  // Nothing saved and no connection: say so instead of spinning forever.
  if (query.isPending) return query.fetchStatus === 'paused' ? <OfflineState /> : <Loading />;
  if (query.error && !query.data && query.error.offline)
    return <OfflineState onRetry={query.refetch} />;
  if (query.error && !query.data)
    return (
      <Empty
        title="LET’S RECONNECT."
        body={t(errorKey(query.error))}
        action="Try again"
        onPress={query.refetch}
      />
    );
  return children;
}
export function Runner({ width = 160, height = 140, light = false, ink }: any) {
  const illustration = runningIllustration
    .replaceAll('rgb(255,247,229)', ink ?? (light ? C.black : C.white))
    .replaceAll('rgb(0,170,245)', C.blue);
  return (
    <SvgXml
      xml={illustration}
      width={width}
      height={height}
      accessible={false}
    />
  );
}
