import { clay } from '../claySurface';
import { tint } from '../theme';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { invalidate, post, remove, request, useAction, useData, useSession } from '../api';
import {
  Avatar,
  Button,
  C,
  Header,
  Heading,
  Icon,
  Label,
  Page,
  QueryState,
  S,
  T,
  Tap,
} from '../ui';
import { countryName } from '../countries';
import { useTranslation } from '../translations';
import { errorKey } from '../errors';

// Find people, answer friend requests and see your friends. Friends share a leaderboard
// and see each other's rep records.

type Person = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  country_code?: string | null;
  relation?: 'none' | 'friends' | 'incoming' | 'outgoing';
};

function PersonRow({
  person,
  onOpen,
  children,
}: {
  person: Person;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[S.row, { gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line }]}
    >
      <Tap
        label={`Open ${person.display_name}`}
        onPress={onOpen}
        style={[S.row, { gap: 12, flex: 1, minWidth: 0 }]}
      >
        <Avatar url={person.avatar_url} name={person.display_name} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T numberOfLines={1} style={{ color: C.white, fontFamily: 'InterBold', fontSize: 14 }}>
            {person.display_name}
          </T>
          {!!person.country_code && (
            <T style={{ fontSize: 11 }}>{countryName(person.country_code)}</T>
          )}
        </View>
      </Tap>
      <View style={[S.row, { gap: 8 }]}>{children}</View>
    </View>
  );
}

function SmallButton({
  title,
  onPress,
  variant = 'blue',
  icon,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'blue' | 'dark';
  icon?: string;
  disabled?: boolean;
}) {
  return (
    <Tap
      label={title}
      onPress={onPress}
      disabled={disabled}
      style={[
        S.row,
        {
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: 12,
          backgroundColor: variant === 'blue' ? C.blue : C.panel2,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {icon && <Icon name={icon} size={14} color={variant === 'blue' ? C.onAccent : C.white} />}
      <T
        style={{
          color: variant === 'blue' ? C.onAccent : C.white,
          fontFamily: 'InterBold',
          fontSize: 12,
        }}
      >
        {title}
      </T>
    </Tap>
  );
}

export default function Friends({ navigation }: any) {
  const { user, say } = useSession();
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const lists = useData<{ friends: Person[]; incoming: Person[]; outgoing: Person[] }>(
    '/friends',
    !!user,
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Search as you type, a moment after the last keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await request<{ results: Person[] }>(
          `/friends/search?q=${encodeURIComponent(q)}`,
        );
        if (!cancelled) setResults(r.results);
      } catch (e: any) {
        if (!cancelled) say(t(errorKey(e)), 'error');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const refreshAll = async () => {
    await invalidate();
    if (query.trim().length >= 2) {
      const r = await request<{ results: Person[] }>(
        `/friends/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(r.results);
    }
  };
  const act = (fn: () => Promise<unknown>, message: string) =>
    run(async () => {
      await fn();
      await refreshAll();
      say(message);
    });
  const open = (p: Person) => navigation.navigate('Person', { id: p.id });

  if (!user)
    return (
      <View style={S.page}>
        <Header title={t('friends.title')} onBack={navigation.goBack} />
        <Page>
          <Heading
            style={{ fontFamily: 'DisplayItalic', fontSize: 48, lineHeight: 48, marginTop: 20 }}
          >
            {t('friends.betterWithFriends')}
          </Heading>
          <T style={{ marginTop: 12, marginBottom: 20 }}>{t('friends.signInPrompt')}</T>
          <Button
            title={t('friends.signIn')}
            icon="arrow-forward"
            onPress={() => navigation.navigate('Auth')}
          />
        </Page>
      </View>
    );

  const data = lists.data;
  // Friends are already listed above; the search is for new people.
  const fresh = (results ?? []).filter((p) => p.relation !== 'friends');
  return (
    <View style={S.page}>
      <Header title={t('friends.title')} onBack={navigation.goBack} />
      <Page refresh={lists.refetch} refreshing={lists.isRefetching}>
        <Label style={{ color: C.blue, marginTop: 8 }}>{t('friends.yourCrew')}</Label>
        <Heading
          style={{ fontFamily: 'DisplayItalic', fontSize: 48, lineHeight: 48, marginTop: 8 }}
        >
          {t('friends.betterWithFriends')}
        </Heading>
        <T style={{ fontSize: 12, marginTop: 10, marginBottom: 18 }}>{t('friends.intro')}</T>

        <QueryState query={lists}>
          {data && (
            <>
              {data.incoming.length > 0 && (
                <View style={{ marginTop: 28 }}>
                  <Label style={{ marginBottom: 6 }}>
                    {t('friends.requestsLabel')} · {data.incoming.length}
                  </Label>
                  {data.incoming.map((p) => (
                    <PersonRow key={p.id} person={p} onOpen={() => open(p)}>
                      <SmallButton
                        title={t('friends.accept')}
                        icon="checkmark"
                        disabled={busy}
                        onPress={() =>
                          act(
                            () => post(`/friends/${p.id}/accept`),
                            t('friends.nowFriends', { name: p.display_name }),
                          )
                        }
                      />
                      <SmallButton
                        title={t('friends.decline')}
                        variant="dark"
                        disabled={busy}
                        onPress={() =>
                          act(() => remove(`/friends/${p.id}`), t('friends.requestDeclined'))
                        }
                      />
                    </PersonRow>
                  ))}
                </View>
              )}

              <View style={{ marginTop: 28 }}>
                <Label style={{ marginBottom: 6 }}>
                  {t('friends.friendsLabel')} · {data.friends.length}
                </Label>
                {data.friends.length === 0 ? (
                  <View style={[S.card, { gap: 8, marginTop: 6 }]}>
                    <Icon name="people-outline" size={26} color={C.blue} />
                    <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 14 }}>
                      {t('friends.noFriendsTitle')}
                    </T>
                    <T style={{ fontSize: 12, lineHeight: 18 }}>{t('friends.noFriendsBody')}</T>
                  </View>
                ) : (
                  data.friends.map((p) => (
                    <PersonRow key={p.id} person={p} onOpen={() => open(p)}>
                      <SmallButton
                        title={t('friends.remove')}
                        variant="dark"
                        disabled={busy}
                        onPress={() =>
                          act(
                            () => remove(`/friends/${p.id}`),
                            t('friends.removed', { name: p.display_name }),
                          )
                        }
                      />
                    </PersonRow>
                  ))
                )}
              </View>

              {data.outgoing.length > 0 && (
                <View style={{ marginTop: 28 }}>
                  <Label style={{ marginBottom: 6 }}>
                    {t('friends.sentLabel')} · {data.outgoing.length}
                  </Label>
                  {data.outgoing.map((p) => (
                    <PersonRow key={p.id} person={p} onOpen={() => open(p)}>
                      <SmallButton
                        title={t('friends.cancel')}
                        variant="dark"
                        disabled={busy}
                        onPress={() =>
                          act(() => remove(`/friends/${p.id}`), t('friends.requestCancelled'))
                        }
                      />
                    </PersonRow>
                  ))}
                </View>
              )}
            </>
          )}
        </QueryState>

        {/* Your people first; the search below is only for finding somebody new. */}
        <View style={{ marginTop: 34 }}>
          <Label style={{ marginBottom: 8 }}>{t('friends.findNewPeople')}</Label>
          <View
            style={[
              S.row,
              {
                gap: 10,
                ...clay('graphite', 0.7),
                borderRadius: 14,
                paddingHorizontal: 14,
              },
            ]}
          >
            <Icon name="search" size={18} color={C.gray} />
            <TextInput
              accessibilityLabel={t('friends.searchPlaceholder')}
              value={query}
              onChangeText={setQuery}
              placeholder={t('friends.searchPlaceholder')}
              placeholderTextColor={tint('#777D89')}
              autoCorrect={false}
              autoCapitalize="none"
              style={{ flex: 1, color: C.white, fontFamily: 'Inter', fontSize: 14, minHeight: 50 }}
            />
            {searching && <ActivityIndicator color={C.blue} size="small" />}
          </View>

          {results && (
            <View style={{ marginTop: 10 }}>
              {fresh.length === 0 && !searching && (
                <T style={{ fontSize: 12, paddingVertical: 14 }}>
                  {t('friends.noMatch', { q: query.trim() })}
                </T>
              )}
              {fresh.map((p) => (
                <PersonRow key={p.id} person={p} onOpen={() => open(p)}>
                  {p.relation === 'friends' ? (
                    <Label style={{ color: C.green }}>{t('friends.friendsLabel')}</Label>
                  ) : p.relation === 'outgoing' ? (
                    <SmallButton
                      title={t('friends.requested')}
                      variant="dark"
                      disabled={busy}
                      onPress={() =>
                        act(() => remove(`/friends/${p.id}`), t('friends.requestCancelled'))
                      }
                    />
                  ) : p.relation === 'incoming' ? (
                    <SmallButton
                      title={t('friends.accept')}
                      icon="checkmark"
                      disabled={busy}
                      onPress={() =>
                        act(
                          () => post(`/friends/${p.id}/accept`),
                          t('friends.nowFriends', { name: p.display_name }),
                        )
                      }
                    />
                  ) : (
                    <SmallButton
                      title={t('friends.add')}
                      icon="person-add"
                      disabled={busy}
                      onPress={() =>
                        act(() => post(`/friends/${p.id}`), t('friends.requestSent'))
                      }
                    />
                  )}
                </PersonRow>
              ))}
            </View>
          )}
        </View>
      </Page>
    </View>
  );
}
