/**
 * Muscle groups. Each exercise may list its own (Grupo_Muscular in the spreadsheet). When it has
 * none, they are guessed from its name, so workouts created before that column existed show them
 * too. The workout builder fills in the guess, where it can be corrected before saving.
 */
import { formatList } from "./format";
import type { Exercise } from "./types";

export const MUSCLE_GROUPS = [
  "Peito",
  "Costas",
  "Ombros",
  "Trapézio",
  "Bíceps",
  "Tríceps",
  "Antebraço",
  "Abdômen",
  "Lombar",
  "Quadríceps",
  "Posterior",
  "Glúteos",
  "Adutores",
  "Panturrilha",
];

// Tried in order on each part of the name ("Supino reto + Elevação frontal" has two), which is
// lowercase and without accents. The first match wins, so the more specific names come first:
// "rosca" before "cross over", "crucifixo invertido" before "crucifixo", "remada alta" before
// "remada". Ambiguous names, such as "burrinho", are left for the student or trainer to set.
const RULES: [RegExp, string[]][] = [
  [/\b(gluteo|abducao|abdutora|elevacao pelvica|hip thrust|ponte)/, ["Glúteos"]],
  [/\b(aducao|adutora|adutor)/, ["Adutores"]],
  [/\b(panturrilha|gemeos|soleo)/, ["Panturrilha"]],
  [/\b(triceps|testa|frances|mergulho|paralelas?)\b/, ["Tríceps"]],
  [/\b(rosca (inversa|punho)|punho|antebraco)/, ["Antebraço"]],
  [/\b(rosca|biceps)/, ["Bíceps"]],
  [
    /\b(flexora|flexao (de )?(coxas?|pernas?|joelhos?)|leg curl|stiff|romeno|good morning)/,
    ["Posterior"],
  ],
  [/\b(terra|deadlift)\b/, ["Posterior", "Glúteos", "Lombar"]],
  [/\b(lombar|hiperextensao|banco romano)/, ["Lombar"]],
  [/\b(abdom|prancha|crunch|obliquo|elevacao de pernas)/, ["Abdômen"]],
  [/\b(extensora|extensao (de )?(joelhos?|pernas?)|sissy)/, ["Quadríceps"]],
  [/\b(agachamento|squat|leg|hack|afundo|avanco|passada|bulgaro)/, ["Quadríceps", "Glúteos"]],
  [/\b(encolhimento|trapezio)/, ["Trapézio"]],
  [
    /\b(desenvolvimento|elevacao|arnold|militar|ombros?|deltoide|(crucifixo|voador) invertido|face pull|remada alta)/,
    ["Ombros"],
  ],
  [
    /\b(remada|puxada|pull ?down|barra fixa|pull ?up|chin ?up|serrote|pullover|costas|dorsal|graviton|cavalinho)/,
    ["Costas"],
  ],
  [/\b(supino|crucifixo|voador|peck|fly|cross ?over|peitoral|peito|flexao de bracos?)/, ["Peito"]],
];

function simplify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** "Supino reto + Elevação frontal" -> ["Peito", "Ombros"]; [] when nothing matches. */
export function inferMuscleGroups(name: string): string[] {
  const groups: string[] = [];
  for (const part of simplify(name).split("+")) {
    const rule = RULES.find(([pattern]) => pattern.test(part));
    for (const group of rule?.[1] ?? []) if (!groups.includes(group)) groups.push(group);
  }
  return groups;
}

/** The exercise's own groups, or the ones its name suggests. */
export function muscleGroupsOf(exercise: Pick<Exercise, "name" | "muscleGroups">): string[] {
  return exercise.muscleGroups?.length ? exercise.muscleGroups : inferMuscleGroups(exercise.name);
}

/** Every group a workout trains, the most worked first (ties keep the workout's order). */
export function workoutMuscleGroups(exercises: Exercise[]): string[] {
  const counts = new Map<string, number>();
  for (const exercise of exercises)
    for (const group of muscleGroupsOf(exercise)) counts.set(group, (counts.get(group) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
}

/** "Peito, Ombros e Tríceps", or "" when no group is known. */
export function formatMuscleGroups(exercises: Exercise[]): string {
  return formatList(workoutMuscleGroups(exercises));
}
