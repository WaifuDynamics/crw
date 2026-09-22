import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyJournal, Journal } from './model';
const key = (owner: string) => `pace.tracking.v1.${owner}`;
let tail: Promise<unknown> = Promise.resolve();
export async function readJournal(owner: string): Promise<Journal> {
  const data = await AsyncStorage.getItem(key(owner));
  return data ? JSON.parse(data) : emptyJournal();
}
export function updateJournal(
  owner: string,
  update: (journal: Journal) => Journal,
): Promise<Journal> {
  const work = tail.then(async () => {
    const journal = update(await readJournal(owner));
    await AsyncStorage.setItem(key(owner), JSON.stringify(journal));
    return journal;
  });
  tail = work.catch(() => {});
  return work;
}
export const ACTIVE_OWNER = 'pace.tracking.active-owner';
