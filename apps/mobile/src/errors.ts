// What the user is told when something fails.
//
// Never the server's own words. Those are written for developers, they arrive only in
// English, and validation failures come back as one long run-on sentence listing every
// field at once. So nothing from the wire reaches the screen: the HTTP status picks one
// of our own short lines, and that line is translated like everything else.

export type ErrorContext = 'signin' | undefined;

/**
 * The translation key for whatever went wrong. `context` exists because 401 means two
 * different things: the password was wrong on the way in, or the session ran out later.
 */
export function errorKey(error: any, context?: ErrorContext): string {
  // The flag OfflineError carries (see network.ts). Read directly rather than through
  // isOfflineError, so this module pulls in no React Native code and stays testable.
  if (error?.offline) return 'errors.offline';

  const status = Number(error?.status);
  if (!Number.isFinite(status)) return 'errors.generic';

  if (status === 400 || status === 422) return 'errors.invalid';
  if (status === 401) return context === 'signin' ? 'errors.signIn' : 'errors.session';
  if (status === 403) return 'errors.noAccess';
  if (status === 404) return 'errors.notFound';
  if (status === 409) return 'errors.conflict';
  if (status === 413) return 'errors.tooLarge';
  if (status === 429) return 'errors.tooMany';
  if (status >= 500) return 'errors.server';
  return 'errors.generic';
}
