import { createFileRoute, Link } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { BarChart3, Home, Timer, Trophy, Weight } from "lucide-react";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { useRequireRole } from "@/hooks/useRequireRole";
import { formatNumber, plural } from "@/lib/format";

export const Route = createFileRoute("/student/summary")({
  head: () => ({
    meta: [
      { title: "Treino concluído — IronLog" },
      { name: "description", content: "O resumo do seu treino: tempo, volume total e séries." },
      { property: "og:title", content: "Treino concluído — IronLog" },
      {
        property: "og:description",
        content: "O resumo do seu treino: tempo, volume total e séries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SummaryPage,
});

const messages = [
  "É assim que se constrói progresso: um treino de cada vez.",
  "Mais forte que ontem. A barra não mente.",
  "Constância vence intensidade. Hoje você teve as duas.",
];

function SummaryPage() {
  useRequireRole("student");
  const { lastSession } = useApp();

  useEffect(() => {
    if (!lastSession) return;
    const burst = (x: number) => confetti({ particleCount: 70, spread: 70, origin: { x, y: 0.6 } });
    burst(0.3);
    const t = setTimeout(() => burst(0.7), 250);
    return () => clearTimeout(t);
  }, [lastSession]);

  const totalSets = lastSession?.exercises.reduce((s, e) => s + e.sets.length, 0) ?? 0;
  const mins = Math.floor((lastSession?.durationSec ?? 0) / 60);
  const secs = (lastSession?.durationSec ?? 0) % 60;
  const message = messages[(lastSession?.exercises.length ?? 0) % messages.length];

  return (
    <AppShell title="Treino concluído" subtitle={lastSession?.workoutName}>
      {!lastSession ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum treino recente. Conclua um treino para ver o resumo.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/50 bg-gradient-to-b from-primary/20 to-transparent p-8 text-center">
            <Trophy className="mx-auto size-14 text-primary" />
            <h2 className="mt-4 text-2xl font-black tracking-tight">Mandou bem!</h2>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-6">
                <Timer className="size-5 text-primary" />
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Tempo total
                </p>
                <p className="text-2xl font-bold">
                  {mins} min {secs} s
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <Weight className="size-5 text-primary" />
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Volume total
                </p>
                <p className="text-2xl font-bold">{formatNumber(lastSession.totalVolume)} kg</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-2 py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {plural(totalSets, "série registrada", "séries registradas")}
              </p>
              {lastSession.exercises.map((ex) => (
                <div key={ex.exerciseName} className="flex justify-between text-sm">
                  <span className="truncate pr-2">{ex.exerciseName}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {plural(ex.sets.length, "série", "séries")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-3">
            <Button asChild className="h-14 text-base">
              <Link to="/student">
                <Home className="size-5" /> Voltar ao início
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-14 text-base">
              <Link to="/student/stats">
                <BarChart3 className="size-5" /> Ver progresso
              </Link>
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
