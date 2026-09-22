import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CityModal, LanguageModal } from '../components/Pickers';
import {
  ClayChoice,
  ClayField,
  ClayGroup,
  ClayRow,
  ClayScreen,
  ClaySection,
  ClayToggle,
} from '../components/ClayPage';
import { ClayButton, Slab } from '../components/clay';
import { setThemeMode, ThemeMode, useTheme } from '../theme';
import { useSession, useAction, useData, post, patch, remove, invalidate } from '../api';
import { registerForPush } from '../push';
import { useTranslation, TRANSLATED_LANGUAGES } from '../translations';
import { C, Icon, S, T } from '../ui';

// Everything about your own account: the profile you show, how the app looks, what it
// may tell other people, and the way out. Dressed in the Tracking page's clay - see
// components/clay and components/ClayPage.

function Appearance() {
  const { mode } = useTheme();
  const { t } = useTranslation();
  const options: [ThemeMode, string, string][] = [
    ['dark', t('profile.appearance.dark'), 'moon-outline'],
    ['light', t('profile.appearance.light'), 'sunny-outline'],
    ['system', t('profile.appearance.system'), 'phone-portrait-outline'],
  ];
  return (
    <>
      <ClaySection title={t('profile.appearance.title')} />
      <View style={[S.row, { flexWrap: 'wrap', gap: 8 }]}>
        {options.map(([key, title, icon]) => (
          <ClayChoice
            key={key}
            label={title}
            icon={icon}
            active={mode === key}
            onPress={() => void setThemeMode(key)}
          />
        ))}
      </View>
    </>
  );
}

function LanguageSetting() {
  const { t, language, availableLanguages } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const current = availableLanguages.find((l) => l.code === language);
  const currentName = current
    ? current.native || current.name
    : language === 'pl'
      ? 'Polski'
      : 'English';
  const isTranslated = TRANSLATED_LANGUAGES.has(language);

  return (
    <View style={{ marginTop: 10 }}>
      <ClayRow
        icon="language"
        title={t('profile.language.title')}
        value={currentName}
        description={
          isTranslated
            ? undefined
            : language === 'pl'
              ? 'Brak tłumaczenia — angielski'
              : 'No translation — English'
        }
        onPress={() => setModalOpen(true)}
      />
      <LanguageModal visible={modalOpen} onClose={() => setModalOpen(false)} />
    </View>
  );
}

export function SettingsScreen({ navigation }: any) {
  const { user, refresh, say } = useSession();
  const { t } = useTranslation();
  const q = useData('/catalog');
  const { busy, run } = useAction();
  const [form, setForm] = useState<any>({
    displayName: user.display_name,
    bio: user.bio,
    cityId: user.city_id,
    interests: user.interests,
    visibility: user.visibility,
    showAttendance: user.show_attendance,
    showLocation: user.show_location,
    compete: user.compete,
  });
  const [deleting, setDeleting] = useState(false);
  const [cityModal, setCityModal] = useState(false);
  const set = (key: string, value: any) => setForm({ ...form, [key]: value });
  const upload = () =>
    run(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets[0],
        blob = await (await fetch(asset.uri)).blob();
      const type = asset.mimeType || 'image/jpeg';
      const signed = await post('/uploads/presign', {
        contentType: type,
        size: blob.size,
        purpose: 'avatar',
      });
      const response = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': type },
        body: blob,
      });
      if (!response.ok) throw new Error('Image upload failed');
      set('avatarUrl', signed.mediaUrl);
      say('Photo uploaded. Save your profile to apply it.', 'success');
    });
  const [deleteSentTo, setDeleteSentTo] = useState('');
  const requestDeletion = () =>
    run(async () => {
      const r = await remove('/account');
      setDeleteSentTo(r.email || 'your email address');
      say('Confirmation email sent. Check your inbox.', 'success');
    });
  const push = () =>
    run(async () => {
      if (Platform.OS === 'web') {
        say('Push notifications are available in the iOS and Android app.');
        return;
      }
      const status = await registerForPush(true);
      say(
        status === 'registered'
          ? 'You’re connected. We’ll keep you in the loop.'
          : status === 'denied'
            ? 'Notifications are turned off. Allow them for CRW+ in your phone settings.'
            : 'This build of the app cannot receive pushes yet. Update CRW+ and try again.',
        status === 'registered' ? 'success' : 'error',
      );
    });

  const cityName =
    (q.data?.cities || []).find((c: any) => c.id === form.cityId)?.name ||
    t('profile.preferNotToSay');

  return (
    <ClayScreen title={t('profile.makeItYours')} onBack={navigation.goBack}>
      <View style={{ marginTop: 18 }}>
        <ClayButton
          title={t('profile.photoUpload')}
          icon="camera-outline"
          tone="graphite"
          onPress={upload}
        />
      </View>

      <ClaySection title={t('profile.displayName')} />
      <ClayField value={form.displayName} onChange={(v: string) => set('displayName', v)} />
      <ClayField
        label={t('profile.bio')}
        multiline
        value={form.bio}
        onChange={(v: string) => set('bio', v)}
      />
      <ClayRow
        icon="location-outline"
        title={t('profile.yourCity')}
        value={cityName}
        trailingIcon="chevron-down"
        onPress={() => setCityModal(true)}
      />
      <CityModal
        visible={cityModal}
        onClose={() => setCityModal(false)}
        cities={q.data?.cities || []}
        cityId={form.cityId}
        onPick={(id) => {
          set('cityId', id);
          setCityModal(false);
        }}
      />

      <ClaySection title={t('profile.yourMoves')} />
      <View style={[S.row, { flexWrap: 'wrap', gap: 8 }]}>
        {q.data?.categories?.map((c: any) => (
          <ClayChoice
            key={c.slug}
            label={c.name}
            active={form.interests?.includes(c.slug)}
            onPress={() =>
              set(
                'interests',
                form.interests.includes(c.slug)
                  ? form.interests.filter((i: string) => i !== c.slug)
                  : [...form.interests, c.slug],
              )
            }
          />
        ))}
      </View>

      <Appearance />
      <LanguageSetting />

      <ClayGroup title={t('profile.privacy.publicProfile')}>
        <ClayToggle
          title={t('profile.privacy.publicProfile')}
          description={t('profile.privacy.publicDesc')}
          value={form.visibility === 'public'}
          onChange={(v: boolean) => set('visibility', v ? 'public' : 'private')}
        />
        <ClayToggle
          title={t('profile.privacy.showAttendance')}
          description={t('profile.privacy.showAttendanceDesc')}
          value={form.showAttendance}
          onChange={(v: boolean) => set('showAttendance', v)}
        />
        <ClayToggle
          title={t('profile.privacy.showCity')}
          value={form.showLocation}
          onChange={(v: boolean) => set('showLocation', v)}
        />
        <ClayToggle
          title={t('profile.privacy.joinLeaderboards')}
          value={form.compete}
          onChange={(v: boolean) => set('compete', v)}
        />
      </ClayGroup>

      <View style={{ marginTop: 22 }}>
        <ClayButton
          title={t('profile.saveProfile')}
          icon="checkmark"
          tone="lime"
          size="large"
          loading={busy}
          onPress={() =>
            run(async () => {
              await patch('/profile', form);
              await refresh();
              await invalidate();
              say('Profile updated. Looking good.', 'success');
              navigation.goBack();
            })
          }
        />
      </View>

      <ClayGroup title="Email">
        <ClayToggle
          title="Daily CRW+ email"
          description="Today’s challenge, your record and activities near you. At most one a day."
          value={!!user?.account?.marketing_opt_in}
          onChange={(v: boolean) =>
            run(async () => {
              await patch('/account', { marketingOptIn: v });
              await refresh();
              say(
                v ? 'You’re in. See you tomorrow morning.' : 'Done. No more daily emails.',
                'success',
              );
            })
          }
        />
      </ClayGroup>

      <ClayGroup title="Legal & privacy">
        {(
          [
            ['privacy', 'Privacy Policy', 'shield-checkmark-outline'],
            ['terms', 'Terms of Service', 'document-text-outline'],
            ['guidelines', 'Community Guidelines', 'people-outline'],
            ['location-health', 'Location & health data', 'navigate-outline'],
            ['', 'All legal documents', 'library-outline'],
          ] as [string, string, string][]
        ).map(([id, title, icon]) => (
          <ClayRow
            key={title}
            icon={icon}
            title={title}
            onPress={() => navigation.navigate('Legal', id ? { id } : {})}
          />
        ))}
        {user?.account?.legal_accepted_at && (
          <T style={{ fontSize: 11, lineHeight: 16, color: C.gray, marginTop: 2 }}>
            You accepted the current terms on{' '}
            {new Date(user.account.legal_accepted_at).toLocaleDateString()}.
          </T>
        )}
      </ClayGroup>

      {(user?.roles?.includes('ADMIN') || user?.roles?.includes('ORGANIZER')) && (
        <ClayGroup title="Running CRW+">
          {user?.roles?.includes('ADMIN') && (
            <ClayRow
              icon="shield-checkmark-outline"
              title={t('profile.adminPanel')}
              tone="cream"
              onPress={() => navigation.navigate('Admin')}
            />
          )}
          {user?.roles?.includes('ORGANIZER') && (
            <ClayRow
              icon="grid-outline"
              title={t('profile.organizerStudio')}
              onPress={() => navigation.navigate('Organizer')}
            />
          )}
        </ClayGroup>
      )}

      <ClayGroup title="Push notifications">
        <ClayToggle
          title="Friend activity"
          description="When a friend finishes a workout or a big rep session. At most one per friend every 3 hours."
          value={user?.account?.push_friend_activity !== false}
          onChange={(v: boolean) =>
            run(async () => {
              await patch('/account', { pushFriendActivity: v });
              await refresh();
            })
          }
        />
        <ClayRow
          icon="notifications-outline"
          title="Enable push notifications"
          trailingIcon={null}
          onPress={push}
        />
        {Platform.OS !== 'web' && (
          <ClayRow
            icon="shield-outline"
            title="App permissions"
            onPress={() => navigation.navigate('Permissions')}
          />
        )}
      </ClayGroup>

      <ClaySection title="Account" />
      {deleting ? (
        <Slab tone="ember" radius={24} style={{ padding: 18, gap: 12 }}>
          {deleteSentTo ? (
            <>
              <View style={[S.row, { gap: 10 }]}>
                <Icon name="mail-unread-outline" color={C.white} size={22} />
                <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 14 }}>
                  Check your inbox
                </T>
              </View>
              <T style={{ fontSize: 12, lineHeight: 18, color: C.white }}>
                We sent a confirmation link to {deleteSentTo}. Your account is only deleted after
                you press the button in that email. The link is valid for 1 hour.
              </T>
              <ClayButton
                title="Send the email again"
                tone="graphite"
                loading={busy}
                onPress={requestDeletion}
              />
            </>
          ) : (
            <>
              <T style={{ fontSize: 12, lineHeight: 18, color: C.white }}>
                To keep your account safe, we’ll email you a link to confirm. Your profile, wins
                and personal details will be removed. Financial and attendance records remain
                where required for platform integrity.
              </T>
              <ClayButton
                title="Email me the confirmation link"
                icon="mail-outline"
                tone="graphite"
                loading={busy}
                onPress={requestDeletion}
              />
            </>
          )}
          <ClayButton
            title="Keep my account"
            tone="cream"
            onPress={() => {
              setDeleting(false);
              setDeleteSentTo('');
            }}
          />
        </Slab>
      ) : (
        <ClayRow
          icon="trash-outline"
          title="Delete account"
          description="We email you a link to confirm first."
          tone="ember"
          onPress={() => setDeleting(true)}
        />
      )}
    </ClayScreen>
  );
}
