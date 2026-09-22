import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';
import { C, Icon, S, T, Tap } from '../ui';
import { CLAY, clay, type ClayTone } from './clay';

// The one place the app speaks to the user in passing: a clay slab that rises over the
// dock, says one short line and leaves. Dressed like the Tracking page - a puffy slab
// with a contrasting icon bubble - so a message never looks like it came from a
// different app.

export type NoticeKind = 'info' | 'success' | 'error';

export type Notice = { text: string; kind: NoticeKind };

const LOOK: Record<NoticeKind, { tone: ClayTone; bubble: ClayTone; icon: string }> = {
  info: { tone: 'graphite', bubble: 'blue', icon: 'information' },
  success: { tone: 'lime', bubble: 'navy', icon: 'checkmark' },
  error: { tone: 'ember', bubble: 'cream', icon: 'alert' },
};

export default function Toast({
  notice,
  onDismiss,
}: {
  notice: Notice | null;
  onDismiss: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Notice | null>(notice);
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (notice) {
      // Keep the old text on screen until the new one has taken its place, so swapping
      // two messages does not flash an empty slab.
      setShown(notice);
      Animated.timing(enter, {
        toValue: 1,
        duration: reduced ? 0 : 260,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
      return;
    }
    Animated.timing(enter, {
      toValue: 0,
      duration: reduced ? 0 : 180,
      easing: Easing.in(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => finished && setShown(null));
  }, [notice, reduced, enter]);

  if (!shown) return null;

  const look = LOOK[shown.kind];
  const ink = CLAY[look.tone].ink;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: 95,
        left: 18,
        right: 18,
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
        ],
      }}
    >
      <Tap
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        label={shown.text}
        onPress={onDismiss}
        style={[
          clay(look.tone),
          {
            borderRadius: 24,
            paddingVertical: 14,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            maxWidth: 480,
            alignSelf: 'center',
          },
        ]}
      >
        <View
          style={[
            clay(look.bubble, 0.7),
            { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          <Icon name={look.icon} size={17} color={CLAY[look.bubble].ink} />
        </View>
        <T
          numberOfLines={3}
          style={{ flex: 1, fontFamily: 'InterSemi', fontSize: 13, lineHeight: 19, color: ink }}
        >
          {shown.text}
        </T>
        <Icon name="close" size={16} color={ink} />
      </Tap>
    </Animated.View>
  );
}
