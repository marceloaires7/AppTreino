/**
 * Data layer. Every function calls the Google Apps Script backend (backend/Code.gs), whose
 * /exec URL is read from VITE_API_URL at build time.
 */
import { toast } from "sonner";
import type { Schedule, SessionRecord, User, Workout } from "./types";

type ApiResponse<T> = { status: "success"; data: T } | { status: "error"; message: string };

interface RequestOptions {
  params?: Record<string, string>;
  body?: object;
  /** Don't toast on failure; the caller shows the error itself. */
  quiet?: boolean;
}

// Reads (GET) are toasted once by the QueryCache in router.tsx after React Query's retry, so
// only writes (POST) toast here. Any successful write also drops cached student data.

async function request<T>(
  action: string,
  { params, body, quiet }: RequestOptions = {},
): Promise<T> {
  try {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) throw new Error("VITE_API_URL is not set: add the Apps Script /exec URL");
    const url = new URL(apiUrl);
    url.searchParams.set("action", action);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

    const res = await fetch(
      url,
      body && {
        method: "POST",
        // text/plain keeps this a CORS "simple" request: Apps Script cannot answer preflights.
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    const json = (await res.json()) as ApiResponse<T>;
    if (json.status !== "success") throw new Error(json.message);
    if (body && action !== "login") studentDataCache.clear();
    return json.data;
  } catch (err) {
    const error =
      err instanceof TypeError ? new Error("Could not reach the server") : (err as Error);
    if (body && !quiet) toast.error(error.message);
    throw error;
  }
}

interface StudentData {
  user: User;
  workouts: Workout[];
  schedule: Schedule;
}

// Screens ask for a student's user, workouts and schedule separately, and each Apps Script call
// takes seconds. All three come from one getStudentData call, which is shared while in flight
// and reused for a few seconds after it succeeds.
const STUDENT_DATA_TTL_MS = 15_000;
const studentDataCache = new Map<string, { promise: Promise<StudentData>; expiresAt: number }>();

function getStudentData(userId: string): Promise<StudentData> {
  const cached = studentDataCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.promise;
  const entry = {
    promise: request<StudentData>("getStudentData", { params: { userId } }),
    expiresAt: Infinity,
  };
  studentDataCache.set(userId, entry);
  entry.promise.then(
    () => (entry.expiresAt = Date.now() + STUDENT_DATA_TTL_MS),
    () => studentDataCache.get(userId) === entry && studentDataCache.delete(userId),
  );
  return entry.promise;
}

export const api = {
  login: (login: string, password: string) =>
    request<{ user: User }>("login", { body: { Login: login, Senha: password }, quiet: true }).then(
      (d) => d.user,
    ),

  getUser: (id: string) => getStudentData(id).then((d) => d.user),

  getStudents: (trainerId: string) =>
    request<{ students: User[] }>("getTrainerDashboard", { params: { trainerId } }).then(
      (d) => d.students,
    ),

  getStudentWorkouts: (studentId: string) => getStudentData(studentId).then((d) => d.workouts),

  getWorkout: (id: string) =>
    request<{ workout: Workout | null }>("getWorkout", { params: { workoutId: id } }).then(
      (d) => d.workout,
    ),

  saveWorkout: (workout: Workout) =>
    request<{ workout: Workout }>("saveWorkoutPlan", { body: { workout } }).then((d) => d.workout),

  deleteWorkout: (id: string) =>
    request("deleteWorkoutPlan", { body: { workoutId: id } }).then(() => true),

  getSchedule: (studentId: string) => getStudentData(studentId).then((d) => d.schedule),

  saveSchedule: (schedule: Schedule) =>
    request<{ schedule: Schedule }>("updateSchedule", { body: { schedule } }).then(
      (d) => d.schedule,
    ),

  getHistory: (studentId: string) =>
    request<{ history: SessionRecord[] }>("getStudentStats", {
      params: { userId: studentId },
    }).then((d) => d.history),

  saveWorkoutSession: (session: SessionRecord) =>
    request<{ session: SessionRecord }>("saveWorkoutSession", { body: { session } }).then(
      (d) => d.session,
    ),
};

export function calcVolume(exercises: SessionRecord["exercises"]): number {
  return exercises.reduce((sum, ex) => sum + ex.sets.reduce((v, s) => v + s.weight * s.reps, 0), 0);
}

export function toEmbedUrl(url?: string): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}
