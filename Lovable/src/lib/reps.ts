/**
 * Rep targets. Each set has its own: "12", a range such as "8-12", or FAILURE_REPS. The
 * spreadsheet keeps them in one cell, "12; 10; Até a falha", which backend/Code.gs reads and writes.
 */
import { FAILURE_REPS } from "./types";

/** "falha", "F" or "até a falha", in any case, mean FAILURE_REPS, as in normalizeReps_ in Code.gs. */
export function normalizeReps(value: string): string {
  const reps = value.trim();
  return /^((at[eé]\s+a\s+)?falha|f|failure)$/i.test(reps) ? FAILURE_REPS : reps;
}

export function isFailure(reps: string | undefined): boolean {
  return reps === FAILURE_REPS;
}

/** The targets for `count` sets: added sets repeat the last target. */
export function resizeReps(reps: string[], count: number): string[] {
  const last = reps[reps.length - 1] ?? "10";
  return Array.from({ length: count }, (_, i) => reps[i] ?? last);
}

/** "3 × 12" when every set is the same, else "12, 10, até a falha". */
export function formatReps(reps: string[]): string {
  const label = (r: string) => (isFailure(r) ? "até a falha" : r || "?");
  if (reps.every((r) => r === reps[0]))
    return reps.length ? `${reps.length} × ${label(reps[0]!)}` : "";
  return reps.map(label).join(", ");
}

/** The reps a set starts with on the workout screen: the first number of "8-12" or "10+F". None for
 * a set to failure, whose reps are only known once it is done. */
export function startingReps(target: string): number | null {
  if (isFailure(target)) return null;
  const n = parseInt(target, 10);
  return Number.isNaN(n) ? null : n;
}
