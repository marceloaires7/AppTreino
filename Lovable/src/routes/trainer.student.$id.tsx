import { createFileRoute } from "@tanstack/react-router";
import { StudentManager } from "@/components/StudentManager";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/trainer/student/$id")({
  head: () => ({
    meta: [
      { title: "Aluno — AppTreino" },
      {
        name: "description",
        content: "Monte os treinos, planeje a semana e acompanhe o progresso do aluno.",
      },
      { property: "og:title", content: "Aluno — AppTreino" },
      {
        property: "og:description",
        content: "Monte os treinos, planeje a semana e acompanhe o progresso do aluno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrainerStudentPage,
});

function TrainerStudentPage() {
  const { id } = Route.useParams();
  useRequireRole("trainer");
  return <StudentManager mode="trainer" studentId={id} />;
}
