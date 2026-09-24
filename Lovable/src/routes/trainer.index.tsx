import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRequireRole } from "@/hooks/useRequireRole";
import { api } from "@/lib/api";

export const Route = createFileRoute("/trainer/")({
  head: () => ({
    meta: [
      { title: "Coach Dashboard — IronLog" },
      { name: "description", content: "Your student roster, recent activity and workout builder." },
      { property: "og:title", content: "Coach Dashboard — IronLog" },
      {
        property: "og:description",
        content: "Your student roster, recent activity and workout builder.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrainerDashboard,
});

function TrainerDashboard() {
  const user = useRequireRole("trainer");

  const { data: students, isPending } = useQuery({
    queryKey: ["students", user?.id],
    enabled: !!user,
    queryFn: () => (user ? api.getStudents() : Promise.resolve([])),
  });

  return (
    <AppShell title="Your students" subtitle={user?.name}>
      {isPending ? (
        <LoadingState />
      ) : (
        <>
          <Button asChild className="mb-4 h-14 w-full text-base font-bold">
            <Link to="/trainer/builder" search={{ student: undefined, workout: undefined }}>
              <Plus className="size-5" /> New workout
            </Link>
          </Button>

          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" /> {students?.length ?? 0} active students
          </div>

          <div className="space-y-3">
            {students?.map((s) => (
              <Card key={s.id}>
                <CardContent className="py-3">
                  <Link
                    to="/trainer/student/$id"
                    params={{ id: s.id }}
                    className="flex items-center gap-3"
                  >
                    <Avatar className="size-11">
                      <AvatarFallback className="bg-primary/15 font-bold text-primary">
                        {s.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                      <Badge variant="secondary" className="mt-1 text-[11px]">
                        {s.lastActivity ?? "No activity"}
                      </Badge>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
