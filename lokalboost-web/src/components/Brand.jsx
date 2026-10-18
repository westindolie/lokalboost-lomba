import { Link } from 'react-router-dom'

export default function Brand({ to = '/', className = '', mark = false }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 ${className}`}>
      {mark && (
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M6 15c-1 2-1 4-1 4s2 0 4-1M9 15l-3-3c2-6 6-9 12-9 0 6-3 10-9 12z"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      <span className="text-xl font-extrabold tracking-tight text-navy">
        Lokal<span className="text-navy-light">Boost</span>
      </span>
    </Link>
  )
}
