import { tint } from '../theme';
import React from 'react';
import { Modal, ModalProps, Platform, View } from 'react-native';
import { MOBILE_WEB_WIDTH } from '../layout';

/** Native modals retain their presentation; web portals use the app's mobile frame. */
export default function MobileModal({
  children,
  fullBleed = false,
  ...props
}: ModalProps & { fullBleed?: boolean }) {
  if (Platform.OS !== 'web') return <Modal {...props}>{children}</Modal>;
  return (
    <Modal {...props} transparent presentationStyle="overFullScreen">
      <View style={{ flex: 1, alignItems: 'center', backgroundColor: tint('#030405D9') }}>
        <View
          testID="mobile-modal-frame"
          style={{
            flex: 1,
            width: '100%',
            maxWidth: fullBleed ? undefined : MOBILE_WEB_WIDTH,
            backgroundColor: tint('#08090B'),
            borderLeftWidth: fullBleed ? 0 : 1,
            borderRightWidth: fullBleed ? 0 : 1,
            borderColor: tint('#191D24'),
            boxShadow: '0 0 100px #0C182466',
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
