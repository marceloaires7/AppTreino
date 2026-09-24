import { createFileRoute } from "@tanstack/react-router";
import { WorkoutBuilder } from "@/components/WorkoutBuilder";

/** Edit mode: the student creates or edits one of their own workouts. */
export const Route = createFileRoute("/student/builder")({
  validateSearch: (search: Record<string, unknown>) => ({
    workout: typeof search["workout"] === "string" ? search["workout"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Editar treino — AppTreino" },
      {
        name: "description",
        content: "Crie e edite seus treinos com séries, repetições, observações e vídeos.",
      },
      { property: "og:title", content: "Editar treino — AppTreino" },
      {
        property: "og:description",
        content: "Crie e edite seus treinos com séries, repetições, observações e vídeos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentBuilderPage,
});

function StudentBuilderPage() {
  const { workout } = Route.useSearch();
  return <WorkoutBuilder mode="student" workoutId={workout} />;
}
