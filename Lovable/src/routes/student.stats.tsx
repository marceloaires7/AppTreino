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
import type { SessionRecord } from "@/lib/types";
import { studentTabs } from "./student.index";

export const Route = createFileRoute("/student/stats")({
  head: () => ({
    meta: [
      { title: "Progress & Stats — IronLog" },
      { name: "description", content: "Track weight and volume progression for every exercise." },
      { property: "og:title", content: "Progress & Stats — IronLog" },
      {
        property: "og:description",
        content: "Track weight and volume progression for every exercise.",
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
          date: new Date(h.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
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
          No session history yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Select {...(current ? { value: current } : {})} onValueChange={setSelected}>
        <SelectTrigger className="h-12">
          <SelectValue placeholder="Select an exercise" />
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
            Top weight
          </TabsTrigger>
          <TabsTrigger value="volume" className="h-10">
            Volume
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            {current} · {metric === "weight" ? "heaviest set (kg)" : "session volume (kg)"}
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
  const { data } = useQuery({
    queryKey: ["history", user?.id],
    enabled: !!user,
    queryFn: () => (user ? api.getHistory(user.id) : Promise.resolve([])),
  });

  return (
    <AppShell
      title="Progress"
      subtitle="Your lifting history"
      footer={<TabBar items={studentTabs} />}
    >
      <ProgressCharts history={data ?? []} />
    </AppShell>
  );
}
