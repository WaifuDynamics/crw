import React, { useState } from 'react';
import { View } from 'react-native';
import GoogleSignIn from '../components/GoogleSignIn';
import AppleSignIn from '../components/AppleSignIn';
import { useOnline } from '../network';
import { useSession, useAction, post } from '../api';
import { t } from '../translations';
import { C, Heading, Label, T, Tap } from '../ui';
import { entry, EntryPage, EntryHeader, EntryButton as ClayButton, EntryField as ClayField } from '../components/Entry';


// The front door: sign in, sign up, forgotten and reset passwords.

export function AuthScreen({ navigation, route }: any) {
  const { devLogin, login, loginWithGoogle, loginWithApple, useSessionToken, register, say } =
    useSession();
  const { busy, run } = useAction();
  const online = useOnline();
  const [mode, setMode] = useState(route.params?.reset ? 'reset' : 'login'),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  // New accounts answer a few questions first; everyone else goes back where they were.
  // As the app's front door (gate) there is nowhere to go back to: once signed in, the app
  // swaps this screen for the tabs, and new accounts are taken to the questions from there.
  const gate = !!route.params?.gate;
  const leave = (me: any) => {
    if (gate || !me) return;
    if (!me.account?.onboarding_completed_at) navigation.replace('Onboarding');
    else navigation.goBack();
  };
  const submit = () =>
    run(async () => {
      if (mode === 'forgot') {
        await post('/auth/forgot', { email });
        say(t('errors.resetSent'), 'success');
        setMode('login');
        return;
      }
      if (mode === 'reset') {
        await post('/auth/reset', { token: route.params.reset, password });
        say(t('errors.passwordUpdated'), 'success');
        setMode('login');
        return;
      }
      leave(
        mode === 'signup' ? await register(name, email, password) : await login(email, password),
      );
    }, 'signin');

  return (
    <EntryPage>
      <EntryHeader onBack={!gate && navigation.canGoBack() ? navigation.goBack : undefined} />
        <View>
          <Label style={entry.eyebrow}>YOUR PEOPLE. YOUR CRW+.</Label>
          <Heading
            style={entry.title}
          >
            {mode === 'signup'
              ? 'MORE LIFE.{\n}STARTS HERE.'.replace('{\n}', '\n')
              : mode === 'forgot'
                ? 'BACK ON TRACK.'
                : mode === 'reset'
                  ? 'A FRESH START.'
                  : 'GOOD TO{\n}HAVE YOU BACK.'.replace('{\n}', '\n')}
          </Heading>
          <T style={[entry.subtitle, { marginBottom: 28 }]}>
            {mode === 'signup'
              ? 'Find your community, book your next experience, and make movement part of your life.'
              : mode === 'forgot'
                ? 'We’ll email you a secure reset link.'
                : 'Sign in to turn a little inspiration into real plans.'}
          </T>
        </View>
        {(mode === 'login' || mode === 'signup') && (
          <AppleSignIn
            onCredential={(result) =>
              run(async () => {
                leave(
                  'sessionToken' in result
                    ? await useSessionToken(result.sessionToken)
                    : await loginWithApple(result.credential, result.firstName, result.lastName),
                );
              })
            }
            onError={(m: string) => say(m, 'error')}
          />
        )}
        {(mode === 'login' || mode === 'signup') && (
          <GoogleSignIn
            onCredential={(credential) =>
              run(async () => {
                leave(await loginWithGoogle(credential));
              })
            }
            onError={(m: string) => say(m, 'error')}
          />
        )}
        {__DEV__ && mode === 'login' && (
          <ClayButton
            title="Continue as demo"
            variant="outline"
            loading={busy}
            onPress={() => run(async () => leave(await devLogin()))}
            style={{ marginBottom: 15 }}
          />
        )}
        {mode === 'signup' && (
          <ClayField
            label="Your name"
            value={name}
            onChange={setName}
            placeholder="What should we call you?"
          />
        )}
        {mode !== 'reset' && (
          <ClayField
            label="Email"
            value={email}
            onChange={setEmail}
            keyboardType="email-address"
            placeholder="you@example.com"
          />
        )}
        {mode !== 'forgot' && (
          <ClayField
            label={
              mode === 'signup' || mode === 'reset'
                ? 'Password · at least 12 characters'
                : 'Password'
            }
            value={password}
            onChange={setPassword}
            secure
            placeholder="Your password"
          />
        )}
        <ClayButton
          title={
            mode === 'signup'
              ? 'Find my people'
              : mode === 'forgot'
                ? 'Send reset link'
                : mode === 'reset'
                  ? 'Set new password'
                  : 'Let’s get moving'
          }
          loading={busy}
          onPress={submit}
          icon="arrow-forward"
        />
        {mode === 'login' && (
          <Tap onPress={() => setMode('forgot')} style={{ padding: 18, alignItems: 'center' }}>
            <T style={{ fontSize: 12 }}>Forgot your password?</T>
          </Tap>
        )}
        <ClayButton
          title={
            mode === 'signup' ? 'Already part of the crew? Sign in' : 'New here? Create an account'
          }
          variant="outline"
          onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}
          style={{ marginTop: 15 }}
        />
        {!online && (
          <T style={{ marginTop: 16, fontSize: 12, textAlign: 'center', color: '#FFD18B' }}>
            You’re offline. Signing in and creating an account need an internet connection.
          </T>
        )}
        <T
          style={{
            marginTop: 18,
            marginBottom: 12,
            fontSize: 11,
            lineHeight: 17,
            textAlign: 'center',
          }}
        >
          By continuing you agree to the{' '}
          <T
            style={{ fontSize: 11, color: C.blue, fontFamily: 'InterBold' }}
            onPress={() => navigation.navigate('Legal', { id: 'terms' })}
          >
            Terms of Service
          </T>{' '}
          and confirm you have read the{' '}
          <T
            style={{ fontSize: 11, color: C.blue, fontFamily: 'InterBold' }}
            onPress={() => navigation.navigate('Legal', { id: 'privacy' })}
          >
            Privacy Policy
          </T>
          . You’ll confirm them once more after signing in.
        </T>
    </EntryPage>
  );
}
// Notifications moved here from the Discover header; the count matches the badge on
// the profile button of every tab.
