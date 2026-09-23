import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import type { Role } from "@/lib/types";

export function useRequireRole(role: Role) {
  const { user, ready } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.navigate({ to: "/login" });
    else if (user.role !== role)
      router.navigate({ to: user.role === "trainer" ? "/trainer" : "/student" });
  }, [ready, user, role, router]);

  return user && user.role === role ? user : null;
}
