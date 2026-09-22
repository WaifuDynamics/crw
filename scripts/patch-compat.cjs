// query-string 7 uses require(function); patched decoder 0.5 exports an ESM default.
// Keep this small compatibility bridge until React Navigation adopts query-string 9.
const fs = require('node:fs');
const path = require.resolve('query-string');
const original = "const decodeComponent = require('decode-uri-component');";
const replacement =
  "const decodeModule = require('decode-uri-component');\nconst decodeComponent = decodeModule.default || decodeModule;";
const source = fs.readFileSync(path, 'utf8');
if (source.includes(original)) fs.writeFileSync(path, source.replace(original, replacement));
else if (!source.includes(replacement))
  throw new Error('query-string changed: review decoder compatibility patch before installing');
const q = require('query-string');
if (q.parse('pace=run%20club').pace !== 'run club')
  throw new Error('URI decoder compatibility check failed');
q.parse('malformed=%C0%AF%FE%FF');
console.log('Patched URI decoder compatibility verified.');
