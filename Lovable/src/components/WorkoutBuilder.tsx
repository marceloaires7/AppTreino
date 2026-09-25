import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { MuscleGroupPicker } from "@/components/MuscleGroupPicker";
import { SetRepsEditor } from "@/components/SetRepsEditor";
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
import { inferMuscleGroups, muscleGroupsOf } from "@/lib/muscles";
import { normalizeReps, resizeReps } from "@/lib/reps";
import type { Exercise, Workout } from "@/lib/types";

const emptyExercise = (): Exercise => ({
  id: `ex-${Math.random().toString(36).slice(2, 9)}`,
  name: "",
  sets: 3,
  reps: ["10", "10", "10"],
  weight: 20,
  restSec: 90,
  videoUrl: "",
  notes: "",
  rir: "",
  muscleGroups: [],
  substitute: "",
  substituteVideoUrl: "",
});

interface Props {
  /** "trainer": for one of their students. "student": edit mode, always for themselves. */
  mode: "trainer" | "student";
  /** The workout to edit; without it a new workout is created. */
  workoutId?: string | undefined;
  /** Trainer only: the student preselected in the picker. */
  initialStudentId?: string | undefined;
}

/** Create or edit a workout. The trainer picks the student; a student edits their own plan. */
export function WorkoutBuilder({ mode, workoutId, initialStudentId }: Props) {
  const user = useRequireRole(mode);
  const router = useRouter();

  const { data: students } = useQuery({
    queryKey: ["students", user?.id],
    enabled: mode === "trainer" && !!user,
    queryFn: () => api.getStudents(),
  });

  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([emptyExercise()]);
  const ownerId = mode === "student" ? (user?.id ?? "") : studentId;

  useEffect(() => {
    if (!workoutId) return;
    api.getWorkout(workoutId).then((w) => {
      if (!w) return;
      setName(w.name);
      setStudentId(w.studentId);
      setDescription(w.description ?? "");
      // Groups guessed from the name are filled in here, so they can be checked before saving.
      setExercises(
        w.exercises.map((e) => ({
          ...e,
          reps: resizeReps(e.reps, Math.max(1, e.reps.length)),
          muscleGroups: muscleGroupsOf(e),
        })),
      );
    });
  }, [workoutId]);

  const patch = (i: number, p: Partial<Exercise>) =>
    setExercises((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...p } : e)));

  async function save() {
    if (!name.trim() || !ownerId) {
      toast.error(
        mode === "trainer" ? "Dê um nome ao treino e escolha um aluno" : "Dê um nome ao treino",
      );
      return;
    }
    const payload: Workout = {
      id: workoutId ?? `w-${Date.now()}`,
      name: name.trim(),
      studentId: ownerId,
      description: description.trim(),
      exercises: exercises
        .filter((e) => e.name.trim())
        .map((e) => ({ ...e, sets: e.reps.length, reps: e.reps.map(normalizeReps) })),
    };
    await api.saveWorkout(payload);
    toast.success("Treino salvo", {
      description: plural(payload.exercises.length, "exercício", "exercícios"),
    });
    if (mode === "trainer")
      router.navigate({ to: "/trainer/student/$id", params: { id: ownerId } });
    else router.navigate({ to: "/student/edit" });
  }

  return (
    <AppShell
      title={workoutId ? "Editar treino" : "Novo treino"}
      subtitle={mode === "trainer" ? "Montagem de treino" : "Modo de edição"}
      back={
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          {mode === "trainer" ? (
            <Link to="/trainer">
              <ArrowLeft className="size-5" />
            </Link>
          ) : (
            <Link to="/student/edit">
              <ArrowLeft className="size-5" />
            </Link>
          )}
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
              <Label htmlFor="wdescription">Descrição</Label>
              <Textarea
                id="wdescription"
                placeholder="Objetivo, aquecimento, cuidados…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {mode === "trainer" ? (
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
            ) : null}
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
                onBlur={() => {
                  if (!ex.muscleGroups?.length)
                    patch(i, { muscleGroups: inferMuscleGroups(ex.name) });
                }}
              />
              <div className="space-y-1">
                <Label className="text-xs">Grupos musculares</Label>
                <MuscleGroupPicker
                  value={ex.muscleGroups ?? []}
                  onChange={(muscleGroups) => patch(i, { muscleGroups })}
                />
              </div>
              <SetRepsEditor
                reps={ex.reps}
                onChange={(reps) => patch(i, { reps, sets: reps.length })}
              />
              <div className="grid grid-cols-2 gap-3">
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
                <Label className="text-xs">Observações</Label>
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
              <div className="space-y-1">
                <Label className="text-xs">Vídeo do substituto (YouTube / Vimeo)</Label>
                <Input
                  className="h-12"
                  placeholder="https://youtube.com/watch?v=..."
                  value={ex.substituteVideoUrl ?? ""}
                  onChange={(e) => patch(i, { substituteVideoUrl: e.target.value })}
                />
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
