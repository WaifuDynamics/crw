import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Image, Linking, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, S, Icon, T, Tap } from '../ui';
import { useSession } from '../api';

// Brand-owned campaign previews, not paid CRW+ partnerships. Sources: docs/ASSETS.md.
const ADS = [
  {
    id: 'jordan',
    title: 'Jordan / Our Turn',
    action: 'View Jordan campaign',
    accent: '#FF3346',
    url: 'https://about.nike.com/en/newsroom/releases/with-our-turn-jordan-brand-rallies-the-next-generation-announces-global-one-on-one-tournament/',
    image: require('../../assets/ads/jordan-our-turn.jpg'),
  },
  {
    id: 'nike',
    title: 'Nike / Pegasus 41',
    action: 'View Nike Pegasus 41',
    accent: '#C8EEA0',
    url: 'https://about.nike.com/en-GB/newsroom/releases/this-summer-the-nike-pegasus-41-gives-runners-more-energy-return-than-ever',
    image: require('../../assets/ads/nike-pegasus-41.jpg'),
  },
  {
    id: 'adidas',
    title: 'adidas / Crazyquick Padel',
    action: 'View adidas Crazyquick Padel',
    accent: '#8DCBFA',
    url: 'https://www.adidas.co.za/JR9325.html',
    image: require('../../assets/ads/adidas-crazyquick-product.jpg'),
  },
  {
    id: 'on-running',
    title: 'On / Cloudmonster 2',
    action: 'View On Cloudmonster 2',
    accent: '#FF7A00',
    url: 'https://www.on.com/en-us/stories/cloudmonster-2',
    image: require('../../assets/ads/move.jpg'),
  },
  {
    id: 'gymshark',
    title: 'Gymshark / We Do Gym',
    action: 'Explore Gymshark Community',
    accent: '#2DD4BF',
    url: 'https://www.gymshark.com/',
    image: require('../../assets/ads/crew.jpg'),
  },
  {
    id: 'under-armour',
    title: 'Under Armour / Protect This House',
    action: 'View Under Armour Training',
    accent: '#F59E0B',
    url: 'https://about.underarmour.com/',
    image: require('../../assets/ads/challenge.jpg'),
  },
];

export default function AdPanel() {
  const { say } = useSession();
  const [index, setIndex] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [interacting, setInteracting] = useState(false);
  const focused = useIsFocused();
  const ad = ADS[index];
  const openCampaign = async () => {
    try {
      await Linking.openURL(ad.url);
    } catch {
      say('Could not open the campaign. Please try again.');
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReducedMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!focused || !appActive || paused || reducedMotion || interacting) return;
    const timer = setTimeout(() => setIndex((current) => (current + 1) % ADS.length), 8000);
    return () => clearTimeout(timer);
  }, [index, focused, appActive, paused, reducedMotion, interacting]);

  return (
    <View style={[S.pad, { marginTop: 22 }]} testID="discover-ad-panel">
      <View style={styles.panel}>
        <View style={styles.media}>
          <Tap
            label={ad.action}
            onPress={openCampaign}
            onHoverIn={() => setInteracting(true)}
            onHoverOut={() => setInteracting(false)}
            onFocus={() => setInteracting(true)}
            onBlur={() => setInteracting(false)}
            flex
            style={{ flex: 1 }}
          >
            <Image source={ad.image} resizeMode="cover" style={styles.image} accessible={false} />
            <View pointerEvents="none" style={styles.sponsor}>
              <T style={styles.sponsorText}>AD PREVIEW</T>
            </View>
          </Tap>
          <View style={styles.controls}>
            {ADS.map((item, position) => (
              <Tap
                key={item.id}
                label={`Show ad ${position + 1} of ${ADS.length}`}
                accessibilityState={{ selected: position === index }}
                aria-pressed={position === index}
                onFocus={() => setInteracting(true)}
                onBlur={() => setInteracting(false)}
                onPress={() => {
                  setIndex(position);
                  setPaused(true);
                }}
                style={styles.slideButton}
              >
                <View
                  style={[
                    styles.marker,
                    { backgroundColor: position === index ? '#F7F8FA' : '#FFFFFF60' },
                  ]}
                />
              </Tap>
            ))}
          </View>
        </View>
        <View style={styles.glass} testID="ad-glass-footer">
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Image
              source={ad.image}
              resizeMode="cover"
              blurRadius={24}
              style={[styles.image, { transform: [{ scale: 1.2 }] }]}
              accessible={false}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: `${ad.accent}30` }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#08090B70' }]} />
            <LinearGradient
              colors={['#FFFFFF42', '#FFFFFF08', '#FFFFFF20']}
              locations={[0, 0.45, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
          <Tap
            label={`${ad.action} details`}
            onPress={openCampaign}
            onFocus={() => setInteracting(true)}
            onBlur={() => setInteracting(false)}
            style={[S.between, styles.action]}
          >
            <T style={styles.actionText}>{ad.title}</T>
            <Icon name="arrow-up-right" size={21} color="#F7F8FA" />
          </Tap>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 8, overflow: 'hidden', backgroundColor: C.panel },
  media: { width: '100%', aspectRatio: 2 / 1 },
  image: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  sponsor: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#08090BBF',
    borderRadius: 3,
  },
  sponsorText: {
    fontFamily: 'InterBold',
    fontSize: 7,
    lineHeight: 12,
    color: C.white,
    letterSpacing: 0,
  },
  controls: { ...S.row, position: 'absolute', bottom: 0, right: 4 },
  slideButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  marker: { width: 20, height: 3, borderRadius: 2, boxShadow: '0 1px 3px #08090B' },
  glass: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: '#FFFFFF66',
    backgroundColor: C.panel,
    boxShadow: 'inset 0 1px 0 #FFFFFF26, inset 0 -1px 0 #FFFFFF12',
  },
  action: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 8, gap: 12 },
  actionText: {
    fontFamily: 'InterBold',
    fontSize: 12,
    lineHeight: 18,
    color: C.white,
    flexShrink: 1,
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
