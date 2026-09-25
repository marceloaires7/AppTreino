import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, CalendarDays, Dumbbell, Flame, Home, Moon, Play, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, TabBar } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequireRole } from "@/hooks/useRequireRole";
import { countSets, readActiveWorkout, type ActiveWorkout } from "@/lib/activeWorkout";
import { api } from "@/lib/api";
import { dayLabel, formatDate, formatNumber, plural } from "@/lib/format";
import { formatMuscleGroups } from "@/lib/muscles";
import { WEEK_DAYS } from "@/lib/types";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [
      { title: "Treino de hoje — AppTreino" },
      { name: "description", content: "Seu treino de hoje, pronto para começar com um toque." },
      { property: "og:title", content: "Treino de hoje — AppTreino" },
      {
        property: "og:description",
        content: "Seu treino de hoje, pronto para começar com um toque.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentHome,
});

export const studentTabs = [
  { to: "/student" as const, label: "Hoje", icon: <Home className="size-5" /> },
  { to: "/student/schedule" as const, label: "Semana", icon: <CalendarDays className="size-5" /> },
  { to: "/student/stats" as const, label: "Progresso", icon: <BarChart3 className="size-5" /> },
];

function StudentHome() {
  const user = useRequireRole("student");
  const todayName = WEEK_DAYS[(new Date().getDay() + 6) % 7];

  const { data, isPending } = useQuery({
    queryKey: ["student-home", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { schedule: null, workouts: [], history: [] };
      const [schedule, workouts, history] = await Promise.all([
        api.getSchedule(user.id),
        api.getStudentWorkouts(user.id),
        api.getHistory(user.id),
      ]);
      return { schedule, workouts, history };
    },
  });

  // A workout left unfinished on this device, to pick up where it stopped.
  const [active, setActive] = useState<ActiveWorkout | null>(null);
  useEffect(() => setActive(user ? readActiveWorkout(user.id) : null), [user]);

  const today = data?.schedule?.days.find((d) => d.day === todayName);
  const workout = data?.workouts.find((w) => w.id === today?.workoutId);
  const todayWorkoutId = today?.type === "workout" ? workout?.id : undefined;
  const muscles = workout ? formatMuscleGroups(workout.exercises) : "";
  const recent = [...(data?.history ?? [])].reverse().slice(0, 3);
  const weekVolume = (data?.history ?? [])
    .filter((h) => Date.now() - +new Date(h.date) < 7 * 864e5)
    .reduce((s, h) => s + h.totalVolume, 0);

  return (
    <AppShell
      title={user ? `Olá, ${user.name.split(" ")[0]}` : "Hoje"}
      subtitle={dayLabel(todayName ?? "")}
      footer={<TabBar items={studentTabs} />}
    >
      {isPending ? (
        <LoadingState />
      ) : (
        <>
          {active && active.workoutId !== todayWorkoutId ? (
            <ActiveWorkoutCard workout={active} />
          ) : null}
          <Card className="border-primary/40 bg-gradient-to-br from-primary/15 to-transparent">
            <CardHeader className="pb-2">
              <Badge variant="secondary" className="w-fit">
                Treino de hoje
              </Badge>
              <CardTitle className="pt-2 text-2xl">
                {today?.type === "workout" && workout
                  ? workout.name
                  : today?.type === "cardio"
                    ? (today.label ?? "Sessão de cardio")
                    : "Descanso e recuperação"}
              </CardTitle>
              {todayWorkoutId && muscles ? (
                <p className="text-sm font-semibold text-primary">{muscles}</p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {today?.type === "workout" && workout ? (
                <>
                  {workout.description ? (
                    <p className="line-clamp-3 whitespace-pre-line text-sm">
                      {workout.description}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {plural(workout.exercises.length, "exercício", "exercícios")} ·{" "}
                    {plural(
                      workout.exercises.reduce((s, e) => s + e.sets, 0),
                      "série",
                      "séries",
                    )}{" "}
                    no total
                  </p>
                  <Button asChild className="h-16 w-full text-lg font-bold">
                    <Link to="/student/workout/$id" params={{ id: workout.id }}>
                      <Play className="size-6" />{" "}
                      {active?.workoutId === workout.id ? "Continuar treino" : "Começar treino"}
                    </Link>
                  </Button>
                </>
              ) : today?.type === "cardio" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Flame className="size-4 text-primary" /> Faça sua sessão e registre com seu
                  personal.
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Moon className="size-4 text-primary" /> Sem treino hoje. Durma, coma bem e
                  recupere.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Volume · 7 dias
                </p>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {formatNumber(weekVolume)} kg
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Treinos registrados
                </p>
                <p className="mt-1 text-2xl font-bold text-primary">{data?.history.length ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Treinos recentes
          </h2>
          <div className="space-y-2">
            {recent.map((h) => (
              <Card key={h.id}>
                <CardContent className="flex items-center gap-3 py-4">
                  <Dumbbell className="size-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{h.workoutName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(h.date)} · {formatNumber(h.totalVolume)} kg
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function ActiveWorkoutCard({ workout }: { workout: ActiveWorkout }) {
  const { done, total } = countSets(workout);
  return (
    <Card className="mb-4 border-primary/60">
      <CardContent className="flex items-center gap-3 py-4">
        <Timer className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Treino em andamento
          </p>
          <p className="truncate text-sm font-semibold">{workout.workoutName}</p>
          <p className="text-xs text-muted-foreground">
            {done} de {plural(total, "série feita", "séries feitas")}
          </p>
        </div>
        <Button asChild className="h-11 shrink-0">
          <Link to="/student/workout/$id" params={{ id: workout.workoutId }}>
            <Play className="size-4" /> Continuar
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
