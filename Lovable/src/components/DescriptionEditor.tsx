import { Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

interface Props {
  workoutName: string;
  value: string;
  /** Rejects when the save failed; api.ts has already shown why. */
  onSave: (description: string) => Promise<void>;
}

/** Pencil button that edits a workout's description (Treinos.Descricao in the spreadsheet). */
export function DescriptionEditor({ workoutName, value, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) setText(value);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(text.trim());
      setOpen(false);
    } catch {
      // The dialog stays open with the text, to try again.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={value ? "Editar descrição" : "Adicionar descrição"}
          className="size-11 shrink-0"
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Descrição do treino</DialogTitle>
          <DialogDescription>{workoutName}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Textarea
            aria-label="Descrição"
            rows={6}
            placeholder="Objetivo, aquecimento, cuidados…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" className="h-12 w-full text-base" disabled={saving}>
            {saving ? "Salvando…" : "Salvar descrição"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
