import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import animationData from "../assets/local-canvas.json";

/**
 * Continuously loops the logo animation.
 */
export function LocalCanvasLogo({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const anim: AnimationItem = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData,
      rendererSettings: {
        // Left-align the SVG inside its container — the default is xMidYMid meet
        // which centers and leaves whitespace when the container is wider than
        // the animation's aspect ratio.
        preserveAspectRatio: "xMinYMid meet",
      },
    });

    return () => {
      anim.destroy();
    };
  }, []);

  return <div ref={containerRef} className={className} aria-label="Local Canvas" role="img" />;
}
