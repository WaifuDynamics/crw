import { tint, themed } from '../theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { C, Heading, T, Tap } from '../ui';

export function PeoplePanel({
  signedIn,
  friends,
  onPress,
}: {
  signedIn: boolean;
  friends: number;
  onPress: () => void;
}) {
  const action = signedIn ? 'See their activities' : 'Sign in to see activities';
  return (
    <Tap label={action} onPress={onPress} style={[styles.card, styles.people]}>
      <View style={styles.copy}>
        <Heading style={styles.peopleTitle}>SEE WHO’S GOING.</Heading>
        <T style={[styles.body, styles.peopleBody]}>
          {signedIn && friends > 0
            ? `${friends} ${friends === 1 ? 'person you follow is' : 'people you follow are'} joining activities today.`
            : signedIn
              ? 'See upcoming activities joined by people you follow.'
              : 'Sign in to find activities that people you follow are joining.'}
        </T>
        <T style={styles.peopleAction}>{action}</T>
      </View>
    </Tap>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      backgroundColor: tint('#17191D'),
      borderWidth: 1,
      borderColor: tint('#2B2E34'),
      borderRadius: 12,
      padding: 14,
    },
    people: { backgroundColor: C.white, borderColor: C.white },
    copy: { flex: 1, minWidth: 0 },
    peopleTitle: { color: C.black, fontSize: 21, lineHeight: 24, letterSpacing: 0 },
    peopleBody: { color: tint('#646974') },
    peopleAction: {
      color: C.black,
      fontFamily: 'InterBold',
      fontSize: 11,
      lineHeight: 18,
      textDecorationLine: 'underline',
      marginTop: 9,
    },
    body: { color: tint('#A5A8B0'), fontSize: 11, lineHeight: 16, marginTop: 3 },
  }),
);
