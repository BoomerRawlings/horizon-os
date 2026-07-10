type HorizonMarkProps = {
  className?: string;
  title?: string;
};

export function HorizonMark({ className = "", title = "HorizonOS" }: HorizonMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={`horizon-mark ${className}`}
      focusable="false"
      role="img"
      viewBox="0 0 120 120"
    >
      <title>{title}</title>
      <path className="horizon-mark-arc" d="M27 72 A33 33 0 0 1 93 72" pathLength={1} />
      <path className="horizon-mark-horizon" d="M3 80 C28 66 92 66 117 80" pathLength={1} />
      <path className="horizon-mark-beam" d="M60 80 L53 120 L67 120 Z" pathLength={1} />
      <path className="horizon-mark-star" d="M60 43 L64 56 L77 60 L64 64 L60 77 L56 64 L43 60 L56 56 Z" pathLength={1} />
    </svg>
  );
}
