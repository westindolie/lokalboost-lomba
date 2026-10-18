// Lightweight inline SVG icon set (stroke-based, inherits currentColor).
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Svg({ children, size = 20, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} {...rest}>
      {children}
    </svg>
  )
}

export const Shield = (p) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path d="M9.2 12l2 2 3.6-3.8" />
  </Svg>
)
export const Chart = (p) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <rect x="6" y="11" width="3" height="6" rx="1" />
    <rect x="11" y="7" width="3" height="10" rx="1" />
    <rect x="16" y="13" width="3" height="4" rx="1" />
  </Svg>
)
export const Scissors = (p) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8.1 7.6L20 18M8.1 16.4L20 6" />
  </Svg>
)
export const Doc = (p) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
)
export const Users = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0111 0" />
    <path d="M16 6.2a3 3 0 010 5.6M17.5 19a5.5 5.5 0 00-3-4.9" />
  </Svg>
)
export const User = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 19.5a7 7 0 0114 0" />
  </Svg>
)
export const Store = (p) => (
  <Svg {...p}>
    <path d="M4 9l1-5h14l1 5" />
    <path d="M4 9v10h16V9M4 9h16M4 9a2.5 2.5 0 004 1 2.5 2.5 0 004 0 2.5 2.5 0 004 0 2.5 2.5 0 004-1" />
    <path d="M9 19v-5h6v5" />
  </Svg>
)
export const Video = (p) => (
  <Svg {...p}>
    <rect x="3" y="6" width="12" height="12" rx="2" />
    <path d="M15 10l6-3v10l-6-3" />
  </Svg>
)
export const Wallet = (p) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M16 14h2" />
  </Svg>
)
export const Eye = (p) => (
  <Svg {...p}>
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
)
export const Sparkles = (p) => (
  <Svg {...p}>
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z" />
    <path d="M18 15l.7 1.8L20.5 17.5l-1.8.7L18 20l-.7-1.8L15.5 17.5l1.8-.7L18 15z" />
  </Svg>
)
export const Check = (p) => (
  <Svg {...p}>
    <path d="M5 12.5l4 4 10-10" />
  </Svg>
)
export const ArrowRight = (p) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)
export const Bell = (p) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 20a2 2 0 004 0" />
  </Svg>
)
export const Grid = (p) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
)
export const Rocket = (p) => (
  <Svg {...p}>
    <path d="M5 15c-1 2-1 4-1 4s2 0 4-1M9 15l-3-3c2-6 6-9 12-9 0 6-3 10-9 12l-0-0z" />
    <circle cx="14.5" cy="9.5" r="1.5" />
  </Svg>
)
export const MapPin = (p) => (
  <Svg {...p}>
    <path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
)
export const Clock = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </Svg>
)
export const Upload = (p) => (
  <Svg {...p}>
    <path d="M12 16V5M8 9l4-4 4 4" />
    <path d="M5 19h14" />
  </Svg>
)
export const Star = (p) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M12 3.5l2.5 5.1 5.6.8-4 4 1 5.6L12 16.9 7 19l1-5.6-4-4 5.6-.8L12 3.5z" />
  </Svg>
)
export const Quote = (p) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M9 7c-3 0-5 2-5 5v5h6v-6H6c0-2 1-3 3-3V7zm10 0c-3 0-5 2-5 5v5h6v-6h-4c0-2 1-3 3-3V7z" />
  </Svg>
)
export const Target = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Svg>
)
export const Coins = (p) => (
  <Svg {...p}>
    <ellipse cx="9" cy="7" rx="5" ry="2.5" />
    <path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" />
    <path d="M10 15c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4" />
    <ellipse cx="15" cy="11" rx="5" ry="2.5" />
  </Svg>
)
export const Search = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Svg>
)
export const Mail = (p) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </Svg>
)
export const Phone = (p) => (
  <Svg {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </Svg>
)
export const Lock = (p) => (
  <Svg {...p}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 018 0V10" />
  </Svg>
)
export const Bank = (p) => (
  <Svg {...p}>
    <path d="M3.5 9.5L12 4l8.5 5.5" />
    <path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8" />
    <path d="M3.5 20.5h17" />
  </Svg>
)
export const Scale = (p) => (
  <Svg {...p}>
    <path d="M12 4v16M7 20h10" />
    <path d="M4 8h16M4 8l-2 5a3 3 0 006 0zM20 8l2 5a3 3 0 01-6 0z" />
  </Svg>
)
export const Message = (p) => (
  <Svg {...p}>
    <path d="M20.5 12.5c0 3.9-3.8 7-8.5 7-1.1 0-2.2-.2-3.1-.5L4 20.5l1.6-3.6A6.6 6.6 0 013.5 12.5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z" />
  </Svg>
)
export const Calendar = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
  </Svg>
)
export const Download = (p) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </Svg>
)
export const Close = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)
export const Menu = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)
export const Plus = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const ChevronRight = (p) => (
  <Svg {...p}>
    <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />
  </Svg>
)
export const ChevronDown = (p) => (
  <Svg {...p}>
    <path d="M5.5 9.5L12 16l6.5-6.5" />
  </Svg>
)
export const Info = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none" />
  </Svg>
)
export const Image = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="8.8" cy="10" r="1.6" />
    <path d="M4.5 17l4.8-4.6L20 19" />
  </Svg>
)
export const Filter = (p) => (
  <Svg {...p}>
    <path d="M4 6.5h16M7 12h10M10 17.5h4" />
  </Svg>
)
export const Play = (p) => (
  <Svg {...p}>
    <path d="M8.5 5.8l9 6.2-9 6.2z" />
  </Svg>
)
