// Rough energy estimates for workouts CRW+ records itself. They use the body details from
// sign-up; without a weight they assume 70 kg, which is why skipping it makes numbers worse.

export const DEFAULT_WEIGHT_KG = 70;

// GPS workouts (running, walking, hiking, cycling) are estimated in ./activities.ts.

// MET values from the Compendium of Physical Activities (calisthenics, moderate effort).
const MET = { pushup: 3.8, squat: 5.0 } as const;

/** Push-ups or squats: MET x kg x hours, never less than a small per-rep floor. */
export function repCalories(
  exercise: keyof typeof MET,
  reps: number,
  seconds: number,
  weightKg?: number | null,
) {
  const kg = weightKg || DEFAULT_WEIGHT_KG;
  const byTime = MET[exercise] * kg * (seconds / 3600);
  const perRep = (exercise === 'squat' ? 0.32 : 0.29) * (kg / DEFAULT_WEIGHT_KG);
  return Math.round(Math.max(byTime, reps * perRep));
}
