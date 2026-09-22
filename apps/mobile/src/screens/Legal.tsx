import React, { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { patch, post, useAction, useSession } from '../api';
import { LEGAL_DOCUMENTS, LEGAL_VERSION, legalDocument } from '../legal/documents';
import { useOnline } from '../network';
import { Button, C, Header, Heading, Icon, Label, Page, S, T, Tap } from '../ui';
import { entry, EntryPage, EntryHeader, EntryButton, EntryToggle } from '../components/Entry';

// The legal documents inside the app, and the confirmation every account gives once per
// version of the documents (after signing in, before anything else).

/** The small subset of Markdown the legal pack uses: ## headings, bullets, **bold**. */
function Rich({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <T style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <T key={i} style={[style, { fontFamily: 'InterBold', color: C.white }]}>
            {p.slice(2, -2)}
          </T>
        ) : (
          p
        ),
      )}
    </T>
  );
}

export function LegalBody({ body }: { body: string }) {
  const blocks: React.ReactNode[] = [];
  body.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) return;
    const heading = /^#{2,3}\s+(.*)$/.exec(line);
    const bullet = /^\s*(?:•|-|\*)\s+(.*)$/.exec(line);
    if (heading)
      blocks.push(
        <Heading key={i} style={{ fontSize: 22, lineHeight: 26, marginTop: 22, marginBottom: 6 }}>
          {heading[1]}
        </Heading>,
      );
    else if (bullet)
      blocks.push(
        <View key={i} style={[S.row, { alignItems: 'flex-start', gap: 8, marginBottom: 6 }]}>
          <T style={{ fontSize: 14, lineHeight: 22, color: C.blue }}>•</T>
          <Rich text={bullet[1]} style={{ flex: 1, fontSize: 14, lineHeight: 22 }} />
        </View>,
      );
    else
      blocks.push(
        <Rich key={i} text={line} style={{ fontSize: 14, lineHeight: 22, marginBottom: 10 }} />,
      );
  });
  return <View>{blocks}</View>;
}

const PUBLIC_BASE = process.env.EXPO_PUBLIC_APP_URL || 'https://sport.konekocode.pl';

/** One document, or the list of all of them when no id is given. */
export function LegalScreen({ navigation, route }: any) {
  const doc = route?.params?.id ? legalDocument(route.params.id) : null;
  return (
    <View style={S.page}>
      <Header
        title={doc ? '' : 'LEGAL'}
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />
      <Page>
        {doc ? (
          <>
            <Label style={{ color: C.blue }}>CRW+ · LAST UPDATED {doc.updated.toUpperCase()}</Label>
            <Heading style={{ fontSize: 40, lineHeight: 42, marginTop: 8, marginBottom: 12 }}>
              {doc.title}
            </Heading>
            <LegalBody body={doc.body} />
            <Button
              title="Open on the web"
              icon="open-outline"
              variant="outline"
              style={{ marginTop: 20 }}
              onPress={() => void Linking.openURL(`${PUBLIC_BASE}/legal/${doc.id}.html`)}
            />
          </>
        ) : (
          <View style={{ gap: 10, marginTop: 6 }}>
            {LEGAL_DOCUMENTS.map((d) => (
              <Tap
                key={d.id}
                label={d.title}
                onPress={() => navigation.push('Legal', { id: d.id })}
                style={[S.card, S.between, { paddingVertical: 16 }]}
              >
                <View style={{ flex: 1 }}>
                  <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 15 }}>{d.title}</T>
                  <T style={{ fontSize: 11 }}>Last updated {d.updated}</T>
                </View>
                <Icon name="chevron-forward" size={18} color={C.gray} />
              </Tap>
            ))}
          </View>
        )}
      </Page>
    </View>
  );
}

function Check({
  on,
  onToggle,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tap
      label={typeof children === 'string' ? children : 'Confirm'}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onToggle}
      style={[S.row, { alignItems: 'flex-start', gap: 22, paddingVertical: 16 }]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: on ? C.blue : C.gray,
          backgroundColor: on ? C.blue : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {on && <Icon name="checkmark" size={16} color="#FFFFFF" />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Tap>
  );
}

/** Shown after signing in until the current version of the documents is accepted. */
export function ConsentScreen({ navigation }: any) {
  const { refresh, logout, say } = useSession();
  const { busy, run } = useAction();
  const online = useOnline();
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const open = (id: string) => navigation.navigate('Legal', { id });
  const link = (id: string, text: string, size = 14) => (
    <T onPress={() => open(id)} style={{ color: C.blue, fontFamily: 'InterBold', fontSize: size }}>
      {text}
    </T>
  );
  const accept = () =>
    run(async () => {
      await post('/account/legal', {
        version: LEGAL_VERSION,
        ageConfirmed: true,
        platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
      });
      if (marketing) await patch('/account', { marketingOptIn: true }).catch(() => {});
      await refresh();
      say('Thanks - welcome to CRW+.');
    });
  return (
    <EntryPage>
        <EntryHeader />
        <Label style={entry.eyebrow}>BEFORE YOU START</Label>
        <Heading style={entry.title}>A FEW{'\n'}GROUND RULES.</Heading>
        <T style={[entry.subtitle, { marginBottom: 0 }]}>
          CRW+ records workouts, routes and, if connected, health data. Review and confirm below.
        </T>
        <Label style={entry.section}>REQUIRED</Label>
        <View style={[entry.panel, { paddingVertical: 4 }]}>
          <Check on={age} onToggle={() => setAge(!age)}>
            <T style={{ fontSize: 14, lineHeight: 20, color: C.white }}>
              I am 13 or older (or the older age my country requires), with a parent's or guardian's consent where needed.
            </T>
          </Check>
          <View style={{ height: 1, backgroundColor: C.line }} />
          <Check on={terms} onToggle={() => setTerms(!terms)}>
            <T style={{ fontSize: 14, lineHeight: 20, color: C.white }}>
              I agree to the {link('terms', 'Terms of Service')} and the{' '}
              {link('guidelines', 'Community Guidelines')}, and I have read the{' '}
              {link('privacy', 'Privacy Policy')}.
            </T>
          </Check>
        </View>
        <Label style={entry.section}>OPTIONAL</Label>
        <EntryToggle title="Daily ideas & offers" description="Send me the daily CRW+ email. Unsubscribe anytime." value={marketing} onChange={setMarketing} />
        <View style={[S.row, { flexWrap: 'wrap', gap: 10, marginVertical: 22 }]}>
          {link('location-health', 'Location & health data', 11)}
          {link('health-disclaimer', 'Health disclaimer', 11)}
          {link('deletion', 'Deleting your data', 11)}
        </View>
        <View style={[entry.panel, S.row, { gap: 16, paddingVertical: 12 }]}>
          <Icon name="mail-outline" color={C.gray} size={23} />
          <View style={{ width: 1, height: 23, backgroundColor: C.line }} />
          <T style={{ flex: 1, fontSize: 12 }}>Verify your email before booking.</T>
        </View>
        {!online && <T style={{ marginTop: 14, fontSize: 12, color: C.error }}>You're offline. Confirming needs an internet connection.</T>}
        <EntryButton title="Agree and continue" icon="arrow-forward" disabled={!age || !terms || !online} loading={busy} onPress={accept} style={{ marginTop: 16 }} />
        <T style={{ textAlign: 'center', fontSize: 11, marginTop: 9, marginBottom: 10 }}>
          {age && terms ? 'You’re ready to continue.' : 'Confirm both required items to continue.'}
        </T>
        <EntryButton title="I don’t agree — sign out" variant="outline" onPress={() => run(logout)} />
    </EntryPage>
  );
}
