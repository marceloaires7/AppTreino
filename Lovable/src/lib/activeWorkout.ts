/**
 * The workout in progress, kept in the browser like the session (see session.ts). Leaving the
 * workout screen, whether by the back arrow, the edit mode, signing out or closing the app, keeps
 * every set logged so far: opening the workout again continues where it stopped. There is one per
 * device, removed when the workout is finished or discarded.
 */

export interface SetProgress {
  weight: number;
  /** null until typed: a set to failure starts empty. */
  reps: number | null;
  done: boolean;
}

export interface RestCountdown {
  exerciseId: string;
  /** Epoch milliseconds. */
  endsAt: number;
  totalSec: number;
}

export interface ActiveWorkout {
  userId: string;
  workoutId: string;
  workoutName: string;
  /** Epoch milliseconds. The saved duration counts from here, time away from the screen included. */
  startedAt: number;
  /** By exercise ID. */
  sets: Record<string, SetProgress[]>;
  /** Rest times changed on the workout screen, in seconds, by exercise ID. */
  customRestSec: Record<string, number>;
  rest: RestCountdown | null;
}

const STORAGE_KEY = "gymapp.activeWorkout";
// Nobody trains for 12 hours: a workout started longer ago than that was abandoned.
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** The user's workout in progress on this device, if any. */
export function readActiveWorkout(userId: string): ActiveWorkout | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const workout = raw ? (JSON.parse(raw) as ActiveWorkout) : null;
    if (!workout || workout.userId !== userId || !workout.sets) return null;
    if (!(Date.now() - workout.startedAt < MAX_AGE_MS)) {
      clearActiveWorkout();
      return null;
    }
    return workout;
  } catch {
    return null;
  }
}

export function saveActiveWorkout(workout: ActiveWorkout) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workout));
  } catch {
    // Private mode or full storage: the progress lasts while the screen stays open.
  }
}

export function clearActiveWorkout() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Sets done and planned so far. */
export function countSets(workout: ActiveWorkout): { done: number; total: number } {
  const sets = Object.values(workout.sets).flat();
  return { done: sets.filter((s) => s.done).length, total: sets.length };
}
