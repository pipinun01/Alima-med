import { Link } from 'react-router-dom'

export function Logo() {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="На главную">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--accent-fg)]
          shadow-[var(--shadow-sm)] transition-transform duration-200 group-hover:scale-105"
        style={{ background: 'var(--grad)' }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3.5v17M3.5 12h17"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="whitespace-nowrap font-display text-[15.5px] font-semibold leading-none tracking-tight sm:text-[17px]">
        Личное<span className="text-grad"> инфо</span>
      </span>
    </Link>
  )
}
