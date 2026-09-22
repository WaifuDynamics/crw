import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const svg = await readFile(new URL('../apps/mobile/assets/crw-icon.svg', import.meta.url));
await sharp(svg).resize(1024).png().toFile('apps/mobile/assets/icon.png');
await sharp(svg).resize(64).png().toFile('apps/mobile/assets/favicon.png');
console.log('CRW+ app icons generated from the source vector.');
