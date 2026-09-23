/**
 * Data layer. Every function here is async so it can be swapped for
 * `fetch()` calls to the Google Apps Script REST API without touching UI code.
 * Today it reads/writes an in-memory store seeded from mockData.ts.
 */
import { mockHistory, mockSchedules, mockUsers, mockWorkouts } from "./mockData";
import type { Schedule, SessionRecord, User, Workout } from "./types";

const store = {
  users: [...mockUsers],
  workouts: [...mockWorkouts],
  schedules: [...mockSchedules],
  history: [...mockHistory],
};

const ok = <T>(value: T): Promise<T> => Promise.resolve(value);

export const api = {
  login: (role: "trainer" | "student") =>
    ok(store.users.find((u) => u.role === role) as User),

  getUser: (id: string) => ok(store.users.find((u) => u.id === id) ?? null),

  getStudents: (trainerId: string) =>
    ok(store.users.filter((u) => u.role === "student" && u.trainerId === trainerId)),

  getStudentWorkouts: (studentId: string) =>
    ok(store.workouts.filter((w) => w.studentId === studentId)),

  getWorkout: (id: string) => ok(store.workouts.find((w) => w.id === id) ?? null),

  saveWorkout: (workout: Workout) => {
    const i = store.workouts.findIndex((w) => w.id === workout.id);
    if (i >= 0) store.workouts[i] = workout;
    else store.workouts.push(workout);
    return ok(workout);
  },

  deleteWorkout: (id: string) => {
    store.workouts = store.workouts.filter((w) => w.id !== id);
    return ok(true);
  },

  getSchedule: (studentId: string) =>
    ok(store.schedules.find((s) => s.studentId === studentId) ?? null),

  saveSchedule: (schedule: Schedule) => {
    const i = store.schedules.findIndex((s) => s.studentId === schedule.studentId);
    if (i >= 0) store.schedules[i] = schedule;
    else store.schedules.push(schedule);
    return ok(schedule);
  },

  getHistory: (studentId: string) =>
    ok(
      store.history
        .filter((h) => h.studentId === studentId)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    ),

  saveWorkoutSession: (session: SessionRecord) => {
    store.history.push(session);
    return ok(session);
  },
};

export function calcVolume(exercises: SessionRecord["exercises"]): number {
  return exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((v, s) => v + s.weight * s.reps, 0),
    0,
  );
}

export function toEmbedUrl(url?: string): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}
