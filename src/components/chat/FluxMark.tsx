export function FluxMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 24h12a8 8 0 0 1 8 8v0a8 8 0 0 0 8 8h12" />
      <polyline points="44 32 52 40 44 48" />
      <path d="M52 40H40a8 8 0 0 1-8-8v0a8 8 0 0 0-8-8H12" />
      <polyline points="20 32 12 24 20 16" />
      <circle cx="12" cy="40" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}