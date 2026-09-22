import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { C, themed, tint } from '../theme';
import { Icon, Label, T, Tap } from '../ui';
import Logo from './Logo';

/** Shared visual language for the front door and account setup. */
export const entry = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 26, paddingTop: 22, paddingBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36, marginBottom: 8 },
  eyebrow: { color: C.blue, fontSize: 11, letterSpacing: 1.8, marginTop: 26, marginBottom: 10 },
  title: { fontFamily: 'DisplayItalic', fontSize: 52, lineHeight: 53, letterSpacing: -0.6, color: C.white },
  body: { fontSize: 14, lineHeight: 21, color: C.gray },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 20 },
  section: { fontSize: 10, letterSpacing: 1.7, marginTop: 22, marginBottom: 10 },
  panel: { backgroundColor: tint('#121518'), borderWidth: 1, borderColor: tint('#2D333B'), borderRadius: 12, padding: 18 },
  input: { backgroundColor: tint('#121518'), borderWidth: 1, borderColor: tint('#2D333B'), borderRadius: 11, minHeight: 52, paddingHorizontal: 17, paddingVertical: 14, fontFamily: 'Inter', fontSize: 14, color: C.white },
  footer: { marginTop: 'auto', paddingTop: 26, gap: 12 },
}));

export function EntryPage({ children }: { children: React.ReactNode }) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={entry.page}>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={entry.content}>{children}</ScrollView>
  </KeyboardAvoidingView>;
}

export function EntryHeader({ step, onBack }: { step?: number; onBack?: () => void }) {
  return <View style={[entry.header, !step && { marginBottom: 0 }]}>
    <Logo height={29} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack && <Tap label="Previous question" onPress={onBack} style={{ padding: 10 }}><Icon name="arrow-back" size={20} color={C.gray} /></Tap>}
      {step ? <Label style={{ fontSize: 10, letterSpacing: 1.6 }}>STEP {step} OF 6</Label> : <Icon name="shield-outline" color={C.blue} size={25} />}
    </View>
  </View>;
}

export function EntryButton({ title, onPress, disabled, loading, icon, variant, style }: any) {
  const secondary = variant === 'outline' || variant === 'dark';
  return <Tap label={title} onPress={onPress} disabled={disabled || loading} accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }} style={[{
    minHeight: 52, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', gap: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: secondary ? C.line : C.blue, backgroundColor: secondary ? 'transparent' : C.blue,
    opacity: disabled ? 0.45 : 1,
  }, style]}>
    {loading ? <ActivityIndicator color={secondary ? C.white : '#FFFFFF'} /> : <>
      <T style={{ fontFamily: 'InterBold', fontSize: 14, color: secondary ? C.white : '#FFFFFF', textAlign: 'center' }}>{title}</T>
      {icon && <Icon name={icon} size={23} color={secondary ? C.white : '#FFFFFF'} />}
    </>}
  </Tap>;
}

export function EntryField({ label, value, onChange, placeholder, secure, keyboardType }: any) {
  return <View style={{ marginBottom: 18 }}>
    <Label style={{ marginBottom: 9 }}>{label}</Label>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.gray}
      secureTextEntry={secure} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' || secure ? 'none' : 'words'} autoCorrect={!secure && keyboardType !== 'email-address'} style={entry.input} />
  </View>;
}

export function EntryToggle({ title, description, value, onChange }: any) {
  return <View style={[entry.panel, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
    <View style={{ flex: 1 }}><T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 14 }}>{title}</T><T style={{ fontSize: 12, lineHeight: 18, marginTop: 4 }}>{description}</T></View>
    <Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ false: C.line, true: C.blue }} thumbColor="#F7F8FA" />
  </View>;
}
