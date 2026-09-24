import { Plus, SkipForward, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Props {
  seconds: number;
  onDone: () => void;
}

export function RestTimer({ seconds, onDone }: Props) {
  const [total, setTotal] = useState(seconds);
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    setTotal(seconds);
    setLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (left <= 0) {
      onDone();
      return;
    }
    const id = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [left, onDone]);

  const mm = String(Math.floor(Math.max(left, 0) / 60)).padStart(2, "0");
  const ss = String(Math.max(left, 0) % 60).padStart(2, "0");

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
        <Button
          variant="secondary"
          className="h-11"
          onClick={() => {
            setTotal((t) => t + 30);
            setLeft((v) => v + 30);
          }}
        >
          <Plus className="size-4" /> 30s
        </Button>
        <Button className="h-11" onClick={onDone}>
          <SkipForward className="size-4" /> Pular
        </Button>
      </div>
      <Progress value={(1 - left / Math.max(total, 1)) * 100} className="mt-3 h-2" />
    </div>
  );
}
