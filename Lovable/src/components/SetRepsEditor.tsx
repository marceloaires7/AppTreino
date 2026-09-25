import { Flame, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { plural } from "@/lib/format";
import { isFailure, normalizeReps, resizeReps } from "@/lib/reps";
import { FAILURE_REPS } from "@/lib/types";

const MAX_SETS = 20;

interface Props {
  /** One target per set; its length is the number of sets. */
  reps: string[];
  onChange: (reps: string[]) => void;
}

/**
 * Number of sets and the reps of each. Every set shares one target unless "Variar por série" is
 * on; any target can be "Até a falha", by the Falha button or by typing "falha".
 */
export function SetRepsEditor({ reps, onChange }: Props) {
  const [perSet, setPerSet] = useState(() => reps.some((r) => r !== reps[0]));
  const count = reps.length;

  const setCount = (n: number) => onChange(resizeReps(reps, Math.min(MAX_SETS, Math.max(1, n))));
  const setAll = (value: string) => onChange(reps.map(() => value));
  const setOne = (i: number, value: string) =>
    onChange(reps.map((r, idx) => (idx === i ? value : r)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs">Séries e repetições</Label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Variar por série
          <Switch
            checked={perSet}
            onCheckedChange={(on) => {
              setPerSet(on);
              if (!on) setAll(reps[0] ?? "");
            }}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Uma série a menos"
          disabled={count <= 1}
          onClick={() => setCount(count - 1)}
        >
          <Minus className="size-4" />
        </Button>
        <span className="min-w-20 text-center text-sm font-semibold">
          {plural(count, "série", "séries")}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Uma série a mais"
          disabled={count >= MAX_SETS}
          onClick={() => setCount(count + 1)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {perSet ? (
        reps.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-xs font-semibold text-muted-foreground">
              {i + 1}ª
            </span>
            <RepsInput
              value={r}
              label={`Repetições da série ${i + 1}`}
              onChange={(v) => setOne(i, v)}
            />
          </div>
        ))
      ) : (
        <RepsInput value={reps[0] ?? ""} label="Repetições" onChange={setAll} />
      )}
    </div>
  );
}

function RepsInput({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <Input
        className="h-12 flex-1"
        aria-label={label}
        placeholder="12 ou 8-12"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(normalizeReps(e.target.value))}
      />
      <Toggle
        variant="outline"
        className="h-12 px-3 data-[state=on]:border-primary data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
        aria-label={`${label}: até a falha`}
        pressed={isFailure(value)}
        onPressedChange={(on) => onChange(on ? FAILURE_REPS : "")}
      >
        <Flame /> Falha
      </Toggle>
    </div>
  );
}
