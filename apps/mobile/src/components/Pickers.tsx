import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import MobileModal from './MobileModal';
import { tint } from '../theme';
import { C, Icon, Label, Page, S, T, Tap } from '../ui';
import { ClayButton, ClayIconButton } from './clay';
import { useTranslation, TRANSLATED_LANGUAGES, languageName } from '../translations';
import { useSession, patch, invalidate } from '../api';

// The two pickers Settings opens: the language list and the city search. Lifted out of
// Profile.tsx, which was holding nine screens at once.

export function LanguageModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { language, setLanguage, availableLanguages } = useTranslation();
  const { user } = useSession();
  const [query, setQuery] = useState('');
  const activeTranslated = TRANSLATED_LANGUAGES.has(language);
  const current = availableLanguages.find((l) => l.code === language);
  const currentDisplayName = current
    ? current.native !== current.name
      ? `${current.native} (${current.name})`
      : current.name
    : language;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableLanguages;
    return availableLanguages.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.native.toLowerCase().includes(q) ||
        l.code.toLowerCase() === q,
    );
  }, [query, availableLanguages]);

  return (
    <MobileModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={S.page}>
        <View style={[S.row, { gap: 12, alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 }]}>
          <ClayIconButton icon="arrow-back" label="Go back" onPress={onClose} />
          <T style={{ fontFamily: 'Display', fontSize: 27, lineHeight: 30, color: C.white }}>
            {language === 'pl' ? 'JĘZYK APLIKACJI' : 'APP LANGUAGE'}
          </T>
        </View>
        <Page>
          <T style={{ marginTop: 14, marginBottom: 16 }}>
            {language === 'pl'
              ? 'Wybierz język aplikacji. Języki bez pełnego tłumaczenia wyświetlają się w języku angielskim.'
              : 'Choose your preferred language. Languages without full translation will be shown in English.'}
          </T>

          {!activeTranslated && (
            <View
              style={[
                S.row,
                {
                  gap: 10,
                  padding: 14,
                  backgroundColor: tint('#2A2112'),
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: tint('#5C4520'),
                  marginBottom: 16,
                },
              ]}
            >
              <Icon name="information-circle-outline" color={C.blue} size={20} />
              <T style={{ flex: 1, fontSize: 12, lineHeight: 18, color: C.white }}>
                {language === 'pl'
                  ? `Język ${currentDisplayName} nie ma jeszcze pełnego tłumaczenia. Interfejs jest wyświetlany po angielsku.`
                  : `${currentDisplayName} has no full translation yet. Interface is displayed in English.`}
              </T>
            </View>
          )}

          <TextInput
            accessibilityLabel={language === 'pl' ? 'Szukaj języka' : 'Search language'}
            value={query}
            onChangeText={setQuery}
            placeholder={language === 'pl' ? 'Szukaj języka…' : 'Search language…'}
            placeholderTextColor={tint('#777D89')}
            autoCorrect={false}
            style={[S.input, { marginBottom: 14, backgroundColor: 'transparent', borderWidth: 0 }]}
          />

          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: C.line,
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            <ScrollView
              style={{ maxHeight: 420 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {matches.map((l) => {
                const active = language === l.code;
                const isTranslated = l.available;
                return (
                  <Tap
                    key={l.code}
                    label={l.name}
                    onPress={() => {
                      void setLanguage(l.code);
                      // Saved on the account too, so it follows you to other devices.
                      if (user) void patch('/account', { language: l.code }).catch(() => {});
                      onClose();
                    }}
                    style={[
                      S.row,
                      S.between,
                      {
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        backgroundColor: active ? tint('#16273B') : C.panel,
                        borderBottomWidth: 1,
                        borderColor: C.line,
                      },
                    ]}
                  >
                    <View style={[S.row, { gap: 12, flex: 1 }]}>
                      <Icon name="language" size={20} color={active ? C.white : C.gray} />
                      <View style={{ flex: 1 }}>
                        <T style={{ fontSize: 15, fontFamily: 'InterBold', color: C.white }}>
                          {l.native !== l.name ? `${l.native} (${l.name})` : l.name}
                        </T>
                        <View style={[S.row, { gap: 6, marginTop: 3 }]}>
                          <Label
                            style={{
                              fontSize: 9,
                              color: active ? tint('#B7D9FF') : C.gray,
                            }}
                          >
                            {l.code.toUpperCase()}
                          </Label>
                          {isTranslated ? (
                            <T style={{ fontSize: 10, color: C.green, fontFamily: 'InterBold' }}>
                              {language === 'pl' ? '✓ Dostępny' : '✓ Available'}
                            </T>
                          ) : (
                            <T style={{ fontSize: 10, color: tint('#FFAA55') }}>
                              {language === 'pl'
                                ? 'Brak tłumaczenia (angielski)'
                                : 'No translation (English)'}
                            </T>
                          )}
                        </View>
                      </View>
                    </View>
                    {active && <Icon name="checkmark-circle" size={20} color={C.blue} />}
                  </Tap>
                );
              })}
              {!matches.length && (
                <T style={{ padding: 20, textAlign: 'center', fontSize: 13 }}>
                  {language === 'pl'
                    ? `Nie znaleziono języka dla „${query}”.`
                    : `No language matches “${query}”.`}
                </T>
              )}
            </ScrollView>
          </View>

          <ClayButton
            title={language === 'pl' ? 'Zamknij' : 'Close'}
            tone="graphite"
            onPress={onClose}
          />
        </Page>
      </View>
    </MobileModal>
  );
}

export function CityModal({
  visible,
  onClose,
  cities,
  cityId,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  cities: any[];
  cityId: string | null;
  onPick: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const matches = useMemo(
    () => (term ? cities.filter((c) => String(c.name).toLowerCase().includes(term)).slice(0, 60) : []),
    [term, cities],
  );
  const selected = cities.find((c) => c.id === cityId);
  const Row = ({
    active,
    icon,
    title,
    sub,
    onPress,
  }: {
    active: boolean;
    icon: string;
    title: string;
    sub?: string;
    onPress: () => void;
  }) => (
    <Tap
      label={title}
      onPress={onPress}
      style={[
        S.row,
        S.between,
        {
          paddingVertical: 14,
          paddingHorizontal: 16,
          backgroundColor: active ? tint('#16273B') : C.panel,
          borderBottomWidth: 1,
          borderColor: C.line,
        },
      ]}
    >
      <View style={[S.row, { gap: 12, flex: 1, minWidth: 0 }]}>
        <Icon name={icon} size={20} color={active ? C.white : C.gray} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T numberOfLines={1} style={{ fontSize: 15, fontFamily: 'InterBold', color: C.white }}>
            {title}
          </T>
          {!!sub && <Label style={{ fontSize: 9, marginTop: 2 }}>{sub}</Label>}
        </View>
      </View>
      {active && <Icon name="checkmark-circle" size={20} color={C.blue} />}
    </Tap>
  );
  return (
    <MobileModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={S.page}>
        <View style={[S.row, { gap: 12, alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 }]}>
          <ClayIconButton icon="arrow-back" label="Go back" onPress={onClose} />
          <T style={{ fontFamily: 'Display', fontSize: 27, lineHeight: 30, color: C.white }}>
            {t('profile.yourCity')}
          </T>
        </View>
        <Page>
          <TextInput
            accessibilityLabel={t('profile.searchCity')}
            value={query}
            onChangeText={setQuery}
            placeholder={t('profile.searchCity')}
            placeholderTextColor={tint('#777D89')}
            autoCorrect={false}
            style={[S.input, { marginTop: 14, marginBottom: 14, backgroundColor: 'transparent', borderWidth: 0 }]}
          />
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: C.line,
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            <ScrollView
              style={{ maxHeight: 460 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <Row
                active={!cityId}
                icon="close-circle-outline"
                title={t('profile.preferNotToSay')}
                onPress={() => onPick(null)}
              />
              {!term && selected && (
                <Row
                  active
                  icon="location"
                  title={selected.name}
                  sub={selected.country_code}
                  onPress={() => onPick(selected.id)}
                />
              )}
              {matches.map((c) => (
                <Row
                  key={c.id}
                  active={cityId === c.id}
                  icon="location-outline"
                  title={c.name}
                  sub={c.country_code}
                  onPress={() => onPick(c.id)}
                />
              ))}
              {!term && (
                <T style={{ padding: 20, textAlign: 'center', fontSize: 13 }}>
                  {t('profile.citySearchHint')}
                </T>
              )}
              {term && !matches.length && (
                <T style={{ padding: 20, textAlign: 'center', fontSize: 13 }}>
                  {t('profile.cityNoMatch', { q: query })}
                </T>
              )}
            </ScrollView>
          </View>
          <ClayButton title={t('profile.close')} tone="graphite" onPress={onClose} />
        </Page>
      </View>
    </MobileModal>
  );
}
