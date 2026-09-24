import { PlayCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toEmbedUrl } from "@/lib/api";

export function VideoDialog({ name, url }: { name: string; url?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const embed = toEmbedUrl(url);
  if (!embed) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 text-primary"
        aria-label={`Ver vídeo de ${name}`}
        onClick={() => setOpen(true)}
      >
        <PlayCircle className="size-6" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-left text-base">{name}</DialogTitle>
          </DialogHeader>
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            {open ? (
              <iframe
                src={embed}
                title={`Vídeo de ${name}`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
