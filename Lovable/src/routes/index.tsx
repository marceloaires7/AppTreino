import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  // Redirect after mount rather than in beforeLoad: on the static GitHub Pages build, "/" is
  // hydrated from the prerendered shell, and redirecting during hydration causes a mismatch.
  component: () => <Navigate to="/login" replace />,
});
