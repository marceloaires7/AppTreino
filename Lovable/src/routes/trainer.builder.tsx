import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRequireRole } from "@/hooks/useRequireRole";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import type { Exercise, Workout } from "@/lib/types";

export const Route = createFileRoute("/trainer/builder")({
  validateSearch: (search: Record<string, unknown>) => ({
    student: typeof search["student"] === "string" ? search["student"] : undefined,
    workout: typeof search["workout"] === "string" ? search["workout"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Montar treino — IronLog" },
      {
        name: "description",
        content: "Crie e edite treinos com séries, repetições, observações e vídeos.",
      },
      { property: "og:title", content: "Montar treino — IronLog" },
      {
        property: "og:description",
        content: "Crie e edite treinos com séries, repetições, observações e vídeos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BuilderPage,
});

const emptyExercise = (): Exercise => ({
  id: `ex-${Math.random().toString(36).slice(2, 9)}`,
  name: "",
  sets: 3,
  reps: "10",
  weight: 20,
  restSec: 90,
  videoUrl: "",
  notes: "",
  rir: "",
  substitute: "",
});

function BuilderPage() {
  const trainer = useRequireRole("trainer");
  const { student, workout: workoutId } = Route.useSearch();
  const router = useRouter();

  const { data: students } = useQuery({
    queryKey: ["students", trainer?.id],
    enabled: !!trainer,
    queryFn: () => (trainer ? api.getStudents() : Promise.resolve([])),
  });

  const [studentId, setStudentId] = useState(student ?? "");
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([emptyExercise()]);

  useEffect(() => {
    if (!workoutId) return;
    api.getWorkout(workoutId).then((w) => {
      if (!w) return;
      setName(w.name);
      setStudentId(w.studentId);
      setExercises(w.exercises.map((e) => ({ ...e })));
    });
  }, [workoutId]);

  const patch = (i: number, p: Partial<Exercise>) =>
    setExercises((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...p } : e)));

  async function save() {
    if (!name.trim() || !studentId) {
      toast.error("Dê um nome ao treino e escolha um aluno");
      return;
    }
    const payload: Workout = {
      id: workoutId ?? `w-${Date.now()}`,
      name: name.trim(),
      studentId,
      exercises: exercises.filter((e) => e.name.trim()),
    };
    await api.saveWorkout(payload);
    toast.success("Treino salvo", {
      description: plural(payload.exercises.length, "exercício", "exercícios"),
    });
    router.navigate({ to: "/trainer/student/$id", params: { id: studentId } });
  }

  return (
    <AppShell
      title={workoutId ? "Editar treino" : "Novo treino"}
      subtitle="Montagem de treino"
      back={
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <Link to="/trainer">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="space-y-2">
              <Label htmlFor="wname">Nome do treino</Label>
              <Input
                id="wname"
                className="h-12"
                placeholder="Treino A — Peito e ombros"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Aluno</Label>
              <Select {...(studentId ? { value: studentId } : {})} onValueChange={setStudentId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Escolha um aluno" />
                </SelectTrigger>
                <SelectContent>
                  {students?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {exercises.map((ex, i) => (
          <Card key={ex.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Exercício {i + 1}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover exercício"
                  className="size-11 text-destructive"
                  onClick={() => setExercises((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-5" />
                </Button>
              </div>
              <Input
                className="h-12"
                placeholder="Nome do exercício"
                value={ex.name}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Séries</Label>
                  <Input
                    className="h-12"
                    type="number"
                    value={ex.sets}
                    onChange={(e) => patch(i, { sets: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Repetições</Label>
                  <Input
                    className="h-12"
                    value={ex.reps}
                    onChange={(e) => patch(i, { reps: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Carga (kg)</Label>
                  <Input
                    className="h-12"
                    type="number"
                    value={ex.weight}
                    onChange={(e) => patch(i, { weight: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descanso (s)</Label>
                  <Input
                    className="h-12"
                    type="number"
                    value={ex.restSec}
                    onChange={(e) => patch(i, { restSec: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Link do vídeo (YouTube / Vimeo)</Label>
                <Input
                  className="h-12"
                  placeholder="https://youtube.com/watch?v=..."
                  value={ex.videoUrl ?? ""}
                  onChange={(e) => patch(i, { videoUrl: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Observações do personal</Label>
                <Textarea
                  placeholder="Mantenha o peito aberto"
                  value={ex.notes ?? ""}
                  onChange={(e) => patch(i, { notes: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">RIR / RPE</Label>
                  <Input
                    className="h-12"
                    placeholder="RIR 2"
                    value={ex.rir ?? ""}
                    onChange={(e) => patch(i, { rir: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Substituto</Label>
                  <Input
                    className="h-12"
                    placeholder="Opcional"
                    value={ex.substitute ?? ""}
                    onChange={(e) => patch(i, { substitute: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button
          variant="outline"
          className="h-14 w-full"
          onClick={() => setExercises((p) => [...p, emptyExercise()])}
        >
          <Plus className="size-5" /> Adicionar exercício
        </Button>
        <Button className="h-14 w-full text-base font-bold" onClick={save}>
          <Save className="size-5" /> Salvar treino
        </Button>
      </div>
    </AppShell>
  );
}
