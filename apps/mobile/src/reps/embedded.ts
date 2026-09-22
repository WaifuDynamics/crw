import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { REPS_FILES, REPS_VERSION } from './embeddedFiles';

// The rep counter travels inside the app (scripts/embed-reps.mjs). A WebView needs its
// files side by side in one folder - the page loads ./app.js, the model, the WebAssembly -
// while bundled assets live under hashed names, so the first time Play opens after an
// install or an update they are copied out into a folder of their own.
//
// A folder is only used once a marker says every file made it, so an interrupted copy is
// simply started again next time rather than leaving a half-built counter behind.

let ready: Promise<string> | null = null;

/** The folder the counter lives in on this phone, for the WebView's file access. */
export const embeddedCounterDir = () => new Directory(Paths.document, `reps-${REPS_VERSION}`).uri;

/** The file:// address of the counter's page, copying it out of the app first if needed. */
export function embeddedCounterPage(): Promise<string> {
  ready ??= (async () => {
    const root = new Directory(Paths.document, `reps-${REPS_VERSION}`);
    const done = new File(root, '.complete');
    if (!done.exists) {
      if (root.exists) root.delete();
      root.create({ intermediates: true, idempotent: true });
      for (const [path, asset] of REPS_FILES) {
        const [loaded] = await Asset.loadAsync(asset);
        if (!loaded.localUri) throw new Error(`The counter file ${path} could not be read.`);
        const target = new File(root, ...path.split('/'));
        target.parentDirectory.create({ intermediates: true, idempotent: true });
        await new File(loaded.localUri).copy(target);
      }
      done.create();
      done.write(REPS_VERSION);
      removeOldVersions();
    }
    return new File(root, 'index.html').uri;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Earlier versions of the counter are dead weight once the new one is in place. */
function removeOldVersions() {
  try {
    for (const entry of Paths.document.list()) {
      if (
        entry instanceof Directory &&
        entry.name.startsWith('reps-') &&
        entry.name !== `reps-${REPS_VERSION}`
      )
        entry.delete();
    }
  } catch {
    // Not worth failing the counter over a few old files.
  }
}
