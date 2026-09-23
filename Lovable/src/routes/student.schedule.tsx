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
import { WEEK_DAYS } from "@/lib/types";
import { studentTabs } from "./student.index";

export const Route = createFileRoute("/student/schedule")({
  head: () => ({
    meta: [
      { title: "Weekly Plan — IronLog" },
      { name: "description", content: "Your Monday to Sunday training plan set by your coach." },
      { property: "og:title", content: "Weekly Plan — IronLog" },
      {
        property: "og:description",
        content: "Your Monday to Sunday training plan set by your coach.",
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
    <AppShell title="Your week" subtitle="Monday to Sunday" footer={<TabBar items={studentTabs} />}>
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
                      <p className="text-xs font-bold uppercase tracking-wide">{day.slice(0, 3)}</p>
                      {isToday ? (
                        <Badge className="mt-1 px-1.5 py-0 text-[10px]">Today</Badge>
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
                          ? (workout?.name ?? "Workout")
                          : entry?.type === "cardio"
                            ? (entry.label ?? "Cardio")
                            : "Rest day"}
                      </p>
                      {entry?.type === "workout" && workout ? (
                        <p className="text-xs text-muted-foreground">
                          {workout.exercises.length} exercises
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
