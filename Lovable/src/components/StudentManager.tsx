import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Dumbbell, Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
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
import { api } from "@/lib/api";
import { dayLabel, plural } from "@/lib/format";
import { formatMuscleGroups } from "@/lib/muscles";
import { WEEK_DAYS, type Schedule } from "@/lib/types";
import { ProgressCharts } from "@/routes/student.stats";

interface Props {
  /** "trainer": one of their students. "student": edit mode on their own plan. */
  mode: "trainer" | "student";
  studentId: string;
}

/** Workouts, week and progress of one student, editable. Trainers and students in edit mode. */
export function StudentManager({ mode, studentId: id }: Props) {
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["student-manager", id],
    queryFn: async () => {
      // One getStudentData call serves the first three (see api.ts); stats load alongside it.
      const [student, workouts, schedule, history] = await Promise.all([
        api.getUser(id),
        api.getStudentWorkouts(id),
        api.getSchedule(id),
        api.getHistory(id),
      ]);
      return { student, workouts, schedule, history };
    },
  });

  async function assign(day: string, value: string) {
    const days = WEEK_DAYS.map((d) => {
      const existing = data?.schedule?.days.find((x) => x.day === d) ?? {
        day: d,
        type: "rest" as const,
      };
      if (d !== day) return existing;
      if (value === "rest") return { day: d, type: "rest" as const };
      if (value === "cardio") return { day: d, type: "cardio" as const, label: "Sessão de cardio" };
      return { day: d, type: "workout" as const, workoutId: value };
    });
    const schedule: Schedule = { studentId: id, days };
    await api.saveSchedule(schedule);
    await qc.invalidateQueries({ queryKey: ["student-manager", id] });
    toast.success(`Agenda de ${dayLabel(day).toLowerCase()} atualizada`);
  }

  return (
    <AppShell
      title={mode === "trainer" ? (data?.student?.name ?? "Aluno") : "Modo de edição"}
      subtitle={mode === "trainer" ? data?.student?.lastActivity : "Seus treinos e sua semana"}
      back={
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          {mode === "trainer" ? (
            <Link to="/trainer">
              <ArrowLeft className="size-5" />
            </Link>
          ) : (
            <Link to="/student">
              <ArrowLeft className="size-5" />
            </Link>
          )}
        </Button>
      }
    >
      {isPending ? (
        <LoadingState />
      ) : (
        <>
          <Tabs defaultValue="workouts">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="workouts" className="h-10">
                Treinos
              </TabsTrigger>
              <TabsTrigger value="week" className="h-10">
                Semana
              </TabsTrigger>
              <TabsTrigger value="progress" className="h-10">
                Progresso
              </TabsTrigger>
            </TabsList>

            <TabsContent value="workouts" className="mt-4 space-y-3">
              <Button asChild className="h-14 w-full font-bold">
                <BuilderLink mode={mode} studentId={id}>
                  <Plus className="size-5" /> Novo treino
                </BuilderLink>
              </Button>
              {data?.workouts.map((w) => (
                <Card key={w.id}>
                  <CardContent className="flex items-center gap-3 py-4">
                    <Dumbbell className="size-5 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {[
                          plural(w.exercises.length, "exercício", "exercícios"),
                          formatMuscleGroups(w.exercises),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      size="icon"
                      aria-label={`Editar ${w.name}`}
                      className="size-11 shrink-0"
                    >
                      <BuilderLink mode={mode} studentId={id} workoutId={w.id}>
                        <Pencil className="size-4" />
                      </BuilderLink>
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
                      {dayLabel(day)}
                    </p>
                    <Select value={value} onValueChange={(v) => assign(day, v)}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rest">Descanso</SelectItem>
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
        </>
      )}
    </AppShell>
  );
}

/** Link to the workout builder: the trainer's (with the student) or the student's own. */
function BuilderLink({
  mode,
  studentId,
  workoutId,
  children,
  ...rest
}: Props & { workoutId?: string; children: ReactNode }) {
  return mode === "trainer" ? (
    <Link to="/trainer/builder" search={{ student: studentId, workout: workoutId }} {...rest}>
      {children}
    </Link>
  ) : (
    <Link to="/student/builder" search={{ workout: workoutId }} {...rest}>
      {children}
    </Link>
  );
}
