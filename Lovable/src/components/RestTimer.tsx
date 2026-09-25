import { Plus, SkipForward, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Props {
  /** Epoch milliseconds. */
  endsAt: number;
  totalSec: number;
  onAdd: (seconds: number) => void;
  onDone: () => void;
}

/**
 * Rest countdown. It follows the clock rather than counting ticks, so it stays right when the
 * phone locks, the app goes to the background or the student leaves the screen and comes back.
 */
export function RestTimer({ endsAt, totalSec, onAdd, onDone }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-primary/40 bg-card p-4 shadow-[0_-8px_40px_-12px_var(--primary)]">
      <div className="flex items-center gap-3">
        <Timer className="size-5 text-primary" />
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Descanso
          </p>
          <p className="font-mono text-3xl font-bold leading-none text-primary">
            {mm}:{ss}
          </p>
        </div>
        <Button variant="secondary" className="h-11" onClick={() => onAdd(30)}>
          <Plus className="size-4" /> 30s
        </Button>
        <Button className="h-11" onClick={onDone}>
          <SkipForward className="size-4" /> Pular
        </Button>
      </div>
      <Progress value={(1 - left / Math.max(totalSec, 1)) * 100} className="mt-3 h-2" />
    </div>
  );
}
