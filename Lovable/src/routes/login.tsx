import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Dumbbell } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — IronLog" },
      {
        name: "description",
        content: "Entre no IronLog para seguir seu plano de treino ou acompanhar seus alunos.",
      },
      { property: "og:title", content: "Entrar — IronLog" },
      {
        property: "og:description",
        content: "Entre no IronLog para seguir seu plano de treino ou acompanhar seus alunos.",
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
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(loginName.trim(), password);
      router.navigate({ to: user.role === "trainer" ? "/trainer" : "/student" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
      setLoading(false);
    }
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
            Treino montado pelo seu personal. Registrado por você.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="login">Usuário</Label>
                <Input
                  id="login"
                  autoComplete="username"
                  autoCapitalize="none"
                  placeholder="seu usuário"
                  className="h-12"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
                {loading ? "Entrando…" : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
