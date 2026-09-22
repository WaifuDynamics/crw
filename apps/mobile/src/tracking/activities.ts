import { DEFAULT_WEIGHT_KG } from './calories';

// The workouts CRW+ can record, and what differs between them: how calories are estimated,
// which speeds are believable from GPS, whether distance means anything at all, whether
// speed or pace is shown, and how the workout is written to Health Connect.
//
// Four of them are on the start screen. The rest live behind "More", grouped, and work the
// same way: the ones that move over ground measure distance from GPS and price calories by
// speed, and the ones that do not are timed and priced by a fixed MET from the Compendium
// of Physical Activities.

export type ActivityGroup = 'outdoors' | 'gym' | 'sports' | 'water' | 'snow';

export type Activity = {
  id: string;
  /** Stored on the run and sent to the server (English, stable). */
  name: string;
  /** MaterialCommunityIcons glyph. */
  icon: string;
  emoji: string;
  /** Health Connect ExerciseSessionRecord.EXERCISE_TYPE_*. */
  healthConnectType: number;
  /** Faster than this between two GPS fixes is noise (m/s). */
  maxSpeed: number;
  /** Speed in km/h rather than minutes per kilometre. */
  showSpeed: boolean;
  /** Short noun for titles: "Morning ride". */
  noun: string;
  /** Whether the ground covered is worth measuring. An indoor workout is timed instead. */
  tracksDistance: boolean;
  /** Fixed MET, for the workouts whose cost does not follow GPS speed. */
  met?: number;
  /** One of the four on the start screen. */
  primary?: boolean;
  group: ActivityGroup;
};

/** Everything that is not one of the four, in the order the list shows it. */
const move = (
  id: string,
  name: string,
  icon: string,
  emoji: string,
  healthConnectType: number,
  met: number,
  group: ActivityGroup,
  extra: Partial<Activity> = {},
): Activity => ({
  id,
  name,
  icon,
  emoji,
  healthConnectType,
  met,
  group,
  maxSpeed: 12,
  showSpeed: false,
  noun: name.toLowerCase(),
  tracksDistance: false,
  ...extra,
});

/** A workout that covers ground: distance from GPS, speed shown in km/h. */
const travels = (maxSpeed: number, showSpeed = true): Partial<Activity> => ({
  tracksDistance: true,
  maxSpeed,
  showSpeed,
});

export const ACTIVITIES: Activity[] = [
  {
    id: 'running',
    name: 'Running',
    icon: 'run-fast',
    emoji: '🏃',
    healthConnectType: 56,
    maxSpeed: 12,
    showSpeed: false,
    noun: 'run',
    tracksDistance: true,
    primary: true,
    group: 'outdoors',
  },
  {
    id: 'walking',
    name: 'Walking',
    icon: 'walk',
    emoji: '🚶',
    healthConnectType: 79,
    maxSpeed: 6,
    showSpeed: false,
    noun: 'walk',
    tracksDistance: true,
    primary: true,
    group: 'outdoors',
  },
  {
    id: 'hiking',
    name: 'Hiking',
    icon: 'hiking',
    emoji: '🥾',
    healthConnectType: 37,
    maxSpeed: 6,
    showSpeed: false,
    noun: 'hike',
    tracksDistance: true,
    primary: true,
    group: 'outdoors',
  },
  {
    id: 'cycling',
    name: 'Cycling',
    icon: 'bike',
    emoji: '🚴',
    healthConnectType: 8,
    maxSpeed: 25,
    showSpeed: true,
    noun: 'ride',
    tracksDistance: true,
    primary: true,
    group: 'outdoors',
  },

  // Outdoors, on the move.
  move('trailRunning', 'Trail running', 'run', '⛰️', 56, 0, 'outdoors', {
    ...travels(10, false),
    noun: 'trail run',
  }),
  move('mountainBiking', 'Mountain biking', 'bike-fast', '🚵', 8, 0, 'outdoors', {
    ...travels(20),
    noun: 'ride',
  }),
  move('rollerSkating', 'Roller skating', 'roller-skate', '🛼', 60, 7.5, 'outdoors', travels(15)),
  move('skateboarding', 'Skateboarding', 'skateboard', '🛹', 60, 5.0, 'outdoors', travels(15)),
  move('horseRiding', 'Horse riding', 'horse', '🏇', 0, 5.5, 'outdoors', travels(15)),
  move('golf', 'Golf', 'golf', '⛳', 32, 4.8, 'outdoors', travels(5, false)),
  move(
    'wheelchair',
    'Wheelchair',
    'wheelchair-accessibility',
    '♿',
    82,
    3.5,
    'outdoors',
    travels(12),
  ),
  move('stairClimbing', 'Stair climbing', 'stairs-up', '🪜', 68, 8.8, 'outdoors'),

  // Gym and studio: timed, not measured.
  move('strength', 'Strength training', 'dumbbell', '🏋️', 70, 5.0, 'gym'),
  move('weightlifting', 'Weightlifting', 'weight-lifter', '🏋️', 81, 6.0, 'gym'),
  move('calisthenics', 'Calisthenics', 'human-handsup', '🤸', 13, 3.8, 'gym'),
  move('hiit', 'HIIT', 'lightning-bolt', '⚡', 36, 8.0, 'gym'),
  move('bootcamp', 'Bootcamp', 'whistle', '🥵', 10, 8.0, 'gym'),
  move('exerciseClass', 'Exercise class', 'account-group', '🧑‍🏫', 26, 5.0, 'gym'),
  move('treadmill', 'Treadmill', 'run', '🏃', 57, 8.3, 'gym'),
  move('indoorCycling', 'Indoor cycling', 'bike', '🚲', 9, 7.0, 'gym'),
  move('elliptical', 'Elliptical', 'ski-cross-country', '🏃', 25, 5.0, 'gym'),
  move('rowingMachine', 'Rowing machine', 'rowing', '🚣', 54, 7.0, 'gym'),
  move('stairMachine', 'Stair machine', 'stairs', '🪜', 69, 9.0, 'gym'),
  move('jumpRope', 'Jump rope', 'jump-rope', '🪢', 0, 12.3, 'gym'),
  move('yoga', 'Yoga', 'meditation', '🧘', 83, 3.0, 'gym'),
  move('pilates', 'Pilates', 'yoga', '🤸', 48, 3.0, 'gym'),
  move('stretching', 'Stretching', 'human-handsdown', '🙆', 71, 2.3, 'gym'),
  move('dancing', 'Dancing', 'dance-ballroom', '💃', 16, 5.5, 'gym'),
  move('gymnastics', 'Gymnastics', 'gymnastics', '🤸', 34, 3.8, 'gym'),
  move('climbing', 'Climbing', 'terrain', '🧗', 51, 8.0, 'gym'),

  // Sports.
  move('football', 'Football', 'soccer', '⚽', 64, 7.0, 'sports'),
  move('basketball', 'Basketball', 'basketball', '🏀', 5, 6.5, 'sports'),
  move('volleyball', 'Volleyball', 'volleyball', '🏐', 78, 4.0, 'sports'),
  move('handball', 'Handball', 'handball', '🤾', 35, 8.0, 'sports'),
  move('tennis', 'Tennis', 'tennis', '🎾', 76, 7.3, 'sports'),
  move('tableTennis', 'Table tennis', 'table-tennis', '🏓', 75, 4.0, 'sports'),
  move('badminton', 'Badminton', 'badminton', '🏸', 2, 5.5, 'sports'),
  move('squash', 'Squash', 'racquetball', '🎾', 66, 7.3, 'sports'),
  move('boxing', 'Boxing', 'boxing-glove', '🥊', 11, 7.8, 'sports'),
  move('martialArts', 'Martial arts', 'karate', '🥋', 44, 10.3, 'sports'),
  move('rugby', 'Rugby', 'rugby', '🏉', 55, 8.3, 'sports'),
  move('cricket', 'Cricket', 'cricket', '🏏', 14, 4.8, 'sports'),
  move('baseball', 'Baseball', 'baseball-bat', '⚾', 4, 5.0, 'sports'),
  move('frisbee', 'Frisbee', 'disc', '🥏', 31, 8.0, 'sports'),
  move('fencing', 'Fencing', 'fencing', '🤺', 27, 6.0, 'sports'),

  // On the water.
  move('poolSwim', 'Pool swim', 'swim', '🏊', 74, 8.3, 'water'),
  move('openWaterSwim', 'Open water swim', 'swim', '🌊', 73, 8.3, 'water', travels(3, false)),
  move('kayaking', 'Kayaking', 'kayaking', '🛶', 46, 5.0, 'water', travels(8)),
  move('rowingBoat', 'Rowing', 'rowing', '🚣', 53, 7.0, 'water', travels(8)),
  move('surfing', 'Surfing', 'surfing', '🏄', 72, 3.0, 'water'),
  move('sailing', 'Sailing', 'sail-boat', '⛵', 58, 3.0, 'water', travels(15)),
  move('waterPolo', 'Water polo', 'water', '🤽', 80, 10.0, 'water'),

  // On snow and ice.
  move('skiing', 'Downhill skiing', 'ski', '⛷️', 61, 7.0, 'snow', travels(30)),
  move(
    'crossCountrySkiing',
    'Cross-country skiing',
    'ski-cross-country',
    '🎿',
    61,
    9.0,
    'snow',
    travels(15),
  ),
  move('snowboarding', 'Snowboarding', 'snowboard', '🏂', 62, 5.3, 'snow', travels(30)),
  move('snowshoeing', 'Snowshoeing', 'shoe-print', '🥾', 63, 7.5, 'snow', travels(6, false)),
  move('iceSkating', 'Ice skating', 'skate', '⛸️', 39, 5.5, 'snow', travels(15)),
  move('iceHockey', 'Ice hockey', 'hockey-sticks', '🏒', 38, 8.0, 'snow'),

  // The catch-all, last.
  move('otherWorkout', 'Workout', 'heart-pulse', '💪', 0, 4.0, 'gym'),
];

export type ActivityId = string;

const BY_ID = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a])) as Record<string, Activity>;
const BY_NAME = Object.fromEntries(ACTIVITIES.map((a) => [a.name.toLowerCase(), a]));

export const PRIMARY_ACTIVITIES = ACTIVITIES.filter((a) => a.primary);
export const MORE_ACTIVITIES = ACTIVITIES.filter((a) => !a.primary);

export const GROUP_NAMES: Record<ActivityGroup, string> = {
  outdoors: 'Outdoors',
  gym: 'Gym & studio',
  sports: 'Sports',
  water: 'Water',
  snow: 'Snow & ice',
};

export const activityById = (id: ActivityId) => BY_ID[id] || BY_ID.running;

/**
 * What to call an activity on screen. The four on the start screen are translated; the
 * long list is English, so a missing translation falls back to the activity's own name
 * rather than showing the lookup key.
 */
export function activityLabel(a: Activity, t: (key: string) => string): string {
  const key = `tracking.activities.${a.id}`;
  const translated = t(key);
  return translated === key ? a.name : translated;
}

/** The activity of a stored run. Old runs have none and are runs. */
export function activityOf(run: { activity?: string }): Activity {
  const a = (run.activity || '').trim().toLowerCase();
  if (!a) return BY_ID.running;
  const exact = BY_NAME[a] || BY_ID[a];
  if (exact) return exact;
  // Names that came from a watch, or from an older version of the app.
  if (/mountain bik/.test(a)) return BY_ID.mountainBiking;
  if (/cycl|bik|ride/.test(a)) return BY_ID.cycling;
  if (/trail/.test(a)) return BY_ID.trailRunning;
  if (/hik/.test(a)) return BY_ID.hiking;
  if (/walk/.test(a)) return BY_ID.walking;
  if (/swim/.test(a)) return BY_ID.poolSwim;
  if (/run|jog/.test(a)) return BY_ID.running;
  return BY_ID.running;
}

/**
 * MET for an activity at an average speed (m/s).
 *
 * Running and walking use the ACSM metabolic equations on level ground
 * (VO2 = 0.2 or 0.1 ml/kg/min per m/min + 3.5; 1 MET = 3.5 ml/kg/min).
 * Hiking is walking on rough terrain with a pack: the walking cost x 1.5, at least 5.3 MET.
 * Cycling follows the Compendium of Physical Activities speed bands, and so does everything
 * else, at a fixed value, because their effort does not follow the ground speed.
 */
export function metFor(id: ActivityId, speed: number): number {
  const perMin = speed * 60;
  switch (id) {
    case 'running':
    case 'trailRunning':
      // Below 1.8 m/s (6.5 km/h) nobody is really running: count it as brisk walking.
      if (speed < 1.8) return metFor('walking', speed);
      // A trail costs more than the same speed on a road.
      return ((0.2 * perMin + 3.5) / 3.5) * (id === 'trailRunning' ? 1.15 : 1);
    case 'walking':
      return Math.max(2.0, (0.1 * Math.min(perMin, 134) + 3.5) / 3.5);
    case 'hiking':
      return Math.max(5.3, metFor('walking', speed) * 1.5);
    case 'cycling':
    case 'mountainBiking': {
      const kmh = speed * 3.6;
      const rough = id === 'mountainBiking' ? 1.2 : 1;
      if (kmh < 16) return 4.0 * rough;
      if (kmh < 19) return 6.8 * rough;
      if (kmh < 22.5) return 8.0 * rough;
      if (kmh < 25.5) return 10.0 * rough;
      if (kmh < 30.5) return 12.0 * rough;
      return 15.8 * rough;
    }
    default:
      return BY_ID[id]?.met ?? 4.0;
  }
}

/**
 * Active calories of a workout: MET x body weight x moving hours. Uses the weight from
 * sign-up; without it assumes 70 kg.
 */
export function workoutCalories(
  run: { activity?: string; meters: number; seconds: number },
  weightKg?: number | null,
) {
  if (run.seconds <= 0) return 0;
  const a = activityOf(run);
  const met = metFor(a.id, a.tracksDistance ? run.meters / run.seconds : 0);
  return Math.round(met * (weightKg || DEFAULT_WEIGHT_KG) * (run.seconds / 3600));
}

/** "12.4 km/h" style average speed. */
export const speedKmh = (meters: number, seconds: number) =>
  seconds > 0 && meters >= 20 ? ((meters / seconds) * 3.6).toFixed(1) : '—';
