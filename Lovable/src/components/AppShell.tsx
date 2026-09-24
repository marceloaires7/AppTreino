import { Link, useRouter } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";

interface Props {
  title: string;
  subtitle?: string | undefined;
  back?: ReactNode | undefined;
  children: ReactNode;
  footer?: ReactNode | undefined;
}

export function AppShell({ title, subtitle, back, children, footer }: Props) {
  const { user, logout } = useApp();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col border-border/60 md:border-x">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            {back}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
              {subtitle ? (
                <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {user ? <ChangePasswordDialog /> : null}
            {user ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Log out"
                className="size-11"
                onClick={() => {
                  logout();
                  router.navigate({ to: "/login" });
                }}
              >
                <LogOut className="size-5" />
              </Button>
            ) : null}
          </div>
        </header>
        <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
        {footer}
      </div>
    </div>
  );
}

type TabTo = "/student" | "/student/schedule" | "/student/stats";

export function TabBar({ items }: { items: { to: TabTo; label: string; icon: ReactNode }[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-border/60 bg-card/95 backdrop-blur">
      <ul className="grid grid-cols-3">
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ exact: true }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-semibold"
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
