// The Gigroom mark: a doorway (the "room" where work happens) with a lavender
// speech bubble (the conversation that starts every gig). Hand-drawn SVG, no icon pack.
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M7 28.5V13a9 9 0 0 1 18 0v15.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M3.5 28.5h25" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="20" cy="19.5" r="1.7" fill="currentColor" />
      <path d="M19.5 2.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5.5l-3 2.5v-2.5h-1.5A1.5 1.5 0 0 1 18 9V4a1.5 1.5 0 0 1 1.5-1.5Z" fill="#E9E1F8" />
    </svg>
  );
}
