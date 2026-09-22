import React from 'react';
import { View } from 'react-native';
import { C, Label, S } from '../ui';
import Logo, { LOGO_HEIGHT } from './Logo';

/** Shared tab branding, matching the Food page's logo, divider and label. */
export default function PageBrand({ title }: { title: string }) {
  return (
    <View style={[S.row, { gap: 11, flexShrink: 0 }]}>
      <Logo height={LOGO_HEIGHT} />
      <View style={{ height: 22, width: 1, backgroundColor: C.line }} />
      <Label style={{ color: C.green, fontSize: 12, letterSpacing: 2 }}>{title}</Label>
    </View>
  );
}
