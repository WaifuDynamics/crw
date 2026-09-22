import { existsSync } from 'node:fs';
import pkg from './package.json';

// Firebase config for push on Android (FCM). The file comes from the Firebase console
// (project crw-plus, app app.crwplus.fitness); builds without it still run, but the phone
// then cannot receive pushes. CI writes it from the GOOGLE_SERVICES_JSON secret.
const googleServicesFile = existsSync('./google-services.json')
  ? './google-services.json'
  : undefined;

// The app version comes from package.json (set by the release workflow). Store build
// numbers are derived from it so every release sorts above the previous one.
const [major, minor, patch] = pkg.version.split(/[.-]/).map(Number);
const buildNumber = major * 1_000_000 + minor * 1_000 + patch;

export default {
  expo: {
    name: 'CRW+',
    slug: 'crw-plus',
    owner: 'michal4489',
    version: pkg.version,
    scheme: 'crw',
    orientation: 'portrait',
    // Follows the device, so the "Same as device" appearance option can see it.
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'app.crwplus.fitness',
      // Apple requires Sign in with Apple in any app that offers another social sign-in.
      usesAppleSignIn: true,
      buildNumber: String(buildNumber),
      infoPlist: {
        NSCameraUsageDescription: 'Take run photos and scan CRW+ tickets at activity check-in.',
        NSLocationWhenInUseUsageDescription:
          'Record your running route and find fitness experiences near you.',
        NSPhotoLibraryUsageDescription: 'Choose photos for your CRW+ profile and activities.',
      },
    },
    android: {
      allowBackup: false,
      package: 'app.crwplus.fitness',
      versionCode: buildNumber,
      permissions: [
        'CAMERA',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        // Health Connect: read workouts and daily totals, write CRW+ workouts and body data.
        'android.permission.health.READ_STEPS',
        'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
        'android.permission.health.READ_HEART_RATE',
        'android.permission.health.READ_EXERCISE',
        'android.permission.health.READ_DISTANCE',
        'android.permission.health.READ_WEIGHT',
        'android.permission.health.READ_HEIGHT',
        'android.permission.health.WRITE_EXERCISE',
        'android.permission.health.WRITE_EXERCISE_ROUTE',
        'android.permission.health.WRITE_DISTANCE',
        'android.permission.health.WRITE_ACTIVE_CALORIES_BURNED',
        'android.permission.health.WRITE_WEIGHT',
        'android.permission.health.WRITE_HEIGHT',
      ],
      // Brand images come from assets/crw-logo.svg: node scripts/brand-assets.mjs
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        monochromeImage: './assets/android-icon-monochrome.png',
        backgroundColor: '#08090B',
      },
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    web: { name: 'CRW+ — Get out. Get going.', favicon: './assets/favicon.png', bundler: 'metro' },
    plugins: [
      'expo-secure-store',
      'expo-font',
      'expo-web-browser',
      'expo-apple-authentication',
      [
        'expo-camera',
        {
          cameraPermission: 'Take run photos and scan CRW+ tickets at activity check-in.',
          recordAudioAndroid: false,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Choose photos for your CRW+ profile and activities.',
          cameraPermission: 'Take photos with your run stats and the CRW+ logo.',
          microphonePermission: false,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Record your running route and find fitness experiences near you.',
          locationAlwaysAndWhenInUsePermission:
            'Record your running route even when your phone is locked.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      'expo-sharing',
      [
        'expo-media-library',
        {
          photosPermission: 'Choose your run photos.',
          savePhotosPermission: 'Save run photos with your stats and the CRW+ logo.',
          granularPermissions: ['photo'],
        },
      ],
      [
        '@kingstinct/react-native-healthkit',
        {
          NSHealthShareUsageDescription:
            'Read your runs, steps, active energy and heart rate for your personal CRW+ tracking dashboard.',
          NSHealthUpdateUsageDescription:
            'CRW+ only reads health data and does not write health records.',
          background: false,
        },
      ],
      'react-native-health-connect',
      ['expo-build-properties', { android: { minSdkVersion: 26 } }],
      [
        // AdMob native ads on Discover. Without real ids Google's test app ids are used.
        'react-native-google-mobile-ads',
        {
          androidAppId:
            process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
          iosAppId: process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511',
          delayAppMeasurementInit: true,
        },
      ],
      [
        'expo-notifications',
        {
          // White "C+" mark in the status bar, tinted blue in the notification shade.
          icon: './assets/notification-icon.png',
          color: '#168BFF',
          defaultChannel: 'general',
        },
      ],
    ],
    extra: {
      // EAS project @michal4489/crw-plus.
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '9273894a-1675-4fd8-aee1-b0ee58a77aa7',
      },
    },
  },
};
