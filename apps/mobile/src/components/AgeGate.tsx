import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, Heading, Icon, Label, S, T } from '../ui';
import { entry, EntryButton as Button, EntryPage as Page, EntryHeader } from './Entry';
import { tint } from '../theme';

// The age question, asked once on this device before anybody signs in or signs up.
//
// CRW+ is for people aged 13 and over, and the Terms and the Privacy Policy say so. The
// full confirmation - the terms, the guidelines, the marketing choice - comes after
// signing in, on the consent screen; this is only the door.

const KEY = 'crw.age.v1';

export function useAgeConfirmed() {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setConfirmed(v === 'yes'))
      .catch(() => setConfirmed(true));
  }, []);
  const confirm = async () => {
    setConfirmed(true);
    await AsyncStorage.setItem(KEY, 'yes').catch(() => {});
  };
  return { confirmed, confirm };
}

export default function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  const [tooYoung, setTooYoung] = useState(false);

  if (tooYoung)
    return (
      <Page>
      <EntryHeader />
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <View style={st.badge}>
            <Icon name="time-outline" size={38} color={C.blue} />
          </View>
          <Heading style={[entry.title, { marginTop: 22 }]}>COME BACK{'\n'}IN A FEW YEARS.</Heading>
          <T style={{ fontSize: 13, lineHeight: 20, marginTop: 14 }}>
            CRW+ is built for people aged 13 and over, so we cannot let you create an account yet.
            Thanks for stopping by - keep moving anyway.
          </T>
          <Button
            title="Back"
            variant="outline"
            onPress={() => setTooYoung(false)}
            style={{ marginTop: 28 }}
          />
        </View>
      </Page>
    );

  return (
    <Page>
      <EntryHeader />
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 40 }}>
        <View style={st.badge}>
          <Icon name="shield-checkmark-outline" size={38} color={C.blue} />
        </View>
        <Label style={{ color: C.blue, marginTop: 24 }}>BEFORE WE START</Label>
        <Heading style={[entry.title, { marginTop: 10 }]}>ARE YOU 13{'\n'}OR OLDER?</Heading>
        <T style={{ fontSize: 13, lineHeight: 20, marginTop: 14 }}>
          CRW+ records workouts, routes and health data, so it is only for people aged 13 and over.
          If the law where you live asks for a higher age, or for a parent&apos;s consent, that
          applies too.
        </T>
        <View style={[S.row, { gap: 10, marginTop: 30 }]}>
          <Button
            title="No"
            variant="outline"
            onPress={() => setTooYoung(true)}
            style={{ flex: 1, minHeight: 54 }}
          />
          <Button
            title="Yes, I am 13 or older"
            onPress={onConfirm}
            style={{ flex: 2, minHeight: 54 }}
          />
        </View>
        <T style={{ fontSize: 10, lineHeight: 16, marginTop: 18 }}>
          You will confirm the Terms, the Community Guidelines and the Privacy Policy right after
          signing in.
        </T>
      </View>
    </Page>
  );
}

const st = {
  badge: {
    width: 86,
    height: 86,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: tint('#0C2949'),
  },
};
