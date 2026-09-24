/**
 * Data layer. Every function calls the Google Apps Script backend (backend/Code.gs), whose
 * /exec URL is read from VITE_API_URL at build time.
 */
import { toast } from "sonner";
import { clearSession, readSession, type Session } from "./session";
import type { Schedule, SessionRecord, User, Workout } from "./types";

/** Backend error code for a missing, expired or forged token: the app signs the user out. */
export const SESSION_INVALID = "SESSAO_INVALIDA";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiResponse<T> = { ok: true; dados: T } | { ok: false; erro: string; codigo?: string };

let onSessionExpired: (() => void) | null = null;

/** AppProvider registers how to sign the user out when the backend rejects the token. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

interface CallOptions {
  /** Writes toast their own failures and drop cached student data. Failed reads are toasted
   * once by the QueryCache in router.tsx, after React Query's retry. */
  write?: boolean;
  /** Never toast: the caller shows the error itself. */
  quiet?: boolean;
}

/**
 * The only way the app talks to the backend, as in the TreinoFácil app: one POST to the /exec
 * URL with { acao, args, token }, answered with { ok, dados } or { ok: false, erro, codigo }.
 */
async function call<T>(acao: string, args: unknown[] = [], options: CallOptions = {}): Promise<T> {
  try {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl)
      throw new ApiError("VITE_API_URL não configurada: informe a URL /exec do Apps Script");

    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method: "POST",
        // text/plain keeps this a CORS "simple" request: Apps Script cannot answer preflights.
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ acao, args, token: readSession()?.token ?? "" }),
      });
    } catch {
      throw new ApiError("Sem conexão com o servidor");
    }
    if (!res.ok) throw new ApiError(`Erro no servidor (${res.status})`);

    let body: ApiResponse<T>;
    try {
      body = (await res.json()) as ApiResponse<T>;
    } catch {
      // A deployment not shared with "Anyone" answers with Google's sign-in page.
      throw new ApiError(
        'Resposta inesperada do servidor. Confira se a implantação está como "Qualquer pessoa"',
      );
    }
    if (!body.ok) {
      if (body.codigo === SESSION_INVALID) {
        clearSession();
        onSessionExpired?.();
      }
      throw new ApiError(body.erro || "Erro no servidor", body.codigo);
    }
    if (options.write) studentDataCache.clear();
    return body.dados;
  } catch (err) {
    const error = err instanceof ApiError ? err : new ApiError(String(err));
    if (options.write && !options.quiet) toast.error(error.message, { id: error.message });
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

/** Forget cached data, e.g. when a different user signs in on this device. */
export function clearApiCache() {
  studentDataCache.clear();
}

function getStudentData(studentId: string): Promise<StudentData> {
  const cached = studentDataCache.get(studentId);
  if (cached && Date.now() < cached.expiresAt) return cached.promise;
  const entry = { promise: call<StudentData>("getStudentData", [studentId]), expiresAt: Infinity };
  studentDataCache.set(studentId, entry);
  entry.promise.then(
    () => (entry.expiresAt = Date.now() + STUDENT_DATA_TTL_MS),
    () => studentDataCache.get(studentId) === entry && studentDataCache.delete(studentId),
  );
  return entry.promise;
}

export const api = {
  login: (login: string, password: string) =>
    call<Session>("login", [login, password], { quiet: true }),

  changePassword: (currentPassword: string, newPassword: string) =>
    call<{ changed: true }>("changePassword", [currentPassword, newPassword], { quiet: true }),

  getUser: (id: string) => getStudentData(id).then((d) => d.user),

  /** The signed-in trainer's students (the trainer comes from the token). */
  getStudents: () => call<{ students: User[] }>("getTrainerDashboard").then((d) => d.students),

  getStudentWorkouts: (studentId: string) => getStudentData(studentId).then((d) => d.workouts),

  getWorkout: (id: string) =>
    call<{ workout: Workout | null }>("getWorkout", [id]).then((d) => d.workout),

  saveWorkout: (workout: Workout) =>
    call<{ workout: Workout }>("saveWorkoutPlan", [workout], { write: true }).then(
      (d) => d.workout,
    ),

  deleteWorkout: (id: string) => call("deleteWorkoutPlan", [id], { write: true }).then(() => true),

  getSchedule: (studentId: string) => getStudentData(studentId).then((d) => d.schedule),

  saveSchedule: (schedule: Schedule) =>
    call<{ schedule: Schedule }>("updateSchedule", [schedule], { write: true }).then(
      (d) => d.schedule,
    ),

  getHistory: (studentId: string) =>
    call<{ history: SessionRecord[] }>("getStudentStats", [studentId]).then((d) => d.history),

  /** Saved for the signed-in student (taken from the token, not from the record). */
  saveWorkoutSession: (session: SessionRecord) =>
    call<{ session: SessionRecord }>("saveWorkoutSession", [session], { write: true }).then(
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
