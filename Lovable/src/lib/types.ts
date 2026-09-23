export type Role = "trainer" | "student";

export interface User {
  id: string;
  name: string;
  role: Role;
  trainerId?: string;
  initials: string;
  lastActivity?: string;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  weight: number;
  restSec: number;
  videoUrl?: string;
  notes?: string;
  rir?: string;
  substitute?: string;
}

export interface Workout {
  id: string;
  name: string;
  studentId: string;
  focus?: string;
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
