import { Pencil, Timer } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const PRESETS = [30, 45, 60, 90, 120, 180];
const MAX_REST_SEC = 3600;

interface Props {
  exerciseName: string;
  /** Seconds. */
  value: number;
  /** keep: also change it in the workout plan, for the next times. */
  onSave: (seconds: number, keep: boolean) => Promise<void>;
}

/** An exercise's rest, shown on the workout screen, that opens an editor when tapped. */
export function RestEditor({ exerciseName, value, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState(String(value));
  const [keep, setKeep] = useState(true);
  const [saving, setSaving] = useState(false);
  const parsed = Math.round(Number(seconds));
  const valid = seconds.trim() !== "" && parsed >= 0 && parsed <= MAX_REST_SEC;

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      setSeconds(String(value));
      setKeep(true);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await onSave(parsed, keep);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          aria-label={`Descanso de ${exerciseName}: ${value} segundos. Alterar`}
        >
          <Timer className="size-3.5 text-primary" /> {value}s
          <Pencil className="size-3 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Descanso</DialogTitle>
          <DialogDescription>{exerciseName}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                className={cn(
                  "h-11",
                  parsed === preset && "border-primary bg-primary/15 text-primary",
                )}
                onClick={() => setSeconds(String(preset))}
              >
                {preset}s
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rest-seconds">Segundos</Label>
            <Input
              id="rest-seconds"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_REST_SEC}
              className="h-12 text-base"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            Manter nos próximos treinos
            <Switch checked={keep} onCheckedChange={setKeep} />
          </label>
          <Button type="submit" className="h-12 w-full text-base" disabled={!valid || saving}>
            {saving ? "Salvando…" : "Salvar descanso"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
