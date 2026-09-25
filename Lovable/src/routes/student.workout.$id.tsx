import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Check, Flag, Info, Repeat, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { DescriptionEditor } from "@/components/DescriptionEditor";
import { LoadingState } from "@/components/LoadingState";
import { RestEditor } from "@/components/RestEditor";
import { RestTimer } from "@/components/RestTimer";
import { VideoDialog } from "@/components/VideoDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/context/AppContext";
import { useRequireRole } from "@/hooks/useRequireRole";
import {
  clearActiveWorkout,
  countSets,
  readActiveWorkout,
  saveActiveWorkout,
  type ActiveWorkout,
  type SetProgress,
} from "@/lib/activeWorkout";
import { api, calcVolume } from "@/lib/api";
import { formatNumber, plural } from "@/lib/format";
import { muscleGroupsOf, workoutMuscleGroups } from "@/lib/muscles";
import { formatReps, isFailure, startingReps } from "@/lib/reps";
import type { Exercise, SessionRecord, Workout } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/workout/$id")({
  head: () => ({
    meta: [
      { title: "Treino em andamento — AppTreino" },
      {
        name: "description",
        content: "Registre cada série, carga e repetição, com cronômetro de descanso automático.",
      },
      { property: "og:title", content: "Treino em andamento — AppTreino" },
      {
        property: "og:description",
        content: "Registre cada série, carga e repetição, com cronômetro de descanso automático.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActiveWorkoutPage,
});

/** Keyed by the workout, so going from one workout to another starts from a clean screen. */
function ActiveWorkoutPage() {
  const { id } = Route.useParams();
  return <ActiveWorkoutScreen key={id} id={id} />;
}

/** Fresh progress for a workout: every set starts with the planned weight and reps. */
function startWorkout(userId: string, workout: Workout): ActiveWorkout {
  return {
    userId,
    workoutId: workout.id,
    workoutName: workout.name,
    startedAt: Date.now(),
    sets: Object.fromEntries(workout.exercises.map((ex) => [ex.id, plannedSets(ex)])),
    customRestSec: {},
    rest: null,
  };
}

/** Stored progress, matched to the current plan: exercises added since then start fresh. */
function resumeWorkout(stored: ActiveWorkout, workout: Workout): ActiveWorkout {
  return {
    ...stored,
    workoutName: workout.name,
    sets: Object.fromEntries(
      workout.exercises.map((ex) => [ex.id, stored.sets[ex.id] ?? plannedSets(ex)]),
    ),
    rest: stored.rest && stored.rest.endsAt > Date.now() ? stored.rest : null,
  };
}

function plannedSets(ex: Exercise): SetProgress[] {
  return ex.reps.map((target) => ({ weight: ex.weight, reps: startingReps(target), done: false }));
}

function patchSet(
  progress: ActiveWorkout,
  exerciseId: string,
  index: number,
  patch: Partial<SetProgress>,
): ActiveWorkout {
  const sets = (progress.sets[exerciseId] ?? []).map((s, i) =>
    i === index ? { ...s, ...patch } : s,
  );
  return { ...progress, sets: { ...progress.sets, [exerciseId]: sets } };
}

function ActiveWorkoutScreen({ id }: { id: string }) {
  const user = useRequireRole("student");
  const { setLastSession } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: workout, isPending } = useQuery({
    queryKey: ["workout", id],
    queryFn: () => api.getWorkout(id),
  });

  const [progress, setProgress] = useState<ActiveWorkout | null>(null);
  // Stored from the first change on, so only opening a workout to look at it does not start it.
  const [started, setStarted] = useState(false);
  // A different workout already in progress on this device: the student decides what to do.
  const [other, setOther] = useState<ActiveWorkout | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once the workout is finished or discarded, so nothing stores it again on the way out.
  const closed = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!workout || !user || progress || other) return;
    const stored = readActiveWorkout(user.id);
    if (stored && stored.workoutId !== workout.id) {
      setOther(stored);
    } else if (stored) {
      setProgress(resumeWorkout(stored, workout));
      setStarted(true);
    } else {
      setProgress(startWorkout(user.id, workout));
    }
  }, [workout, user, progress, other]);

  // The workout was deleted while in progress: there is nothing left to continue.
  useEffect(() => {
    if (workout === null && user && readActiveWorkout(user.id)?.workoutId === id)
      clearActiveWorkout();
  }, [workout, user, id]);

  useEffect(() => {
    if (progress && started && !closed.current) saveActiveWorkout(progress);
  }, [progress, started]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const change = useCallback((fn: (p: ActiveWorkout) => ActiveWorkout) => {
    setProgress((p) => (p ? fn(p) : p));
    setStarted(true);
  }, []);

  const updateSet = (exerciseId: string, index: number, patch: Partial<SetProgress>) =>
    change((p) => patchSet(p, exerciseId, index, patch));

  const restOf = (ex: Exercise) => progress?.customRestSec[ex.id] ?? ex.restSec;

  const { done: completed, total: totalSets } = progress
    ? countSets(progress)
    : { done: 0, total: 0 };
  const liveVolume = useMemo(
    () =>
      Object.values(progress?.sets ?? {})
        .flat()
        .filter((s) => s.done)
        .reduce((v, s) => v + s.weight * (s.reps ?? 0), 0),
    [progress],
  );

  const endRest = useCallback(() => change((p) => ({ ...p, rest: null })), [change]);
  const addRest = useCallback(
    (seconds: number) =>
      change((p) =>
        p.rest
          ? {
              ...p,
              rest: {
                ...p.rest,
                endsAt: p.rest.endsAt + seconds * 1000,
                totalSec: p.rest.totalSec + seconds,
              },
            }
          : p,
      ),
    [change],
  );

  function toggleDone(ex: Exercise, index: number) {
    const set = progress?.sets[ex.id]?.[index];
    if (!set) return;
    if (set.done) {
      updateSet(ex.id, index, { done: false });
      return;
    }
    if (set.reps === null) {
      toast.error("Informe quantas repetições você fez");
      return;
    }
    const seconds = restOf(ex);
    change((p) => ({
      ...patchSet(p, ex.id, index, { done: true }),
      rest:
        seconds > 0
          ? { exerciseId: ex.id, endsAt: Date.now() + seconds * 1000, totalSec: seconds }
          : null,
    }));
    toast.success(`Série ${index + 1} registrada`, {
      description: `${set.weight} kg × ${set.reps} reps`,
    });
  }

  async function saveRest(ex: Exercise, seconds: number, keep: boolean) {
    const diff = seconds - restOf(ex);
    change((p) => ({
      ...p,
      customRestSec: { ...p.customRestSec, [ex.id]: seconds },
      // A countdown already running for this exercise follows the new rest.
      rest:
        p.rest?.exerciseId === ex.id
          ? {
              ...p.rest,
              endsAt: p.rest.endsAt + diff * 1000,
              totalSec: Math.max(0, p.rest.totalSec + diff),
            }
          : p.rest,
    }));
    if (!keep) {
      toast.success(`Descanso de ${seconds}s neste treino`);
      return;
    }
    try {
      await api.updateExerciseRest(ex.id, seconds);
    } catch {
      return; // api.ts showed the error; the new rest still applies to this workout.
    }
    queryClient.setQueryData<Workout | null>(["workout", id], (w) =>
      w
        ? {
            ...w,
            exercises: w.exercises.map((e) => (e.id === ex.id ? { ...e, restSec: seconds } : e)),
          }
        : w,
    );
    toast.success(`Descanso de ${seconds}s salvo no treino`);
  }

  async function saveDescription(description: string) {
    const updated = await api.updateWorkoutDescription(id, description);
    queryClient.setQueryData(["workout", id], updated);
    toast.success(description ? "Descrição salva" : "Descrição apagada");
  }

  async function finish() {
    if (!workout || !user || !progress || saving) return;
    const exercises = workout.exercises
      .map((ex) => ({
        exerciseName: ex.name,
        sets: (progress.sets[ex.id] ?? [])
          .filter((s) => s.done)
          .map((s) => ({ weight: s.weight, reps: s.reps ?? 0 })),
      }))
      .filter((e) => e.sets.length > 0);

    const session: SessionRecord = {
      id: `sess-${Date.now()}`,
      studentId: user.id,
      workoutId: workout.id,
      workoutName: workout.name,
      date: new Date().toISOString(),
      durationSec: Math.floor((Date.now() - progress.startedAt) / 1000),
      totalVolume: calcVolume(exercises),
      exercises,
    };
    setSaving(true);
    try {
      await api.saveWorkoutSession(session);
    } catch {
      // api.ts showed the error. The progress stays stored, so finishing can be tried again.
      setSaving(false);
      return;
    }
    closed.current = true;
    clearActiveWorkout();
    setLastSession(session);
    router.navigate({ to: "/student/summary" });
  }

  function discard() {
    closed.current = true;
    clearActiveWorkout();
    router.navigate({ to: "/student" });
  }

  const elapsed = progress ? Math.max(0, Math.floor((now - progress.startedAt) / 1000)) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <AppShell
      title={workout?.name ?? "Treino"}
      subtitle={`${mm}:${ss} · ${completed}/${totalSets} séries · ${formatNumber(liveVolume)} kg`}
      back={
        // The progress is stored, so leaving is safe: the workout continues when reopened.
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <Link to="/student" aria-label="Voltar ao início (o treino continua salvo)">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      }
    >
      {isPending ? (
        <LoadingState />
      ) : !workout ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Não foi possível carregar este treino.
        </p>
      ) : (
        <>
          <div className="space-y-4">
            <WorkoutOverview workout={workout} onSaveDescription={saveDescription} />

            {workout.exercises.map((ex, exIndex) => (
              <Card key={ex.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-primary">Exercício {exIndex + 1}</p>
                      <h3 className="text-base font-bold leading-tight">{ex.name}</h3>
                      <MuscleBadges groups={muscleGroupsOf(ex)} />
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-xs text-muted-foreground">
                          {formatReps(ex.reps)}
                          {ex.rir ? ` · ${ex.rir}` : ""}
                        </p>
                        <RestEditor
                          exerciseName={ex.name}
                          value={restOf(ex)}
                          onSave={(seconds, keep) => saveRest(ex, seconds, keep)}
                        />
                      </div>
                    </div>
                    <VideoDialog name={ex.name} url={ex.videoUrl} />
                  </div>

                  {ex.notes ? (
                    <p className="flex items-start gap-2 rounded-md bg-secondary/60 p-2 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      {ex.notes}
                    </p>
                  ) : null}
                  {ex.substitute || ex.substituteVideoUrl ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Repeat className="size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        Substituto: {ex.substitute || "vídeo do exercício substituto"}
                      </span>
                      <VideoDialog
                        name={ex.substitute || `Substituto de ${ex.name}`}
                        url={ex.substituteVideoUrl}
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {(progress?.sets[ex.id] ?? []).map((s, i) => {
                      const toFailure = isFailure(ex.reps[i]);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="h-11 w-11 justify-center rounded-md"
                          >
                            {i + 1}
                          </Badge>
                          <Input
                            type="number"
                            inputMode="decimal"
                            aria-label={`${ex.name}, série ${i + 1}, carga`}
                            className="h-11 flex-1 text-center text-base"
                            value={s.weight}
                            onChange={(e) =>
                              updateSet(ex.id, i, { weight: Number(e.target.value) })
                            }
                          />
                          <span className="text-xs text-muted-foreground">kg</span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            aria-label={`${ex.name}, série ${i + 1}, repetições${toFailure ? " (até a falha)" : ""}`}
                            placeholder={toFailure ? "falha" : undefined}
                            className={cn(
                              "h-11 flex-1 text-center text-base",
                              toFailure &&
                                "border-primary/60 placeholder:text-sm placeholder:text-primary/70",
                            )}
                            value={s.reps ?? ""}
                            onChange={(e) =>
                              updateSet(ex.id, i, {
                                reps: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                          <span className="text-xs text-muted-foreground">reps</span>
                          <Button
                            size="icon"
                            aria-label={`Concluir série ${i + 1}`}
                            variant={s.done ? "default" : "outline"}
                            className="size-11 shrink-0"
                            onClick={() => toggleDone(ex, i)}
                          >
                            <Check className="size-5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              className="h-16 w-full text-lg font-bold"
              onClick={finish}
              disabled={saving || !progress}
            >
              <Flag className="size-5" /> {saving ? "Salvando…" : "Finalizar treino"}
            </Button>
            {started ? <DiscardButton onConfirm={discard} /> : null}
          </div>

          {progress?.rest ? (
            <RestTimer
              endsAt={progress.rest.endsAt}
              totalSec={progress.rest.totalSec}
              onAdd={addRest}
              onDone={endRest}
            />
          ) : null}

          <OtherWorkoutDialog
            other={other}
            current={workout.name}
            onContinue={(o) =>
              router.navigate({ to: "/student/workout/$id", params: { id: o.workoutId } })
            }
            onDiscard={() => {
              clearActiveWorkout();
              setOther(null);
            }}
          />
        </>
      )}
    </AppShell>
  );
}

/** The whole workout at a glance: the muscle groups it trains and its description. */
function WorkoutOverview({
  workout,
  onSaveDescription,
}: {
  workout: Workout;
  onSaveDescription: (description: string) => Promise<void>;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <MuscleBadges groups={workoutMuscleGroups(workout.exercises)} />
        <div className="flex items-start gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 whitespace-pre-line pt-2.5 text-sm",
              !workout.description && "text-muted-foreground",
            )}
          >
            {workout.description || "Sem descrição."}
          </p>
          <DescriptionEditor
            workoutName={workout.name}
            value={workout.description ?? ""}
            onSave={onSaveDescription}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MuscleBadges({ groups }: { groups: string[] }) {
  if (!groups.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {groups.map((group) => (
        <Badge key={group} variant="outline" className="px-1.5 py-0 text-[11px] font-medium">
          {group}
        </Badge>
      ))}
    </div>
  );
}

function DiscardButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="h-12 w-full text-destructive">
          <Trash2 className="size-4" /> Descartar treino
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar este treino?</AlertDialogTitle>
          <AlertDialogDescription>
            As séries registradas até agora serão apagadas e nada vai para o histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar treinando</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={onConfirm}
          >
            Descartar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Opening a workout while another is in progress: continue that one, or discard it. */
function OtherWorkoutDialog({
  other,
  current,
  onContinue,
  onDiscard,
}: {
  other: ActiveWorkout | null;
  current: string;
  onContinue: (other: ActiveWorkout) => void;
  onDiscard: () => void;
}) {
  if (!other) return null;
  const { done, total } = countSets(other);
  // No onOpenChange: Escape or a tap outside must not skip the choice.
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem um treino em andamento</AlertDialogTitle>
          <AlertDialogDescription>
            {other.workoutName}: {done} de {plural(total, "série feita", "séries feitas")}. Para
            começar {current}, esse treino será descartado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="text-destructive" onClick={onDiscard}>
            Descartar e começar este
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onContinue(other)}>
            Continuar {other.workoutName}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
