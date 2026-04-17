import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import animationData from "../assets/local-canvas.json";

/**
 * Plays the logo animation once, waits 10 seconds, then plays again.
 */
export function LocalCanvasLogo({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const anim: AnimationItem = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData,
    });

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onComplete = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        anim.goToAndPlay(0, true);
      }, 10_000);
    };

    anim.addEventListener("complete", onComplete);

    return () => {
      if (timer) clearTimeout(timer);
      anim.removeEventListener("complete", onComplete);
      anim.destroy();
    };
  }, []);

  return <div ref={containerRef} className={className} aria-label="Local Canvas" role="img" />;
}
