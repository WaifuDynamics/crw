import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { C, Icon, S, Tap } from '../ui';
import { Shutter } from './glass';
import LiquidGlass from './LiquidGlass';
import RunFrame from './RunFrame';
import { Run } from '../tracking/model';
import { exportPhoto } from '../tracking/exportPhoto';
import { useAction, useSession } from '../api';

/** Export the edge-to-edge composition at high resolution. */
const EXPORT_HEIGHT = 1920;
/** The round glass controls around the shutter, sized like the dock's tab icons. */
const ICON_BUTTON = 40;

/**
 * The run camera. Opening it goes straight to the lens: a full-screen stage shows the
 * live preview with the CRW+ overlay already on it, so the shot you frame is
 * the shot you share.
 */
export default function RunPhoto({ run, onBack }: { run: Run; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [deckHeight, setDeckHeight] = useState(156);
  const [photo, setPhoto] = useState<string>(),
    [facing, setFacing] = useState<CameraType>('back'),
    [ready, setReady] = useState(true),
    [live, setLive] = useState(false),
    [asked, setAsked] = useState(false);
  const frame = useRef<View>(null),
    camera = useRef<CameraView>(null),
    { busy, run: act } = useAction(),
    { say } = useSession();
  const [permission, ask] = useCameraPermissions();
  // The viewfinder runs until a shot is taken. Without camera access the stage
  // falls back to the stats over the navy backdrop, which still exports.
  const viewfinder = !photo && !!permission?.granted;

  // Ask the moment the camera opens: no extra tap between the icon and the lens.
  useEffect(() => {
    if (!permission || permission.granted || asked) return;
    setAsked(true);
    if (permission.canAskAgain) void ask().catch(() => {});
  }, [permission, asked]);
  useEffect(() => {
    if (!viewfinder) setLive(false);
  }, [viewfinder]);

  async function enable() {
    const result = await ask();
    if (!result.granted)
      throw new Error('Allow camera access in your settings to shoot inside CRW+.');
  }
  async function shoot() {
    const shot = await camera.current?.takePictureAsync({ quality: 1 });
    if (!shot?.uri) throw new Error('That shot did not come through. Please try again.');
    setReady(false);
    setPhoto(shot.uri);
  }
  async function gallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
    });
    if (!result.canceled) {
      setReady(false);
      setPhoto(result.assets[0].uri);
    }
  }
  const retake = () => {
    setPhoto(undefined);
    setReady(true);
  };
  const save = (share: boolean) =>
    act(async () => {
      await exportPhoto(frame, share, EXPORT_HEIGHT);
      if (!share) say('Your CRW+ photo is saved.');
    });

  const iconButton = (
    icon: string,
    label: string,
    onPress: () => void,
    disabled = false,
    active = false,
  ) => (
    <Tap
      label={label}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled, selected: active }}
    >
      {/* The dock's liquid glass, drawn inside Tap so it scales with the press.
          No sheen: over a photo the white rim reads as a disc behind the icon. */}
      <LiquidGlass radius={ICON_BUTTON / 2} style={st.iconButton} sheen={false}>
        <Icon name={icon} size={21} color={active ? C.blue : C.onAccent} />
      </LiquidGlass>
    </Tap>
  );

  return (
    <View style={st.screen}>
      <View style={st.workspace}>
        <View ref={frame} collapsable={false} pointerEvents="none" style={st.frame}>
          {!photo && !viewfinder && (
            <LinearGradient
              colors={['#1C2C42', '#101722', '#08090B']}
              style={StyleSheet.absoluteFill}
            />
          )}
          {viewfinder && (
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mirror={facing === 'front'}
              animateShutter={false}
              onCameraReady={() => setLive(true)}
              onMountError={() => say('This device camera could not start. Use Gallery instead.')}
            />
          )}
          {photo && (
            <Image
              source={{ uri: photo }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onLoad={() => setReady(true)}
              onError={() => {
                retake();
                say('Could not load that photo. Please choose another.');
              }}
            />
          )}
          <RunFrame run={run} bottomInset={deckHeight + 30} topInset={insets.top + 68} />
        </View>

        <LinearGradient
          pointerEvents="none"
          colors={['#00000060', '#00000000']}
          style={[st.topShade, { height: insets.top + 90 }]}
        />
        <View
          style={[S.between, st.chrome, { paddingTop: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          {iconButton('close', 'Back to run', onBack)}
          <View style={S.row}>
            {photo &&
              iconButton('share-outline', 'Share my CRW+', () => save(true), busy || !ready)}
          </View>
        </View>

        <SafeAreaView
          edges={['bottom']}
          style={st.controls}
          onLayout={(event) => setDeckHeight(event.nativeEvent.layout.height)}
        >
          <LinearGradient
            pointerEvents="none"
            colors={['#00000000', '#00000080']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[S.between, st.shutterRow]}>
            {iconButton('images-outline', 'Gallery', () => act(gallery), busy)}
            {photo ? (
              <Shutter label="Retake" icon="refresh" disabled={busy} onPress={retake} />
            ) : (
              <Shutter
                label={viewfinder ? 'Take photo' : 'Enable camera'}
                disabled={busy || (viewfinder && !live)}
                onPress={() => act(viewfinder ? shoot : enable)}
              />
            )}
            {photo
              ? iconButton('download-outline', 'Save photo', () => save(false), busy || !ready)
              : iconButton(
                  'camera-reverse-outline',
                  'Flip camera',
                  () => {
                    setLive(false);
                    setFacing(facing === 'back' ? 'front' : 'back');
                  },
                  busy || !viewfinder,
                )}
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: 'center', overflow: 'hidden' },
  workspace: { flex: 1, width: '100%', maxWidth: 520, overflow: 'hidden' },
  frame: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.panel },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  iconButton: {
    width: ICON_BUTTON,
    height: ICON_BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 14,
  },
  shutterRow: { paddingHorizontal: 30 },
});
