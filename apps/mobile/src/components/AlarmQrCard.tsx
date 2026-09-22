import React, { useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import MobileModal from './MobileModal';
import { exportPhoto } from '../tracking/exportPhoto';
import { formatCode, qrPayload } from '../alarms/qr';
import { useTranslation } from '../translations';
import { C, Icon, S, T } from '../ui';
import { ClayButton, ClayIconButton, Slab, clay } from './clay';
import { tint } from '../theme';

// The sheet that explains the QR challenge and hands over the code to print.
//
// It opens twice in an alarm's life: once before the challenge is chosen, so nobody picks
// a challenge whose code is still only on a phone, and again from the alarm afterwards,
// so a sheet that went in the bin can be reprinted.

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The printed page itself. Always light, whatever the app's theme: this is captured and
 * sent to a printer, and a dark QR code on a dark page scans badly and wastes ink.
 */
function PrintableCard({
  code,
  hour,
  minute,
  innerRef,
}: {
  code: string;
  hour: number;
  minute: number;
  innerRef: any;
}) {
  const { t } = useTranslation();
  return (
    <View
      ref={innerRef}
      collapsable={false}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        paddingVertical: 26,
        paddingHorizontal: 22,
        alignItems: 'center',
        gap: 14,
      }}
    >
      <T style={{ fontFamily: 'Display', fontSize: 30, lineHeight: 34, color: '#0B0D11' }}>
        CRW<T style={{ fontFamily: 'Display', fontSize: 30, color: '#168BFF' }}>+</T>
      </T>
      <T
        style={{
          fontFamily: 'InterBold',
          fontSize: 11,
          lineHeight: 15,
          letterSpacing: 1.2,
          color: '#6A7180',
          textAlign: 'center',
        }}
      >
        {t('alarms.qrCardEyebrow')}
      </T>

      <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
        <QRCode value={qrPayload(code)} size={190} color="#000000" backgroundColor="#FFFFFF" />
      </View>

      <T
        style={{
          fontFamily: 'Display',
          fontSize: 44,
          lineHeight: 50,
          color: '#0B0D11',
        }}
      >
        {pad(hour)}:{pad(minute)}
      </T>
      <T
        style={{
          fontFamily: 'InterBold',
          fontSize: 13,
          lineHeight: 18,
          letterSpacing: 2,
          color: '#0B0D11',
        }}
      >
        {formatCode(code)}
      </T>
      <T
        style={{
          fontSize: 12,
          lineHeight: 18,
          color: '#4A515C',
          textAlign: 'center',
          paddingHorizontal: 6,
        }}
      >
        {t('alarms.qrCardFooter')}
      </T>
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={[S.row, { gap: 12, alignItems: 'flex-start' }]}>
      <View
        style={[
          clay('blue', 0.7),
          { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <T style={{ fontFamily: 'InterBold', fontSize: 12, color: C.onAccent }}>{n}</T>
      </View>
      <T style={{ flex: 1, fontSize: 13, lineHeight: 19, color: C.white }}>{text}</T>
    </View>
  );
}

export default function AlarmQrCard({
  visible,
  code,
  hour,
  minute,
  onClose,
  onChoose,
}: {
  visible: boolean;
  code: string;
  hour: number;
  minute: number;
  onClose: () => void;
  /** Only passed while the challenge is still being chosen. */
  onChoose?: () => void;
}) {
  const { t } = useTranslation();
  const card = useRef<any>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [said, setSaid] = useState('');

  const put = async (share: boolean) => {
    if (busy) return;
    setBusy(share ? 'share' : 'save');
    setSaid('');
    try {
      await exportPhoto(card, share, 1350);
      setSaid(share ? '' : t('alarms.qrSaved'));
    } catch {
      // The photo permission was refused, or sharing is unavailable on this device.
      setSaid(t('alarms.qrSaveFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <MobileModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={S.page}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 40,
            width: '100%',
            maxWidth: 480,
            alignSelf: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[S.row, { marginBottom: 12 }]}>
            <ClayIconButton icon="arrow-back" label={t('common.back')} onPress={onClose} />
          </View>

          <T
            style={{ fontFamily: 'Display', fontSize: 40, lineHeight: 44, color: C.white }}
          >
            {t('alarms.qrTitle')}
          </T>
          <T style={{ fontSize: 13, lineHeight: 20, color: C.gray, marginTop: 8 }}>
            {t('alarms.qrIntro')}
          </T>

          <Slab radius={26} style={{ marginTop: 18, padding: 16, gap: 14 }}>
            <Step n={1} text={t('alarms.qrStep1')} />
            <Step n={2} text={t('alarms.qrStep2')} />
            <Step n={3} text={t('alarms.qrStep3')} />
          </Slab>

          <View style={{ marginTop: 18 }}>
            <PrintableCard innerRef={card} code={code} hour={hour} minute={minute} />
          </View>

          <View style={{ marginTop: 16, gap: 10 }}>
            <ClayButton
              title={t('alarms.qrSave')}
              icon="download-outline"
              tone="blue"
              loading={busy === 'save'}
              onPress={() => void put(false)}
            />
            {Platform.OS !== 'web' && (
              <ClayButton
                title={t('alarms.qrShare')}
                icon="share-outline"
                tone="graphite"
                loading={busy === 'share'}
                onPress={() => void put(true)}
              />
            )}
          </View>

          {!!said && (
            <T style={{ fontSize: 12, lineHeight: 18, color: C.gray, marginTop: 10 }}>{said}</T>
          )}

          <View
            style={[
              S.row,
              {
                gap: 10,
                marginTop: 18,
                padding: 14,
                borderRadius: 16,
                backgroundColor: tint('#2A1F12'),
                alignItems: 'flex-start',
              },
            ]}
          >
            <Icon name="alert-circle-outline" size={18} color={tint('#FFD18B')} />
            <T style={{ flex: 1, fontSize: 12, lineHeight: 18, color: C.white }}>
              {t('alarms.qrWarning')}
            </T>
          </View>

          {!!onChoose && (
            <View style={{ marginTop: 20 }}>
              <ClayButton
                title={t('alarms.qrChoose')}
                icon="checkmark"
                tone="lime"
                size="large"
                onPress={onChoose}
              />
            </View>
          )}
        </ScrollView>
      </View>
    </MobileModal>
  );
}
