import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, TabBar } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRequireRole } from "@/hooks/useRequireRole";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { SessionRecord } from "@/lib/types";
import { studentTabs } from "./student.index";

export const Route = createFileRoute("/student/stats")({
  head: () => ({
    meta: [
      { title: "Progresso — AppTreino" },
      {
        name: "description",
        content: "Acompanhe a evolução de carga e volume de cada exercício.",
      },
      { property: "og:title", content: "Progresso — AppTreino" },
      {
        property: "og:description",
        content: "Acompanhe a evolução de carga e volume de cada exercício.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatsPage,
});

export function ProgressCharts({ history }: { history: SessionRecord[] }) {
  const exercises = useMemo(
    () => [...new Set(history.flatMap((h) => h.exercises.map((e) => e.exerciseName)))],
    [history],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [metric, setMetric] = useState<"weight" | "volume">("weight");
  const current = selected ?? exercises[0] ?? null;

  const data = useMemo(() => {
    if (!current) return [];
    return history
      .map((h) => {
        const ex = h.exercises.find((e) => e.exerciseName === current);
        if (!ex) return null;
        return {
          date: formatDate(h.date, { month: "short", day: "numeric" }),
          weight: Math.max(...ex.sets.map((s) => s.weight)),
          volume: ex.sets.reduce((v, s) => v + s.weight * s.reps, 0),
        };
      })
      .filter((d): d is { date: string; weight: number; volume: number } => d !== null);
  }, [history, current]);

  if (exercises.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum treino registrado ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Select {...(current ? { value: current } : {})} onValueChange={setSelected}>
        <SelectTrigger className="h-12">
          <SelectValue placeholder="Escolha um exercício" />
        </SelectTrigger>
        <SelectContent>
          {exercises.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tabs value={metric} onValueChange={(v) => setMetric(v as "weight" | "volume")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="weight" className="h-10">
            Carga máxima
          </TabsTrigger>
          <TabsTrigger value="volume" className="h-10">
            Volume
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            {current} · {metric === "weight" ? "maior carga (kg)" : "volume do treino (kg)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--foreground)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  name={metric === "weight" ? "Carga máxima (kg)" : "Volume (kg)"}
                  stroke="var(--primary)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "var(--primary)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsPage() {
  const user = useRequireRole("student");
  const { data, isPending } = useQuery({
    queryKey: ["history", user?.id],
    enabled: !!user,
    queryFn: () => (user ? api.getHistory(user.id) : Promise.resolve([])),
  });

  return (
    <AppShell
      title="Progresso"
      subtitle="Seu histórico de cargas"
      footer={<TabBar items={studentTabs} />}
    >
      {isPending ? (
        <LoadingState />
      ) : (
        <>
          <ProgressCharts history={data ?? []} />
        </>
      )}
    </AppShell>
  );
}
