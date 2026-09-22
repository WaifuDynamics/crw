import React, { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import Constants from 'expo-constants';
import { API } from '../api';
import { older } from '../appVersion';
import { useOnline } from '../network';
import { Button, C, Heading, Icon, Label, Page, T } from '../ui';

// Whether this copy of the app may run against the API at all.
//
// A phone keeps whatever version it has until its owner updates it, so the API says in
// /v1/meta which is the oldest app it still serves. An older app shows one clear "update
// CRW+" screen instead of half-working against an API that has moved on - and the same
// check carries a maintenance switch. Anything that goes wrong asking is ignored: an
// unreachable API is the offline mode's business, not a reason to lock anyone out.

type Meta = {
  minAppVersion: string;
  latestAppVersion: string | null;
  maintenance: boolean;
  updateUrl: string | null;
};
export type AppStatus = { state: 'ok' } | { state: 'update' | 'maintenance'; meta: Meta };

export const appVersion = () => Constants.expoConfig?.version || '0.0.0';

export function useAppStatus(): AppStatus {
  const online = useOnline();
  const [status, setStatus] = useState<AppStatus>({ state: 'ok' });
  useEffect(() => {
    if (!online) return;
    let live = true;
    fetch(`${API}/meta`)
      .then((r) => (r.ok ? (r.json() as Promise<Meta>) : null))
      .then((meta) => {
        if (!live || !meta) return;
        if (meta.maintenance) setStatus({ state: 'maintenance', meta });
        // The website is always the newest version, so only the installed apps are held back.
        else if (Platform.OS !== 'web' && older(appVersion(), meta.minAppVersion))
          setStatus({ state: 'update', meta });
        else setStatus({ state: 'ok' });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [online]);
  return status;
}

export function AppStatusScreen({ status }: { status: Exclude<AppStatus, { state: 'ok' }> }) {
  const update = status.state === 'update';
  return (
    <Page>
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 40 }}>
        <View
          style={{
            width: 86,
            height: 86,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.panel,
          }}
        >
          <Icon
            name={update ? 'cloud-download-outline' : 'construct-outline'}
            size={40}
            color={C.blue}
          />
        </View>
        <Label style={{ color: C.blue, marginTop: 24 }}>
          {update ? `VERSION ${appVersion()}` : 'BACK SOON'}
        </Label>
        <Heading style={{ fontSize: 44, marginTop: 10 }}>
          {update ? 'TIME TO\nUPDATE CRW+.' : 'A QUICK\nTUNE-UP.'}
        </Heading>
        <T style={{ fontSize: 13, lineHeight: 20, marginTop: 14 }}>
          {update
            ? `This version is too old to talk to CRW+ any more. Install ${
                status.meta.latestAppVersion
                  ? `version ${status.meta.latestAppVersion}`
                  : 'the latest version'
              } - your account, workouts and friends are all waiting for you.`
            : 'CRW+ is being worked on for a few minutes. Your workouts are safe on this phone and will sync as soon as we are back.'}
        </T>
        {update && status.meta.updateUrl ? (
          <Button
            title="Get the new version"
            icon="arrow-forward"
            onPress={() => void Linking.openURL(status.meta.updateUrl!)}
            style={{ marginTop: 28 }}
          />
        ) : null}
      </View>
    </Page>
  );
}
