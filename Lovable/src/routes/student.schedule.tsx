import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Dumbbell, Flame, Moon, Play } from "lucide-react";
import { AppShell, TabBar } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRequireRole } from "@/hooks/useRequireRole";
import { api } from "@/lib/api";
import { dayLabel, plural } from "@/lib/format";
import { WEEK_DAYS } from "@/lib/types";
import { studentTabs } from "./student.index";

export const Route = createFileRoute("/student/schedule")({
  head: () => ({
    meta: [
      { title: "Semana — IronLog" },
      {
        name: "description",
        content: "Seu plano de segunda a domingo, montado pelo seu personal.",
      },
      { property: "og:title", content: "Semana — IronLog" },
      {
        property: "og:description",
        content: "Seu plano de segunda a domingo, montado pelo seu personal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const user = useRequireRole("student");
  const todayName = WEEK_DAYS[(new Date().getDay() + 6) % 7];

  const { data, isPending } = useQuery({
    queryKey: ["student-week", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { schedule: null, workouts: [] };
      return {
        schedule: await api.getSchedule(user.id),
        workouts: await api.getStudentWorkouts(user.id),
      };
    },
  });

  return (
    <AppShell
      title="Sua semana"
      subtitle="Segunda a domingo"
      footer={<TabBar items={studentTabs} />}
    >
      {isPending ? (
        <LoadingState />
      ) : (
        <>
          <div className="space-y-3">
            {WEEK_DAYS.map((day) => {
              const entry = data?.schedule?.days.find((d) => d.day === day);
              const workout = data?.workouts.find((w) => w.id === entry?.workoutId);
              const isToday = day === todayName;
              return (
                <Card key={day} className={isToday ? "border-primary/60" : undefined}>
                  <CardContent className="flex items-center gap-3 py-4">
                    <div className="w-12 shrink-0">
                      <p className="text-xs font-bold uppercase tracking-wide">
                        {dayLabel(day).slice(0, 3)}
                      </p>
                      {isToday ? (
                        <Badge className="mt-1 px-1.5 py-0 text-[10px]">Hoje</Badge>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold">
                        {entry?.type === "workout" ? (
                          <Dumbbell className="size-4 text-primary" />
                        ) : entry?.type === "cardio" ? (
                          <Flame className="size-4 text-primary" />
                        ) : (
                          <Moon className="size-4 text-muted-foreground" />
                        )}
                        {entry?.type === "workout"
                          ? (workout?.name ?? "Treino")
                          : entry?.type === "cardio"
                            ? (entry.label ?? "Cardio")
                            : "Descanso"}
                      </p>
                      {entry?.type === "workout" && workout ? (
                        <p className="text-xs text-muted-foreground">
                          {plural(workout.exercises.length, "exercício", "exercícios")}
                        </p>
                      ) : null}
                    </div>
                    {entry?.type === "workout" && workout ? (
                      <Button asChild size="icon" className="size-11 shrink-0">
                        <Link to="/student/workout/$id" params={{ id: workout.id }}>
                          <Play className="size-5" />
                        </Link>
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
