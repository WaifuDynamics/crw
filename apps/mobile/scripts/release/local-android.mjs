#!/usr/bin/env node
// Builds the Android release on this machine - the same steps the GitHub workflow took,
// for when there are no Actions minutes left - and signs it with the release key, so it
// installs over any earlier CRW+ build as an ordinary update.
//
//   node scripts/release/local-android.mjs            # the version in package.json
//   node scripts/release/local-android.mjs 2.7.0      # set the version first
//
// Writes dist-release/crw-plus-<version>-android.apk and .aab. Publishing them is a separate
// step (`gh release create`), which does not use Actions minutes.
//
// Needs, on this machine: JDK 17 (JAVA_HOME, or ~/.jdks/jdk-17*), the Android SDK
// (ANDROID_HOME, or %LOCALAPPDATA%/Android/Sdk), and the release key in ~/.crw
// (crw-release.jks and android-signing.properties). Passwords are passed to Gradle
// through the environment and never printed.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { cpus, homedir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../..', import.meta.url));
const windows = process.platform === 'win32';
const node = process.execPath;

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: app, stdio: 'inherit', shell: windows, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
};

// --- version
if (process.argv[2]) run(node, ['scripts/release/version.mjs', 'set', process.argv[2]]);
const version = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).version;
console.log(`\nCRW+ ${version} for Android\n`);

// --- toolchain
const env = { ...process.env };
if (!env.JAVA_HOME || !existsSync(join(env.JAVA_HOME, 'bin'))) {
  const jdks = join(homedir(), '.jdks');
  const jdk = existsSync(jdks) && readdirSync(jdks).find((d) => d.startsWith('jdk-17'));
  if (!jdk) throw new Error('Set JAVA_HOME to a JDK 17 (the build does not run on newer ones).');
  env.JAVA_HOME = join(jdks, jdk);
}
const SEP = windows ? ';' : ':';
// Gradle runs `node` itself while evaluating settings.gradle (Expo autolinking), so
// the Node that started this script has to be on the PATH it inherits - a shell
// without it gets through prebuild and then fails to start the process.
const nodeDir = dirname(node);
env.PATH = [join(env.JAVA_HOME, 'bin'), nodeDir, env.PATH].filter(Boolean).join(SEP);
env.ANDROID_HOME ??= join(process.env.LOCALAPPDATA || join(homedir(), 'Library'), 'Android', 'Sdk');
env.ANDROID_SDK_ROOT ??= env.ANDROID_HOME;

// --- the app's public configuration, from the production profile in eas.json
const appEnv = execFileSync(node, ['scripts/release/app-env.mjs', 'production'], {
  cwd: app,
  encoding: 'utf8',
});
for (const line of appEnv.split(/\r?\n/)) {
  const at = line.indexOf('=');
  if (at > 0) env[line.slice(0, at)] = line.slice(at + 1);
}
env.NODE_ENV = 'production';
env.CI = '1';
env.CRW_ANDROID_ABIS = 'arm64-v8a,armeabi-v7a';

// This machine is not a CI runner: it is also running the editor this was started from.
// Left to itself Gradle takes a 6 GB heap and CMake starts one C++ compiler per core -
// on 12 cores that is another ~2.5 GB in seconds - and the build is killed rather than
// swapping. Capping both trades minutes for a build that finishes. Override either by
// setting it before running.
const cores = Math.max(1, cpus().length);
env.CRW_GRADLE_HEAP ??= '3g';
env.CRW_BUILD_JOBS ??= String(Math.max(2, Math.min(4, Math.floor(cores / 3))));
// ninja reads this; without it the C++ compilation ignores the Gradle worker limit.
env.CMAKE_BUILD_PARALLEL_LEVEL ??= env.CRW_BUILD_JOBS;
console.log(
  `Build limits: heap ${env.CRW_GRADLE_HEAP}, ${env.CRW_BUILD_JOBS} parallel jobs (${cores} cores)`,
);

// --- the release key
const keys = join(homedir(), '.crw');
const props = Object.fromEntries(
  readFileSync(join(keys, 'android-signing.properties'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const store = props.storeFile && existsSync(props.storeFile) ? props.storeFile : join(keys, 'crw-release.jks');
if (!existsSync(store)) throw new Error(`No release key at ${store}`);
env.CRW_KEYSTORE_PATH = store;
env.CRW_KEYSTORE_PASSWORD = props.storePassword;
env.CRW_KEY_ALIAS = props.keyAlias;
env.CRW_KEY_PASSWORD = props.keyPassword;

// --- build
run(node, ['scripts/embed-reps.mjs'], { env });
// --clean: a native project left over from local experiments must not end up in a release.
// Expo's CLI is resolved and run with this Node rather than through npx: npm is on
// PATH in a plain PowerShell but npx is not always, and the build failed there with
// "'npx' is not recognized" before it had compiled anything.
const expoCli = createRequire(import.meta.url).resolve('expo/bin/cli');
run(node, [expoCli, 'prebuild', '--platform', 'android', '--clean', '--no-install'], { env });
run(node, ['scripts/release/prepare-native.mjs', 'android'], { env });
const android = join(app, 'android');
// The full path: a shell does not always look in the working directory first.
const gradle = join(android, windows ? 'gradlew.bat' : 'gradlew');
// One artifact at a time, as in the workflow: both at once can run the machine out of memory.
run(gradle, ['assembleRelease', '--no-daemon', '--console=plain'], { cwd: android, env });
run(gradle, ['bundleRelease', '--no-daemon', '--console=plain'], { cwd: android, env });

// --- collect
const out = join(app, 'dist-release');
mkdirSync(out, { recursive: true });
const built = join(android, 'app', 'build', 'outputs');
const apk = join(out, `crw-plus-${version}-android.apk`);
const aab = join(out, `crw-plus-${version}-android.aab`);
copyFileSync(join(built, 'apk', 'release', 'app-release.apk'), apk);
copyFileSync(join(built, 'bundle', 'release', 'app-release.aab'), aab);
console.log(`\nDone:\n  ${apk}\n  ${aab}\n`);
