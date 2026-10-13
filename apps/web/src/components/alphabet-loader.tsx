const sizes = { sm: 16, md: 28, lg: 44 } as const;

export function AlphaBetLoader({
  size = 'md',
  className = '',
}: {
  size?: keyof typeof sizes;
  className?: string;
}) {
  const px = sizes[size];
  return (
    <svg
      aria-hidden
      data-alphabet-loader=""
      viewBox="0 0 32 32"
      width={px}
      height={px}
      className={`ab-loader ${className}`}
    >
      <path className="ab-loader-track" d="M16 3 29 16 16 29 3 16Z" />
      <path className="ab-loader-arc" d="M16 3 29 16 16 29 3 16Z" pathLength={100} />
      <path className="ab-loader-core" d="M16 10.5 21.5 16 16 21.5 10.5 16Z" />
    </svg>
  );
}

export function TypingDots({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`ab-dots inline-flex items-center gap-1 ${className}`}>
      <span />
      <span />
      <span />
    </span>
  );
}
