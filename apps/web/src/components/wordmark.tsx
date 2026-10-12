export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <img
        src="/logo-mark.png"
        alt="AlphaBet"
        width={32}
        height={32}
        className="size-8 shrink-0"
      />
      <span
        aria-hidden
        className={`${compact ? 'hidden min-[400px]:inline' : 'inline'} text-lg font-black tracking-tight text-[var(--text)]`}
      >
        Alpha<span className="text-[var(--accent)]">Bet</span>
      </span>
    </span>
  );
}
