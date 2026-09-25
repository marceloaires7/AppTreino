import { ExternalLink, PlayCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Video {
  /** iframe: a player page; file: a video file; link: a page that cannot be embedded. */
  kind: "iframe" | "file" | "link";
  src: string;
  /** The link as typed, to open outside the app. */
  href: string;
}

/** How to play a video link: embedded (YouTube, Vimeo, Google Drive, video files) or opened outside. */
function videoFor(url: string | undefined): Video | null {
  const raw = url?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  // Web links only: a "javascript:" link would run inside the app.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const href = parsed.href;

  const youtube = /youtu/.test(parsed.hostname)
    ? href.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{6,})/)
    : null;
  if (youtube)
    return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${youtube[1]}`, href };
  const vimeo = href.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}`, href };
  const drive = href.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive)
    return { kind: "iframe", src: `https://drive.google.com/file/d/${drive[1]}/preview`, href };
  if (/\.(mp4|webm|mov|m4v)$/i.test(parsed.pathname)) return { kind: "file", src: href, href };
  // Instagram, TikTok and most other sites refuse to play inside another page.
  return { kind: "link", src: href, href };
}

interface Props {
  name: string;
  url?: string | undefined;
  className?: string | undefined;
}

/** Play button for an exercise video. Nothing is shown when the exercise has no video. */
export function VideoDialog({ name, url, className }: Props) {
  const [open, setOpen] = useState(false);
  const video = videoFor(url);
  if (!video) return null;

  const buttonClass = cn("size-11 shrink-0 text-primary", className);
  if (video.kind === "link") {
    return (
      <Button asChild variant="ghost" size="icon" className={buttonClass}>
        <a
          href={video.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ver vídeo de ${name}`}
        >
          <PlayCircle className="size-6" />
        </a>
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={buttonClass}
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
            {!open ? null : video.kind === "file" ? (
              <video src={video.src} controls playsInline className="h-full w-full" />
            ) : (
              <iframe
                src={video.src}
                title={`Vídeo de ${name}`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
          <a
            href={video.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
          >
            <ExternalLink className="size-4" /> Abrir em outra aba
          </a>
        </DialogContent>
      </Dialog>
    </>
  );
}
