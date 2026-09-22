#!/usr/bin/env node
// Adjusts the generated native projects (after `expo prebuild`) for release builds in CI.
//
//   node scripts/release/prepare-native.mjs android
//     Signs release builds with the keystore at $CRW_KEYSTORE_PATH when set
//     (passwords from CRW_KEYSTORE_PASSWORD, CRW_KEY_ALIAS, CRW_KEY_PASSWORD, read by
//     Gradle at build time, so they are never written to disk), and gives Gradle memory.
//
//   node scripts/release/prepare-native.mjs ios
//     Switches the app target to manual signing with $IOS_TEAM_ID and
//     $IOS_PROFILE_NAME. Only the app project is touched; the Pods project keeps its
//     defaults.
//
// Prints what it did; exits non-zero when the expected project files are missing.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const app = fileURLToPath(new URL('../..', import.meta.url));
const read = (p) => readFileSync(join(app, p), 'utf8');
const write = (p, s) => writeFileSync(join(app, p), s);

function android() {
  const gradlePath = 'android/app/build.gradle';
  if (!existsSync(join(app, gradlePath))) throw new Error('android/ not found - run expo prebuild first');
  let gradle = read(gradlePath);

  if (process.env.CRW_KEYSTORE_PATH) {
    if (!gradle.includes('crw-release-signing')) {
      const release = `        release {
            // crw-release-signing: added by scripts/release/prepare-native.mjs
            storeFile file(System.getenv('CRW_KEYSTORE_PATH'))
            storePassword System.getenv('CRW_KEYSTORE_PASSWORD')
            keyAlias System.getenv('CRW_KEY_ALIAS')
            keyPassword System.getenv('CRW_KEY_PASSWORD')
        }
        debug {`;
      const before = gradle;
      gradle = gradle.replace(/^ {8}debug \{/m, release);
      gradle = gradle.replace(
        /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
        '$1signingConfig signingConfigs.release',
      );
      if (gradle === before || !/buildTypes[\s\S]*signingConfig signingConfigs\.release/.test(gradle))
        throw new Error('Could not switch the release build type to the release signing config');
    }
    console.log('android: release builds signed with the CRW+ keystore');
  } else {
    console.log('android: CRW_KEYSTORE_PATH not set - release builds use the public debug key');
  }
  write(gradlePath, gradle);

  const propsPath = 'android/gradle.properties';
  let props = read(propsPath);
  // 6g suits a CI runner that has the machine to itself. A laptop running an editor and
  // a browser does not, and the build dies rather than swapping, so the heap is settable.
  const heap = process.env.CRW_GRADLE_HEAP || '6g';
  props = props.replace(/^org\.gradle\.jvmargs=.*$/m, `org.gradle.jvmargs=-Xmx${heap} -XX:MaxMetaspaceSize=1536m`);
  // How many tasks Gradle runs at once. Left alone this follows the core count, and on a
  // 12-core machine that means a dozen parallel C++ compilers at roughly 180 MB each -
  // a multi-gigabyte spike on top of the heap above, which is what runs a laptop out of
  // memory mid-build. CMAKE_BUILD_PARALLEL_LEVEL caps the C++ side and is passed through
  // the environment by scripts/release/local-android.mjs.
  // org.gradle.jvmargs governs the Gradle daemon only. Kotlin compiles in a second
  // JVM with a heap of its own, so capping one and not the other left two processes
  // of much the same size running side by side - which is what still ran the machine
  // out of memory after the Gradle heap had already been halved. Compiling in-process
  // reuses the daemon above rather than starting that second JVM at all.
  if (process.env.CRW_KOTLIN_IN_PROCESS !== '0') {
    props = props.replace(/^kotlin\.compiler\.execution\.strategy=.*\r?\n?/m, '');
    props += `\nkotlin.compiler.execution.strategy=in-process\n`;
    console.log('android: Kotlin compiles inside the Gradle daemon, not a second JVM');
  }

  if (process.env.CRW_BUILD_JOBS) {
    const jobs = Number(process.env.CRW_BUILD_JOBS);
    props = props.replace(/^org\.gradle\.workers\.max=.*\r?\n?/m, '');
    props += `\norg.gradle.workers.max=${jobs}\n`;
    console.log(`android: at most ${jobs} tasks at once, Gradle heap ${heap}`);
  } else {
    console.log(`android: Gradle heap ${heap}, parallelism left to Gradle`);
  }
  if (process.env.CRW_ANDROID_ABIS)
    props = props.replace(/^reactNativeArchitectures=.*$/m, `reactNativeArchitectures=${process.env.CRW_ANDROID_ABIS}`);
  write(propsPath, props);
}

function ios() {
  const ws = readdirSync(join(app, 'ios')).find((f) => f.endsWith('.xcworkspace'));
  const proj = readdirSync(join(app, 'ios')).find((f) => f.endsWith('.xcodeproj') && f !== 'Pods.xcodeproj');
  if (!ws || !proj) throw new Error('ios/ workspace not found - run expo prebuild first');
  const name = ws.replace(/\.xcworkspace$/, '');
  console.log(`ios: workspace=${ws} scheme=${name}`);

  const team = process.env.IOS_TEAM_ID;
  const profile = process.env.IOS_PROFILE_NAME;
  if (!team || !profile) {
    console.log('ios: IOS_TEAM_ID / IOS_PROFILE_NAME not set - signing left unchanged');
    return name;
  }
  const pbxPath = `ios/${proj}/project.pbxproj`;
  let pbx = read(pbxPath);
  let touched = 0;
  // Every build configuration of the app target carries PRODUCT_BUNDLE_IDENTIFIER.
  pbx = pbx.replace(/(buildSettings = \{)([^{}]*PRODUCT_BUNDLE_IDENTIFIER = [^;]+;[^{}]*)(\};)/g, (all, open, body, close) => {
    touched++;
    const cleaned = body
      .replace(/\n\s*CODE_SIGN_STYLE = [^;]+;/g, '')
      .replace(/\n\s*DEVELOPMENT_TEAM = [^;]+;/g, '')
      .replace(/\n\s*PROVISIONING_PROFILE_SPECIFIER = [^;]+;/g, '')
      .replace(/\n\s*"?CODE_SIGN_IDENTITY(\[sdk=iphoneos\*\])?"? = [^;]+;/g, '')
      .replace(/\s*$/, '\n');
    return `${open}${cleaned}\t\t\t\tCODE_SIGN_STYLE = Manual;\n\t\t\t\tDEVELOPMENT_TEAM = ${team};\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${profile}";\n\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Distribution";\n\t\t\t${close}`;
  });
  if (!touched) throw new Error('No app build configurations found in project.pbxproj');
  write(pbxPath, pbx);
  console.log(`ios: manual signing set on ${touched} build configurations`);
  return name;
}

const target = process.argv[2];
try {
  if (target === 'android') android();
  else if (target === 'ios') ios();
  else {
    console.error('usage: prepare-native.mjs android|ios');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
