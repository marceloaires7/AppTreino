import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Dumbbell, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRequireRole } from "@/hooks/useRequireRole";
import { api } from "@/lib/api";
import { WEEK_DAYS, type Schedule } from "@/lib/types";
import { ProgressCharts } from "./student.stats";

export const Route = createFileRoute("/trainer/student/$id")({
  head: () => ({
    meta: [
      { title: "Student Profile — IronLog" },
      { name: "description", content: "Assign workouts, plan the week and review student progress." },
      { property: "og:title", content: "Student Profile — IronLog" },
      {
        property: "og:description",
        content: "Assign workouts, plan the week and review student progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentProfile,
});

function StudentProfile() {
  const { id } = Route.useParams();
  useRequireRole("trainer");
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["trainer-student", id],
    queryFn: async () => ({
      student: await api.getUser(id),
      workouts: await api.getStudentWorkouts(id),
      schedule: await api.getSchedule(id),
      history: await api.getHistory(id),
    }),
  });

  async function assign(day: string, value: string) {
    const days = WEEK_DAYS.map((d) => {
      const existing = data?.schedule?.days.find((x) => x.day === d) ?? {
        day: d,
        type: "rest" as const,
      };
      if (d !== day) return existing;
      if (value === "rest") return { day: d, type: "rest" as const };
      if (value === "cardio")
        return { day: d, type: "cardio" as const, label: "Cardio session" };
      return { day: d, type: "workout" as const, workoutId: value };
    });
    const schedule: Schedule = { studentId: id, days };
    await api.saveSchedule(schedule);
    await qc.invalidateQueries({ queryKey: ["trainer-student", id] });
    toast.success(`${day} updated`);
  }

  return (
    <AppShell
      title={data?.student?.name ?? "Student"}
      subtitle={data?.student?.lastActivity}
      back={
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <Link to="/trainer">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      }
    >
      <Tabs defaultValue="workouts">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="workouts" className="h-10">
            Workouts
          </TabsTrigger>
          <TabsTrigger value="week" className="h-10">
            Week
          </TabsTrigger>
          <TabsTrigger value="progress" className="h-10">
            Progress
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workouts" className="mt-4 space-y-3">
          <Button asChild className="h-14 w-full font-bold">
            <Link to="/trainer/builder" search={{ student: id, workout: undefined }}>
              <Plus className="size-5" /> New workout
            </Link>
          </Button>
          {data?.workouts.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex items-center gap-3 py-4">
                <Dumbbell className="size-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.exercises.length} exercises · {w.focus ?? "General"}
                  </p>
                </div>
                <Button asChild variant="outline" size="icon" className="size-11 shrink-0">
                  <Link to="/trainer/builder" search={{ student: id, workout: w.id }}>
                    <Pencil className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="week" className="mt-4 space-y-3">
          {WEEK_DAYS.map((day) => {
            const entry = data?.schedule?.days.find((d) => d.day === day);
            const value =
              entry?.type === "workout" ? (entry.workoutId ?? "rest") : (entry?.type ?? "rest");
            return (
              <div key={day} className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {day}
                </p>
                <Select value={value} onValueChange={(v) => assign(day, v)}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rest">Rest day</SelectItem>
                    <SelectItem value="cardio">Cardio</SelectItem>
                    {data?.workouts.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="progress" className="mt-4">
          <ProgressCharts history={data?.history ?? []} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
