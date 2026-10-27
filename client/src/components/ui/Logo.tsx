import { Link } from "react-router-dom";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink" aria-label="CanvasHub home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1c2433" />
        <rect x="7" y="7" width="12" height="12" rx="2" fill="#ffd84d" />
        <path d="M14 25 L25 14" stroke="#2f5bea" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="25" cy="25" r="2.5" fill="#fff" />
      </svg>
      CanvasHub
    </Link>
  );
}
