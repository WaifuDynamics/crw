import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
export async function exportPhoto(ref: any, share: boolean, height = 1350) {
  const uri = await captureRef(ref, {
    format: 'png',
    quality: 1,
    width: 1080,
    height,
    result: 'tmpfile',
  });
  if (share) {
    if (!(await Sharing.isAvailableAsync()))
      throw new Error('Sharing is unavailable on this device. Use Save photo instead.');
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Share your CRW+',
    });
  } else {
    if (!(await requestPermissionsAsync(true)).granted)
      throw new Error('Allow photo access to save your run photo.');
    await Asset.create(uri);
  }
}
