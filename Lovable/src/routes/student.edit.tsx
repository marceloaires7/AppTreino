import { createFileRoute } from "@tanstack/react-router";
import { StudentManager } from "@/components/StudentManager";
import { useRequireRole } from "@/hooks/useRequireRole";

/** Edit mode: the student manages their own workouts and week, like a trainer would. */
export const Route = createFileRoute("/student/edit")({
  head: () => ({
    meta: [
      { title: "Modo de edição — AppTreino" },
      { name: "description", content: "Crie e edite seus treinos e monte a sua semana." },
      { property: "og:title", content: "Modo de edição — AppTreino" },
      { property: "og:description", content: "Crie e edite seus treinos e monte a sua semana." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentEditPage,
});

function StudentEditPage() {
  const user = useRequireRole("student");
  return user ? <StudentManager mode="student" studentId={user.id} /> : null;
}
