import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useOnline } from '../network';
import { invalidate } from '../api';
import { Icon, T } from '../ui';

// The strip at the top of the app while there is no connection. It says plainly what
// still works and what waits for the internet; tap it for the details. When the
// connection comes back it says so for a moment and refreshes the screens.

const WORKS = [
  'Recording workouts, your history and routes',
  'Your profile and the last loaded screens',
  'Light / dark mode and language',
];
const WAITS = [
  'Events, bookings and tickets',
  'Camera games (push-ups, squats, matches)',
  'Leaderboards, friends and notifications',
  'Syncing workouts with your account (it catches up later)',
];

export default function OfflineBanner() {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [back, setBack] = useState(false);
  const was = useRef(online);

  useEffect(() => {
    if (online && !was.current) {
      setBack(true);
      setOpen(false);
      void invalidate();
      const t = setTimeout(() => setBack(false), 3000);
      was.current = online;
      return () => clearTimeout(t);
    }
    was.current = online;
  }, [online]);

  if (online && !back) return null;
  if (back)
    return (
      <View
        accessibilityRole="alert"
        style={{ backgroundColor: '#1F7A3A', paddingVertical: 7, paddingHorizontal: 16 }}
      >
        <T style={{ color: '#FFFFFF', fontFamily: 'InterBold', fontSize: 12, textAlign: 'center' }}>
          Back online · syncing
        </T>
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Offline mode. Tap for what works without internet."
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen(!open)}
      style={{ backgroundColor: '#3A2A08', paddingVertical: 8, paddingHorizontal: 16 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="cloud-offline" size={16} color="#FFD18B" />
        <T style={{ flex: 1, color: '#FFE3B8', fontFamily: 'InterBold', fontSize: 12 }}>
          Offline mode · some features are paused
        </T>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color="#FFD18B" />
      </View>
      {open && (
        <View style={{ marginTop: 8, gap: 3 }}>
          <T style={{ color: '#A9F06A', fontFamily: 'InterBold', fontSize: 10, letterSpacing: 1 }}>
            WORKS OFFLINE
          </T>
          {WORKS.map((w) => (
            <T key={w} style={{ color: '#F7F8FA', fontSize: 12, lineHeight: 17 }}>
              ✓ {w}
            </T>
          ))}
          <T
            style={{
              color: '#FFD18B',
              fontFamily: 'InterBold',
              fontSize: 10,
              letterSpacing: 1,
              marginTop: 6,
            }}
          >
            NEEDS INTERNET
          </T>
          {WAITS.map((w) => (
            <T key={w} style={{ color: '#F7F8FA', fontSize: 12, lineHeight: 17 }}>
              ✕ {w}
            </T>
          ))}
        </View>
      )}
    </Pressable>
  );
}
