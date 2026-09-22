import React from 'react';
import { RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { tint } from '../theme';
import { C, Heading, Icon, S, T, Tap, Toggle } from '../ui';
import { CLAY, ClayIconButton, Slab, Well, clay, type ClayTone } from './clay';

// The page furniture a clay screen shares: the shell, the header, the section headings
// and the rows. Written because the alarm screens had already grown three hand-made
// copies of the same ScrollView and back button between them; Profile, Settings, Auth
// and the pickers are built on this instead. The alarm screens still carry their own
// copies and are worth moving over next time they are opened.
//
// Nothing here decides anything - it is all presentation, so a screen can move onto clay
// without its logic being touched.

/** The standard content column: 20pt gutters, capped at 480 and centred on a tablet. */
export const CLAY_PAGE = {
  paddingHorizontal: 20,
  paddingTop: 16,
  paddingBottom: 44,
  width: '100%' as const,
  maxWidth: 480,
  alignSelf: 'center' as const,
};

export function ClayScreen({
  title,
  eyebrow,
  onBack,
  actions,
  children,
  refresh,
  refreshing = false,
  padBottom,
}: {
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  /** Buttons for the top-right corner, usually ClayIconButtons. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  refresh?: () => void;
  refreshing?: boolean;
  padBottom?: number;
}) {
  return (
    <View style={S.page}>
      <ScrollView
        contentContainerStyle={[CLAY_PAGE, padBottom !== undefined && { paddingBottom: padBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          refresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.blue} />
          ) : undefined
        }
      >
        {(!!onBack || !!actions) && (
          <View style={[S.between, { alignItems: 'center', gap: 12 }]}>
            {onBack ? (
              <ClayIconButton icon="arrow-back" label="Go back" onPress={onBack} />
            ) : (
              <View />
            )}
            {!!actions && <View style={[S.row, { gap: 10 }]}>{actions}</View>}
          </View>
        )}
        {!!eyebrow && (
          <T
            style={{
              fontFamily: 'InterBold',
              fontSize: 10,
              letterSpacing: 1.4,
              color: C.blue,
              marginTop: 14,
            }}
          >
            {eyebrow}
          </T>
        )}
        {!!title && (
          <Heading style={{ fontSize: 46, lineHeight: 50, marginTop: eyebrow ? 6 : 12 }}>
            {title}
          </Heading>
        )}
        {children}
      </ScrollView>
    </View>
  );
}

/** A heading at the size and weight the Tracking sections use. */
export function ClaySection({
  title,
  detail,
  style,
}: {
  title: string;
  detail?: string;
  style?: any;
}) {
  return (
    <View
      style={[
        S.between,
        { alignItems: 'flex-end', gap: 8, marginTop: 28, marginBottom: 12 },
        style,
      ]}
    >
      <T style={{ fontFamily: 'Display', fontSize: 27, lineHeight: 30, color: C.white }}>
        {title}
      </T>
      {!!detail && (
        <T style={{ fontSize: 11, lineHeight: 17, color: C.gray, flexShrink: 1 }}>{detail}</T>
      )}
    </View>
  );
}

/** A slab you press: an icon bubble, a title, an optional line under it, a chevron. */
export function ClayRow({
  icon,
  title,
  description,
  onPress,
  tone = 'graphite',
  value,
  trailingIcon = 'chevron-forward',
  disabled = false,
}: {
  icon?: string;
  title: string;
  description?: string;
  onPress?: () => void;
  tone?: ClayTone;
  /** Shown on the right instead of a chevron, for a setting that carries a value. */
  value?: string;
  trailingIcon?: string | null;
  disabled?: boolean;
}) {
  const ink = CLAY[tone].ink;
  return (
    <Tap
      label={title}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[
        clay(tone, 0.85),
        {
          borderRadius: 20,
          padding: 15,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 13,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      {!!icon && (
        <View
          style={[
            clay(tone === 'graphite' ? 'blue' : 'graphite', 0.7),
            {
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <Icon
            name={icon}
            size={18}
            color={CLAY[tone === 'graphite' ? 'blue' : 'graphite'].ink}
          />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={{ fontFamily: 'InterBold', fontSize: 14, lineHeight: 19, color: ink }}>
          {title}
        </T>
        {!!description && (
          <T style={{ fontSize: 11, lineHeight: 16, color: ink, opacity: 0.7, marginTop: 2 }}>
            {description}
          </T>
        )}
      </View>
      {!!value && (
        <T numberOfLines={1} style={{ fontSize: 13, color: ink, opacity: 0.8, maxWidth: 130 }}>
          {value}
        </T>
      )}
      {!!trailingIcon && !!onPress && <Icon name={trailingIcon} size={17} color={ink} />}
    </Tap>
  );
}

/** A switch on its own slab, so a settings list reads as one material. */
export function ClayToggle({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Slab radius={20} depth={0.85} style={{ paddingHorizontal: 15, paddingVertical: 2 }}>
      <Toggle title={title} description={description} value={value} onChange={onChange} />
    </Slab>
  );
}

/** Text you type into is pressed into the page, not raised off it. */
export function ClayField({
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
    <View style={[{ marginBottom: 14 }, style]}>
      {!!label && <Text style={S.inputLabel}>{label}</Text>}
      <Well radius={18}>
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
          style={{
            color: C.white,
            fontFamily: 'Inter',
            fontSize: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            minHeight: multiline ? 110 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </Well>
    </View>
  );
}

/** A group of rows with one heading, the shape most of Settings takes. */
export function ClayGroup({
  title,
  detail,
  children,
}: {
  title?: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {!!title && <ClaySection title={title} detail={detail} />}
      <View style={{ gap: 8 }}>{children}</View>
    </>
  );
}

/** A compact clay chip: appearance, interests, anything chosen from a short list. */
export function ClayChoice({
  label,
  active,
  onPress,
  icon,
  style,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: string;
  style?: any;
}) {
  const tone: ClayTone = active ? 'blue' : 'graphite';
  return (
    <Tap
      label={label}
      onPress={onPress}
      style={[
        clay(tone, active ? 1 : 0.6),
        {
          borderRadius: 16,
          paddingVertical: 10,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
        },
        style,
      ]}
    >
      {!!icon && <Icon name={icon} size={15} color={CLAY[tone].ink} />}
      <T style={{ fontFamily: 'InterBold', fontSize: 12, lineHeight: 16, color: CLAY[tone].ink }}>
        {label}
      </T>
    </Tap>
  );
}
