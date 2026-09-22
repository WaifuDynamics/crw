import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, Platform, ActivityIndicator, Text, AccessibilityInfo } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  NavigationState,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_700Bold_Italic } from '@expo-google-fonts/barlow-condensed/700Bold_Italic';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, queryPersister, SessionProvider, useSession, useData, post } from './src/api';
import OfflineBanner from './src/components/OfflineBanner';
import { ConsentScreen, LegalScreen } from './src/screens/Legal';
import { LEGAL_VERSION } from './src/legal/documents';
import { C, Button } from './src/ui';
import { isLight, loadTheme, useTheme } from './src/theme';
import { loadLanguage, t, useTranslation } from './src/translations';
import { registerForPush, setupNotifications, watchPushToken } from './src/push';
import { WORKOUT_ACTIONS } from './src/tracking/workoutNotification';
import BottomBar from './src/components/BottomBar';
import Discover from './src/screens/Discover';
import Food, { FoodStoreScreen } from './src/screens/Food';
import Compete from './src/screens/Compete';
import Tracking from './src/screens/Tracking';
import { MOBILE_WEB_WIDTH } from './src/layout';
import Profile from './src/screens/Profile';
import { AuthScreen } from './src/screens/Auth';
import { SettingsScreen } from './src/screens/Settings';
import { EventScreen, BookingScreen, BookingsScreen } from './src/screens/Event';
import {
  SearchScreen,
  CommunityScreen,
  CommunitiesScreen,
  NotificationsScreen,
  ReportScreen,
} from './src/screens/Social';
import {
  ApplyScreen,
  OrganizerScreen,
  EventEditorScreen,
  ManageEventScreen,
  ScannerScreen,
} from './src/screens/Organizer';
import Admin from './src/screens/Admin';
import { PushupsScreen, SquatsScreen } from './src/screens/Reps';
import Alarms from './src/screens/Alarms';
import AlarmRing from './src/screens/AlarmRing';
import { useFiringAlarm } from './src/alarms/useFiringAlarm';
import Toast from './src/components/Toast';
import { errorKey } from './src/errors';
import Friends from './src/screens/Friends';
import Onboarding from './src/screens/Onboarding';
import PermissionsScreen, { permissionsAsked } from './src/screens/Permissions';
import { DockSlot } from './src/components/dockSlot';
import { GlassSourceProvider } from './src/components/glassSource';
import { AppStatusScreen, useAppStatus } from './src/components/AppStatus';
import CommunityEditor from './src/screens/CommunityEditor';
const Stack = createNativeStackNavigator(),
  Tab = createBottomTabNavigator();
const nav = createNavigationContainerRef<any>();
// Kept across the remount that applies a theme change, so the user stays on the same screen.
let savedNavState: NavigationState | undefined;
// Once per app launch, not once per remount.
let initialUrlHandled = false;
let onboardingAsked = false;
let permissionsShown = false;
let lastResponseHandled = '';
const tabNames = ['Discover', 'Food', 'Compete', 'Tracking'];
function wrap(Component: any) {
  return function Screen(props: any) {
    const navigation = new Proxy(props.navigation, {
      get(target, key) {
        if (key === 'navigate')
          return (name: string, params?: any) =>
            tabNames.includes(name)
              ? target.navigate('Home', { screen: name, params })
              : target.navigate(name, params);
        return target[key];
      },
    });
    return <Component {...props} navigation={navigation} />;
  };
}
const WrappedDiscover = wrap(Discover),
  WrappedFood = wrap(Food),
  WrappedCompete = wrap(Compete),
  WrappedTracking = wrap(Tracking);
const screens: any = {
  Profile: wrap(Profile),
  FoodStore: wrap(FoodStoreScreen),
  CommunityEditor: wrap(CommunityEditor),
  Event: wrap(EventScreen),
  Booking: wrap(BookingScreen),
  Bookings: wrap(BookingsScreen),
  Auth: wrap(AuthScreen),
  Settings: wrap(SettingsScreen),
  Search: wrap(SearchScreen),
  Community: wrap(CommunityScreen),
  Communities: wrap(CommunitiesScreen),
  Notifications: wrap(NotificationsScreen),
  Report: wrap(ReportScreen),
  Apply: wrap(ApplyScreen),
  Organizer: wrap(OrganizerScreen),
  EventEditor: wrap(EventEditorScreen),
  ManageEvent: wrap(ManageEventScreen),
  Scanner: wrap(ScannerScreen),
  Admin: wrap(Admin),
  Person: wrap(Profile),
  Friends: wrap(Friends),
  Onboarding: wrap(Onboarding),
  Permissions: wrap(PermissionsScreen),
  Pushups: wrap(PushupsScreen),
  Squats: wrap(SquatsScreen),
  Legal: wrap(LegalScreen),
  Alarms: wrap(Alarms),
};
function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <DockSlot {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: C.bg },
        // A quick cross-fade reads as smooth without the cost of sliding heavy screens,
        // and freezing blurred tabs stops them re-rendering in the background.
        animation: 'fade',
        freezeOnBlur: true,
      }}
    >
      <Tab.Screen name="Discover" component={WrappedDiscover} />
      <Tab.Screen name="Food" component={WrappedFood} />
      <Tab.Screen name="Compete" component={WrappedCompete} />
      <Tab.Screen name="Tracking" component={WrappedTracking} />
    </Tab.Navigator>
  );
}
function Shell() {
  const { notice, say, dismissNotice, refresh, user, loading, cached } = useSession();
  // Signed in but the current Terms and Privacy Policy are not accepted yet. An account
  // loaded from the device while offline is let through: accepting needs the server.
  const needsConsent = !!user?.account && user.account.legal_version !== LEGAL_VERSION && !cached;
  const [ready, setReady] = useState(false),
    [reduced, setReduced] = useState(true);
  const health = useData('/health');
  // Too old an app, or maintenance: one clear screen instead of the app (see AppStatus).
  const status = useAppStatus();
  // Pushes: channels on launch, and this phone's token for whoever is signed in.
  const signedIn = React.useRef(false);
  signedIn.current = !!user;
  useEffect(() => {
    void setupNotifications().catch(() => {});
    return watchPushToken(() => signedIn.current);
  }, []);
  useEffect(() => {
    if (user?.id) void registerForPush(false).catch(() => {});
  }, [user?.id]);
  // Someone already signed in (e.g. from before the questions existed) is asked once per
  // session. Right after signing in, the sign-in screen routes there itself.
  useEffect(() => {
    if (
      !ready ||
      !user?.account ||
      needsConsent ||
      onboardingAsked ||
      user.account.onboarding_completed_at
    )
      return;
    const current = nav.getCurrentRoute()?.name;
    if (current === 'Auth' || current === 'Onboarding') return;
    onboardingAsked = true;
    nav.navigate('Onboarding');
  }, [ready, user, needsConsent]);
  // Once the questions are answered, the phone's permissions are walked through once per
  // account, with what each one is for. The browser has no such permissions to ask for.
  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !ready ||
      !user?.id ||
      !user?.account?.onboarding_completed_at ||
      needsConsent ||
      permissionsShown
    )
      return;
    let cancelled = false;
    void permissionsAsked(String(user.id)).then((asked) => {
      if (cancelled || asked || permissionsShown) return;
      const current = nav.getCurrentRoute()?.name;
      if (current === 'Auth' || current === 'Onboarding' || current === 'Permissions') return;
      permissionsShown = true;
      nav.navigate('Permissions');
    });
    return () => {
      cancelled = true;
    };
  }, [ready, user, needsConsent]);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!ready) return;
    // On the web the url listener re-announces the page address (for example when the
    // rep counter frame loads), which would push /play again on top of the counter.
    let lastUrl = '';
    const handle = async (url: string) => {
      if (url === lastUrl) return;
      lastUrl = url;
      try {
        const parsed = Linking.parse(url),
          q = parsed.queryParams || {};
        if (q.verify) {
          await post('/auth/verify', { token: String(q.verify) });
          await refresh();
          say(t('errors.emailVerified'), 'success');
        } else if (q.reset) nav.navigate('Auth', { reset: String(q.reset) });
        else if (q.booking) nav.navigate('Booking', { id: String(q.booking) });
        else if (q.event) nav.navigate('Event', { id: String(q.event) });
        else {
          const parts = [parsed.hostname, parsed.path].filter(Boolean).join('/').split('/');
          // /pushups and /squats open the rep counter; nothing links to them yet.
          const reps = parts.find((p) => ['play', 'pushups', 'squats'].includes(p.toLowerCase()));
          if (reps?.toLowerCase() === 'play') nav.navigate('Home', { screen: 'Compete' });
          else if (reps)
            nav.navigate(({ squats: 'Squats', pushups: 'Pushups' } as any)[reps.toLowerCase()]);
          // Linked from email footers ("Email settings"). The session may still be loading
          // here, so open the profile, which leads to settings or to sign-in.
          else if (parts.includes('settings')) nav.navigate('Profile');
          // Friend request notifications.
          else if (parts.includes('friends')) nav.navigate('Friends');
          else if (parts.includes('tracking'))
            nav.navigate('Home', { screen: 'Tracking', params: { action: q.action } });
          else if (parts.includes('compete')) nav.navigate('Home', { screen: 'Compete' });
          else if (parts.includes('bookings')) nav.navigate('Bookings');
          else if (parts.includes('notifications')) nav.navigate('Notifications');
          else {
            const at = parts.findIndex((p) => ['event', 'booking', 'profile'].includes(p));
            if (at >= 0 && parts[at + 1])
              nav.navigate(
                ({ event: 'Event', booking: 'Booking', profile: 'Person' } as any)[parts[at]],
                { id: parts[at + 1] },
              );
          }
        }
      } catch (e: any) {
        // A bad or expired link: our own line, never the server's.
        say(t(errorKey(e)), 'error');
      }
    };
    if (!initialUrlHandled) {
      initialUrlHandled = true;
      Linking.getInitialURL().then((url) => {
        if (url) void handle(url);
      });
    }
    const sub = Linking.addEventListener('url', ({ url }) => void handle(url));
    let push: any;
    // A tap on a notification, or on one of the workout buttons (Pause, Resume, Finish).
    const respond = (response: Notifications.NotificationResponse) => {
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}:${response.notification.date}`;
      if (key === lastResponseHandled) return;
      lastResponseHandled = key;
      const link = response.notification.request.content.data?.link;
      const action = Object.entries(WORKOUT_ACTIONS).find(
        ([, id]) => id === response.actionIdentifier,
      )?.[0];
      lastUrl = '';
      if (action) void handle(`crw://tracking?action=${action}&at=${Date.now()}`);
      else if (typeof link === 'string') void handle(`crw://${link}`);
    };
    if (Platform.OS !== 'web') {
      push = Notifications.addNotificationResponseReceivedListener(respond);
      // The app was started from a notification.
      void Notifications.getLastNotificationResponseAsync().then((r) => {
        if (r) respond(r);
      });
    }
    return () => {
      sub.remove();
      push?.remove();
    };
  }, [ready]);
  // An alarm that is ringing takes the whole screen, above everything else.
  const firingAlarm = useFiringAlarm();

  // Until we know whether someone is signed in (from the device or the server).
  if (loading)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={C.blue} />
      </View>
    );
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: C.bg }}>
      <OfflineBanner />
      {health.data?.environment === 'development' && (
        <View style={{ backgroundColor: C.panel2, paddingVertical: 4, alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Inter', fontSize: 8, letterSpacing: 1.1, color: C.gray }}>
            DEVELOPMENT ENVIRONMENT · SANDBOX PAYMENTS
          </Text>
        </View>
      )}
      {status.state !== 'ok' ? (
        <AppStatusScreen status={status} />
      ) : (
        <GlassSourceProvider>
          <NavigationContainer
            ref={nav}
            initialState={user ? savedNavState : undefined}
            onStateChange={(state) => {
              savedNavState = state;
            }}
            onReady={() => setReady(true)}
            theme={{
              ...(isLight() ? DefaultTheme : DarkTheme),
              colors: {
                ...(isLight() ? DefaultTheme : DarkTheme).colors,
                background: C.bg,
                card: C.bg,
                primary: C.blue,
                text: C.white,
                border: C.line,
              },
            }}
          >
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: C.bg },
                animation: reduced ? 'none' : 'slide_from_right',
              }}
            >
              {user && needsConsent ? (
                <>
                  <Stack.Screen name="Consent" component={ConsentScreen} />
                  <Stack.Screen name="Legal" component={LegalScreen} />
                </>
              ) : user ? (
                <>
                  <Stack.Screen name="Home" component={Tabs} />
                  {Object.entries(screens).map(([name, component]) => (
                    <Stack.Screen key={name} name={name} component={component as any} />
                  ))}
                </>
              ) : (
                // An account is required: signed out, the app is only the sign-in screen.
                <>
                  <Stack.Screen
                    name="Welcome"
                    component={screens.Auth}
                    initialParams={{ gate: true }}
                  />
                  <Stack.Screen name="Legal" component={LegalScreen} />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </GlassSourceProvider>
      )}
      {!!firingAlarm.alarm && (
        <AlarmRing alarm={firingAlarm.alarm} onDismiss={firingAlarm.dismiss} />
      )}
      <Toast notice={notice} onDismiss={dismissNotice} />
    </SafeAreaView>
  );
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <View style={{ flex: 1, justifyContent: 'center', padding: 30, backgroundColor: C.bg }}>
          <Text style={{ color: C.white, fontSize: 28, fontWeight: 'bold' }}>
            Let’s catch our breath.
          </Text>
          <Text style={{ color: C.gray, marginVertical: 20 }}>
            Something unexpected happened. Restart this view to reconnect.
          </Text>
          <Button title="Try again" onPress={() => this.setState({ failed: false })} />
        </View>
      );
    return this.props.children;
  }
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Display: BarlowCondensed_700Bold,
    DisplayItalic: BarlowCondensed_700Bold_Italic,
    Inter: Inter_400Regular,
    InterSemi: Inter_600SemiBold,
    InterBold: Inter_700Bold,
  });
  // The saved theme is read before the first screen, so dark users never see a light flash.
  const [themeReady, setThemeReady] = useState(false);
  const { scheme } = useTheme();
  const { language } = useTranslation();
  useEffect(() => {
    void Promise.all([loadTheme(), loadLanguage()]).finally(() => setThemeReady(true));
  }, []);
  if ((!fontsLoaded && !fontError) || !themeReady)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={C.blue} />
      </View>
    );
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.outside, alignItems: 'center' }}>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: Platform.OS === 'web' ? MOBILE_WEB_WIDTH : undefined,
          backgroundColor: C.bg,
          ...(Platform.OS === 'web'
            ? {
                boxShadow: isLight() ? '0 0 100px #1B2A401F' : '0 0 100px #0C182466',
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: C.line,
              }
            : {}),
        }}
      >
        <SafeAreaProvider>
          {/* The query cache is kept on the device, so screens show their last data offline. */}
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister: queryPersister, maxAge: 7 * 86400_000, buster: 'v1' }}
          >
            <SessionProvider>
              <ErrorBoundary>
                {/* Remounted on a theme or language change so every screen renders with the new colours and translations. */}
                <Shell key={`${scheme}-${language}`} />
              </ErrorBoundary>
            </SessionProvider>
          </PersistQueryClientProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}
