import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Check, Flag, Info, Repeat } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { RestTimer } from "@/components/RestTimer";
import { VideoDialog } from "@/components/VideoDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/context/AppContext";
import { useRequireRole } from "@/hooks/useRequireRole";
import { api, calcVolume } from "@/lib/api";
import type { SessionRecord } from "@/lib/types";

export const Route = createFileRoute("/student/workout/$id")({
  head: () => ({
    meta: [
      { title: "Active Workout — IronLog" },
      {
        name: "description",
        content: "Log every set, weight and rep with an automatic rest timer.",
      },
      { property: "og:title", content: "Active Workout — IronLog" },
      {
        property: "og:description",
        content: "Log every set, weight and rep with an automatic rest timer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActiveWorkout,
});

interface SetState {
  weight: number;
  reps: number;
  done: boolean;
}

function ActiveWorkout() {
  const { id } = Route.useParams();
  const user = useRequireRole("student");
  const { setLastSession } = useApp();
  const router = useRouter();

  const { data: workout } = useQuery({
    queryKey: ["workout", id],
    queryFn: () => api.getWorkout(id),
  });

  const [sets, setSets] = useState<Record<string, SetState[]>>({});
  const [rest, setRest] = useState<number | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (!workout) return;
    setSets(
      Object.fromEntries(
        workout.exercises.map((ex) => [
          ex.id,
          Array.from({ length: ex.sets }, () => ({
            weight: ex.weight,
            // "8-12" rep ranges start at their first number.
            reps: parseInt(String(ex.reps), 10) || 10,
            done: false,
          })),
        ]),
      ),
    );
  }, [workout]);

  const update = (exId: string, i: number, patch: Partial<SetState>) =>
    setSets((prev) => ({
      ...prev,
      [exId]: prev[exId]!.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));

  const completed = useMemo(
    () =>
      Object.values(sets)
        .flat()
        .filter((s) => s.done).length,
    [sets],
  );
  const totalSets = useMemo(() => Object.values(sets).flat().length, [sets]);
  const liveVolume = useMemo(
    () =>
      Object.values(sets)
        .flat()
        .filter((s) => s.done)
        .reduce((v, s) => v + s.weight * s.reps, 0),
    [sets],
  );

  const closeTimer = useCallback(() => setRest(null), []);

  async function finish() {
    if (!workout || !user) return;
    const exercises = workout.exercises
      .map((ex) => ({
        exerciseName: ex.name,
        sets: (sets[ex.id] ?? [])
          .filter((s) => s.done)
          .map((s) => ({ weight: s.weight, reps: s.reps })),
      }))
      .filter((e) => e.sets.length > 0);

    const session: SessionRecord = {
      id: `sess-${Date.now()}`,
      studentId: user.id,
      workoutId: workout.id,
      workoutName: workout.name,
      date: new Date().toISOString(),
      durationSec: Math.floor((Date.now() - startedAt) / 1000),
      totalVolume: calcVolume(exercises),
      exercises,
    };
    await api.saveWorkoutSession(session);
    setLastSession(session);
    router.navigate({ to: "/student/summary" });
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <AppShell
      title={workout?.name ?? "Workout"}
      subtitle={`${mm}:${ss} · ${completed}/${totalSets} sets · ${Math.round(liveVolume)} kg`}
      back={
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <Link to="/student">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-4">
        {workout?.exercises.map((ex, exIndex) => (
          <Card key={ex.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-primary">Exercise {exIndex + 1}</p>
                  <h3 className="text-base font-bold leading-tight">{ex.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {ex.sets} × {ex.reps} · rest {ex.restSec}s{ex.rir ? ` · ${ex.rir}` : ""}
                  </p>
                </div>
                <VideoDialog name={ex.name} url={ex.videoUrl} />
              </div>

              {ex.notes ? (
                <p className="flex items-start gap-2 rounded-md bg-secondary/60 p-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {ex.notes}
                </p>
              ) : null}
              {ex.substitute ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Repeat className="size-3.5 text-primary" /> Substitute: {ex.substitute}
                </p>
              ) : null}

              <div className="space-y-2">
                {(sets[ex.id] ?? []).map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant="secondary" className="h-11 w-11 justify-center rounded-md">
                      {i + 1}
                    </Badge>
                    <Input
                      type="number"
                      inputMode="decimal"
                      aria-label={`${ex.name} set ${i + 1} weight`}
                      className="h-11 flex-1 text-center text-base"
                      value={s.weight}
                      onChange={(e) => update(ex.id, i, { weight: Number(e.target.value) })}
                    />
                    <span className="text-xs text-muted-foreground">kg</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      aria-label={`${ex.name} set ${i + 1} reps`}
                      className="h-11 flex-1 text-center text-base"
                      value={s.reps}
                      onChange={(e) => update(ex.id, i, { reps: Number(e.target.value) })}
                    />
                    <span className="text-xs text-muted-foreground">reps</span>
                    <Button
                      size="icon"
                      aria-label={`Complete set ${i + 1}`}
                      variant={s.done ? "default" : "outline"}
                      className="size-11 shrink-0"
                      onClick={() => {
                        const next = !s.done;
                        update(ex.id, i, { done: next });
                        if (next) {
                          setRest(ex.restSec);
                          toast.success(`Set ${i + 1} logged`, {
                            description: `${s.weight} kg × ${s.reps} reps`,
                          });
                        }
                      }}
                    >
                      <Check className="size-5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        <Button className="h-16 w-full text-lg font-bold" onClick={finish}>
          <Flag className="size-5" /> Finish Workout
        </Button>
      </div>

      {rest !== null ? <RestTimer seconds={rest} onDone={closeTimer} /> : null}
    </AppShell>
  );
}
