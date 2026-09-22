import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useData, useSession } from '../api';
import { tint } from '../theme';
import { Avatar, C, Icon, T, Tap } from '../ui';

/**
 * The profile shortcut in the top-right corner of every tab. Shows your photo; the
 * corner badge counts unread notifications (they live on the profile page) or, when
 * there are none, is a small arrow. Signed out, it opens the guest profile (sign-in).
 */
export default function ProfileButton({
  navigation,
  size = 44,
}: {
  navigation: any;
  size?: number;
}) {
  const { user } = useSession();
  const notifications = useData<any[]>('/notifications', !!user);
  const unread = user ? (notifications.data || []).filter((n) => !n.read_at).length : 0;
  const radius = Math.round(size / 3);
  return (
    <Tap
      label={
        !user
          ? 'Sign in'
          : unread
            ? `Your profile, ${unread} unread ${unread === 1 ? 'notification' : 'notifications'}`
            : 'Your profile'
      }
      onPress={() => navigation.navigate('Profile')}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        borderWidth: 1,
        borderColor: tint('#315A85'),
        backgroundColor: tint('#101D2D'),
      }}
    >
      <LinearGradient
        colors={[tint('#23466C'), tint('#101A29')]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flex: 1,
          borderRadius: radius - 1,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {user?.avatar_url ? (
          <Avatar url={user.avatar_url} name={user.display_name} size={Math.round(size * 0.68)} />
        ) : (
          <Icon name="person" size={Math.round(size * 0.48)} color={tint('#DDEEFF')} />
        )}
      </LinearGradient>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -5,
          bottom: -5,
          minWidth: 20,
          height: 20,
          paddingHorizontal: unread ? 4 : 0,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: C.bg,
          backgroundColor: unread ? '#FF5A5F' : C.blue,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {unread ? (
          <T style={{ color: '#FFFFFF', fontSize: 9, lineHeight: 12, fontFamily: 'InterBold' }}>
            {unread > 9 ? '9+' : unread}
          </T>
        ) : (
          <Icon name="arrow-up-right" size={11} color={C.onAccent} />
        )}
      </View>
    </Tap>
  );
}
