// On the website the counter is served next to the app itself, from public/reps
// (scripts/embed-reps.mjs), so there is nothing to copy - only an address to open.

export const embeddedCounterDir = () => '';

export async function embeddedCounterPage() {
  return `${window.location.origin}/reps/index.html`;
}
