import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Dumbbell, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";
import type { Role } from "@/lib/types";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — IronLog Training" },
      {
        name: "description",
        content: "Sign in to IronLog to run your training plan or coach your students.",
      },
      { property: "og:title", content: "Sign in — IronLog Training" },
      {
        property: "og:description",
        content: "Sign in to IronLog to run your training plan or coach your students.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useApp();
  const router = useRouter();

  async function go(role: Role) {
    await login(role);
    router.navigate({ to: role === "trainer" ? "/trainer" : "/student" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_0_40px_-8px_var(--primary)]">
            <Dumbbell className="size-8" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">IRONLOG</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Training built by your coach. Logged by you.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@ironlog.app" className="h-12" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" className="h-12" />
            </div>
            <Button className="h-12 w-full text-base" onClick={() => go("student")}>
              Sign in
            </Button>
          </CardContent>
        </Card>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          demo access
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-3">
          <Button variant="secondary" className="h-14 text-base" onClick={() => go("trainer")}>
            <ShieldCheck className="size-5" /> Login as Trainer
          </Button>
          <Button variant="outline" className="h-14 text-base" onClick={() => go("student")}>
            <User className="size-5" /> Login as Student
          </Button>
        </div>
      </div>
    </div>
  );
}
