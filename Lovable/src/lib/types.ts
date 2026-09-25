export type Role = "trainer" | "student";

export interface User {
  id: string;
  name: string;
  role: Role;
  trainerId?: string;
  initials: string;
  lastActivity?: string;
}

/** Target of a set taken to failure. The spreadsheet stores the same text. */
export const FAILURE_REPS = "Até a falha";

export interface Exercise {
  id: string;
  name: string;
  /** Always reps.length. */
  sets: number;
  /** Each set's target, in order: "12", a range such as "8-12", or FAILURE_REPS. */
  reps: string[];
  weight: number;
  restSec: number;
  videoUrl?: string;
  notes?: string;
  rir?: string;
  /** Such as ["Peito", "Tríceps"]. When missing, lib/muscles.ts guesses them from the name. */
  muscleGroups?: string[];
  substitute?: string;
  substituteVideoUrl?: string;
}

export interface Workout {
  id: string;
  name: string;
  studentId: string;
  description?: string;
  exercises: Exercise[];
}

export type DayType = "workout" | "cardio" | "rest";

export interface ScheduleDay {
  day: string;
  type: DayType;
  workoutId?: string;
  label?: string;
}

export interface Schedule {
  studentId: string;
  days: ScheduleDay[];
}

export interface LoggedSet {
  weight: number;
  reps: number;
}

export interface HistoryExercise {
  exerciseName: string;
  sets: LoggedSet[];
}

export interface SessionRecord {
  id: string;
  studentId: string;
  workoutId: string;
  workoutName: string;
  date: string;
  durationSec: number;
  totalVolume: number;
  exercises: HistoryExercise[];
}

export const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
