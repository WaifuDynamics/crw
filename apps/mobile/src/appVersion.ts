// Comparing app versions, kept free of React Native so it can be tested on its own.

/** Whether `version` is older than `than`. "2.10.0" is newer than "2.9.3": numbers, not text. */
export function older(version: string, than: string) {
  const a = version.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const b = than.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
}
