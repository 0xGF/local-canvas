export function LocalCanvasLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Local Canvas"
      className={className}
      draggable={false}
    />
  );
}
