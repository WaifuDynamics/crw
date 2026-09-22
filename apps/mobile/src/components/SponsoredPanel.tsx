import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Image, Platform, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import mobileAds, {
  AdsConsent,
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
  TestIds,
} from 'react-native-google-mobile-ads';
import { useOnline } from '../network';
import { C, S, T } from '../ui';
import AdPanel from './AdPanel';

// The sponsored card on Discover (phones): Google AdMob native ads that rotate.
//
// - Consent first: Google's consent form (UMP) is shown where the law requires it, and no
//   ad is requested before the answer.
// - Non-personalised only: CRW+ keeps health and workout data out of advertising (see the
//   Location & Health Data Notice), so ads are never targeted with it.
// - Up to three ads are loaded and rotate every 10 seconds while Discover is on screen.
// - No fill, no consent, offline: the brand previews (AdPanel) show instead.
//
// Unit ids come from EXPO_PUBLIC_ADMOB_NATIVE_ANDROID / _IOS; without them Google's test
// ads are used, so a build never shows real ads by accident.

const UNIT =
  (Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_ADMOB_NATIVE_IOS
    : process.env.EXPO_PUBLIC_ADMOB_NATIVE_ANDROID) || TestIds.NATIVE;
const COUNT = 3;
const ROTATE_MS = 10_000;

let ready: Promise<boolean> | null = null;
/** Consent, then SDK start. Resolves to whether ads may be requested. */
function prepareAds() {
  ready ??= (async () => {
    try {
      const info = await AdsConsent.gatherConsent();
      if (!info.canRequestAds) return false;
      await mobileAds().initialize();
      return true;
    } catch {
      ready = null;
      return false;
    }
  })();
  return ready;
}

function useNativeAds() {
  const online = useOnline();
  const [ads, setAds] = useState<NativeAd[]>([]);
  useEffect(() => {
    if (!online) return;
    let alive = true;
    const loaded: NativeAd[] = [];
    void (async () => {
      if (!(await prepareAds())) return;
      for (let i = 0; i < COUNT && alive; i++) {
        try {
          const ad = await NativeAd.createForAdRequest(UNIT, {
            requestNonPersonalizedAdsOnly: true,
            keywords: ['fitness', 'running', 'sport', 'outdoor'],
          });
          if (!alive) {
            ad.destroy();
            return;
          }
          loaded.push(ad);
          setAds([...loaded]);
        } catch {
          // no fill for this slot
        }
      }
    })();
    return () => {
      alive = false;
      loaded.forEach((a) => a.destroy());
    };
  }, [online]);
  return ads;
}

function NativeCard({ ad }: { ad: NativeAd }) {
  return (
    <NativeAdView nativeAd={ad} style={styles.panel}>
      <View style={styles.media}>
        <NativeMediaView style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View pointerEvents="none" style={styles.sponsor}>
          <T style={styles.sponsorText}>AD</T>
        </View>
      </View>
      <View style={styles.footer}>
        {ad.icon?.url ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: ad.icon.url }} style={styles.icon} />
          </NativeAsset>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <T numberOfLines={1} style={styles.headline}>
              {ad.headline}
            </T>
          </NativeAsset>
          {ad.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <T numberOfLines={1} style={styles.meta}>
                {ad.advertiser}
              </T>
            </NativeAsset>
          ) : ad.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <T numberOfLines={1} style={styles.meta}>
                {ad.body}
              </T>
            </NativeAsset>
          ) : null}
        </View>
        {ad.callToAction ? (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <T style={styles.cta}>{ad.callToAction}</T>
          </NativeAsset>
        ) : null}
      </View>
    </NativeAdView>
  );
}

export default function SponsoredPanel() {
  const ads = useNativeAds();
  const focused = useIsFocused();
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const reduced = useRef(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => (reduced.current = r));
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (ads.length < 2 || !focused || !active || reduced.current) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % ads.length), ROTATE_MS);
    return () => clearTimeout(t);
  }, [index, ads.length, focused, active]);

  if (!ads.length) return <AdPanel />;
  const ad = ads[index % ads.length];
  return (
    <View style={[S.pad, { marginTop: 22 }]} testID="discover-native-ad">
      <NativeCard key={ad.responseId || index} ad={ad} />
      {ads.length > 1 && (
        <View style={styles.dots}>
          {ads.map((a, i) => (
            <View
              key={a.responseId || i}
              style={[styles.dot, i === index % ads.length && styles.dotOn]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#17191D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  media: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#0D1015' },
  sponsor: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#FFD18B',
  },
  sponsorText: { fontFamily: 'InterBold', fontSize: 9, lineHeight: 14, color: '#2B1D07' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  icon: { width: 36, height: 36, borderRadius: 8 },
  headline: { fontFamily: 'InterBold', fontSize: 14, lineHeight: 19, color: '#F7F8FA' },
  meta: { fontSize: 11, lineHeight: 15, color: '#969AA3' },
  cta: {
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: C.blue,
    color: '#FFFFFF',
    fontFamily: 'InterBold',
    fontSize: 12,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(150,154,163,0.4)' },
  dotOn: { width: 18, backgroundColor: C.blue },
});
