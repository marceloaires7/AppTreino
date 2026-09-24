import { createFileRoute } from "@tanstack/react-router";
import { WorkoutBuilder } from "@/components/WorkoutBuilder";

export const Route = createFileRoute("/trainer/builder")({
  validateSearch: (search: Record<string, unknown>) => ({
    student: typeof search["student"] === "string" ? search["student"] : undefined,
    workout: typeof search["workout"] === "string" ? search["workout"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Montar treino — AppTreino" },
      {
        name: "description",
        content: "Crie e edite treinos com séries, repetições, observações e vídeos.",
      },
      { property: "og:title", content: "Montar treino — AppTreino" },
      {
        property: "og:description",
        content: "Crie e edite treinos com séries, repetições, observações e vídeos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrainerBuilderPage,
});

function TrainerBuilderPage() {
  const { student, workout } = Route.useSearch();
  return <WorkoutBuilder mode="trainer" workoutId={workout} initialStudentId={student} />;
}
