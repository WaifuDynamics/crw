const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The rep counter ships inside the app (scripts/embed-reps.mjs): its pose model, its
// WebAssembly and its page files travel as plain assets that the app copies out to disk
// and opens in a WebView, never compiled into the app's own code.
config.resolver.assetExts.push('txt', 'wasm', 'task');

module.exports = config;
