import { X } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MUSCLE_GROUPS } from "@/lib/muscles";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (groups: string[]) => void;
}

/** The exercise's muscle groups as chips (tap to remove) and a menu to add more. */
export function MuscleGroupPicker({ value, onChange }: Props) {
  const available = MUSCLE_GROUPS.filter((g) => !value.includes(g));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((group) => (
        <button
          key={group}
          type="button"
          aria-label={`Remover ${group}`}
          className={cn(badgeVariants({ variant: "secondary" }), "h-9 gap-1 text-sm")}
          onClick={() => onChange(value.filter((g) => g !== group))}
        >
          {group} <X className="size-3.5" />
        </button>
      ))}
      {available.length ? (
        // The empty value keeps the placeholder showing after each pick.
        <Select value="" onValueChange={(group) => onChange([...value, group])}>
          <SelectTrigger className="h-9 w-auto gap-2 text-sm" aria-label="Adicionar grupo muscular">
            <SelectValue placeholder="Adicionar" />
          </SelectTrigger>
          <SelectContent>
            {available.map((group) => (
              <SelectItem key={group} value={group}>
                {group}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
