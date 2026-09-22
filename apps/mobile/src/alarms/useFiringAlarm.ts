import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { CrwAlarm } from '../../modules/crw-alarm';
import { loadAlarms, syncToNative } from './store';
import type { Alarm } from './model';

// Whether an alarm is ringing right now, and which one.
//
// Two ways of finding out, because both happen. The app is usually not running when the
// alarm goes off, so on a cold start it asks the native module what it stored before
// JavaScript existed. When the app does happen to be open, the module sends an event.

export function useFiringAlarm(): { alarm: Alarm | null; dismiss: () => void } {
  const [alarm, setAlarm] = useState<Alarm | null>(null);

  const check = useCallback(async () => {
    if (!CrwAlarm.available) return;
    const id = await CrwAlarm.firingAlarmId().catch(() => null);
    if (!id) return;
    const alarms = await loadAlarms();
    const found = alarms.find((a) => a.id === id);
    if (found) setAlarm(found);
  }, []);

  useEffect(() => {
    if (!CrwAlarm.available) return;

    // Re-arm from what is stored. Harmless when nothing changed, and it repairs the case
    // where the alarms were written by a build that had no native module yet.
    void loadAlarms().then(syncToNative);
    void check();

    const fired = CrwAlarm.onFire(() => void check());
    // An alarm that rang, gave up and went quiet while the app was in the background
    // should not greet the user with a ring screen on the way back in.
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void CrwAlarm.firingAlarmId()
        .then((id) => {
          if (!id) setAlarm(null);
          else void check();
        })
        .catch(() => {});
    });

    return () => {
      fired.remove();
      app.remove();
    };
  }, [check]);

  const dismiss = useCallback(() => setAlarm(null), []);

  return { alarm, dismiss };
}
