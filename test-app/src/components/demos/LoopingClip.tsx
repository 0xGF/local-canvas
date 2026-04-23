import { useEffect, useRef } from "react";

type Source = { src: string; type?: string };

/**
 * A muted, auto-looping clip for inline docs demos. Plays only while the
 * element is in the viewport (IntersectionObserver) so offscreen clips don't
 * eat CPU/battery. On `prefers-reduced-motion: reduce` we show the poster
 * frame and skip playback entirely.
 *
 * Drop MP4s (and optional WebM fallback) into `test-app/public/demos/`.
 */
export function LoopingClip({
  src,
  webm,
  poster,
  caption,
  aspectRatio = "16 / 9",
}: {
  src: string;
  webm?: string;
  poster?: string;
  caption?: string;
  aspectRatio?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const sources: Source[] = [
    ...(webm ? [{ src: webm, type: "video/webm" }] : []),
    { src, type: "video/mp4" },
  ];

  return (
    <figure className="my-2 w-full 2xl:h-[356px] sm:h-[327px] xl:h-auto">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 sm:h-full xl:pb-0.5 xl:h-auto"
        style={{ aspectRatio }}
      >
        <video
          ref={ref}
          className="absolute inset-0 object-cover xl:w-auto xl:h-full"
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          aria-label={caption}
        >
          {sources.map((s) => (
            <source key={s.src} src={s.src} type={s.type} />
          ))}
        </video>
      </div>
      {caption && (
        <figcaption className="mt-2 text-[12px] text-neutral-500 leading-snug xl:block">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
