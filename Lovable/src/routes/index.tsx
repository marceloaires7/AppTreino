import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useApp } from "@/context/AppContext";

export const Route = createFileRoute("/")({
  // Redirect after mount rather than in beforeLoad: on the static GitHub Pages build, "/" is
  // hydrated from the prerendered shell, and redirecting during hydration causes a mismatch.
  component: StartPage,
});

/** The installed app opens here: straight to the signed-in user's screen, or to the login. */
function StartPage() {
  const { user, ready } = useApp();
  if (!ready) return null;
  const to = !user ? "/login" : user.role === "trainer" ? "/trainer" : "/student";
  return <Navigate to={to} replace />;
}
