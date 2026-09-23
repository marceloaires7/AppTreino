import { createFileRoute, Link } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { BarChart3, Home, Timer, Trophy, Weight } from "lucide-react";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/student/summary")({
  head: () => ({
    meta: [
      { title: "Workout Complete — IronLog" },
      { name: "description", content: "Your session recap: time, total volume lifted and sets." },
      { property: "og:title", content: "Workout Complete — IronLog" },
      {
        property: "og:description",
        content: "Your session recap: time, total volume lifted and sets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SummaryPage,
});

const messages = [
  "That's how progress is built. One session at a time.",
  "Stronger than yesterday. The bar doesn't lie.",
  "Consistency beats intensity. You had both today.",
];

function SummaryPage() {
  useRequireRole("student");
  const { lastSession } = useApp();

  useEffect(() => {
    if (!lastSession) return;
    const burst = (x: number) =>
      confetti({ particleCount: 70, spread: 70, origin: { x, y: 0.6 } });
    burst(0.3);
    const t = setTimeout(() => burst(0.7), 250);
    return () => clearTimeout(t);
  }, [lastSession]);

  const totalSets = lastSession?.exercises.reduce((s, e) => s + e.sets.length, 0) ?? 0;
  const mins = Math.floor((lastSession?.durationSec ?? 0) / 60);
  const secs = (lastSession?.durationSec ?? 0) % 60;
  const message = messages[(lastSession?.exercises.length ?? 0) % messages.length];

  return (
    <AppShell title="Workout complete" subtitle={lastSession?.workoutName}>
      {!lastSession ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No recent session yet. Finish a workout to see your recap.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/50 bg-gradient-to-b from-primary/20 to-transparent p-8 text-center">
            <Trophy className="mx-auto size-14 text-primary" />
            <h2 className="mt-4 text-2xl font-black tracking-tight">Session crushed</h2>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-6">
                <Timer className="size-5 text-primary" />
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Total time
                </p>
                <p className="text-2xl font-bold">
                  {mins}m {secs}s
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <Weight className="size-5 text-primary" />
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Total volume
                </p>
                <p className="text-2xl font-bold">
                  {Math.round(lastSession.totalVolume).toLocaleString()} kg
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-2 py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {totalSets} sets logged
              </p>
              {lastSession.exercises.map((ex) => (
                <div key={ex.exerciseName} className="flex justify-between text-sm">
                  <span className="truncate pr-2">{ex.exerciseName}</span>
                  <span className="shrink-0 text-muted-foreground">{ex.sets.length} sets</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-3">
            <Button asChild className="h-14 text-base">
              <Link to="/student">
                <Home className="size-5" /> Back home
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-14 text-base">
              <Link to="/student/stats">
                <BarChart3 className="size-5" /> View progress
              </Link>
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
