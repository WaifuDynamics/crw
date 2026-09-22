import { mkdir, readFile, copyFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
await mkdir('apps/api/public/demo', { recursive: true });
const photos = [
  'photo-1552674605-db6ffd4facb5',
  'photo-1476480862126-209bfaa8edc8',
  'photo-1551632811-561732d1e306',
  'photo-1622279457486-62dcc4a431d6',
  'photo-1506126613408-eca07ce68773',
  'photo-1544191696-15693072a251',
  'photo-1538805060514-97d9cc17730c',
];
const jobs = [
  ...photos.map((p) => ({
    name: `${p}.jpg`,
    url: `https://images.unsplash.com/${p === 'photo-1544191696-15693072a251' ? 'photo-1681295691548-b4dbfbed933b' : p}?auto=format&fit=crop&w=1200&q=85`,
  })),
  ...[12, 47, 11, 49, 13, 44, 14, 48, 15, 45, 33, 43].map((n) => ({
    name: `avatar-${n}.jpg`,
    url: `https://i.pravatar.cc/160?img=${n}`,
  })),
];
let next = 0;
const failures = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++],
        path = `apps/api/public/demo/${job.name}`;
      try {
        const file = await readFile(path);
        if (file.length > 100 && file.at(-2) === 255 && file.at(-1) === 217) continue;
      } catch {}
      try {
        await run(process.platform === 'win32' ? 'curl.exe' : 'curl', [
          '-f',
          '-s',
          '-L',
          '--max-time',
          '50',
          '--retry',
          '1',
          job.url,
          '-o',
          path + '.download',
        ]);
        await copyFile(path + '.download', path);
        await unlink(path + '.download');
        console.log('Cached', job.name);
      } catch {
        failures.push(job.name);
      }
    }
  }),
);
if (failures.length) {
  console.error('Could not cache:', failures.join(', '));
  process.exitCode = 1;
}
