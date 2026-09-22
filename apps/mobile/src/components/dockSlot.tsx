import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import BottomBar from './BottomBar';

// The dock is the tab navigator's own tab bar, so it appears only on the tab screens.
//
// It used to be hoisted to the root of the app (drawn over everything) so the Android
// liquid-glass shader could refract the screens beneath it. Android no longer has liquid
// glass, so the dock goes back where it belongs: inside the navigator. That keeps it off
// the pushed screens (Settings, Legal, Admin) and off onboarding and the permission walk,
// where it must not appear.

export function DockSlot(props: BottomTabBarProps) {
  return <BottomBar {...props} />;
}
