import { LoaderCircle } from "lucide-react";

/** Shown while a screen waits for the Apps Script backend, which can take several seconds. */
export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-7 animate-spin text-primary" />
      {label}
    </div>
  );
}
