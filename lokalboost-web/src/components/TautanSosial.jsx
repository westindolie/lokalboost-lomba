/**
 * Akun media sosial yang diisi sendiri oleh UMKM/kreator.
 *
 * Ikonnya bentuk sederhana, bukan logo resmi: cukup untuk mengenali
 * platform tanpa membawa aset merek pihak lain ke dalam aplikasi.
 */

export const PLATFORM_SOSIAL = [
  { id: 'instagram', nama: 'Instagram', contoh: '@namaakun atau instagram.com/namaakun' },
  { id: 'tiktok', nama: 'TikTok', contoh: '@namaakun atau tiktok.com/@namaakun' },
  { id: 'youtube', nama: 'YouTube', contoh: '@namachannel atau youtube.com/@namachannel' },
]

export function IkonSosial({ platform, size = 16, className = '' }) {
  const umum = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    className,
  }
  if (platform === 'instagram') {
    return (
      <svg {...umum}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
      </svg>
    )
  }
  if (platform === 'tiktok') {
    return (
      <svg {...umum}>
        <path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8" />
        <path d="M14 3.5c.4 2.6 2.2 4.4 5 4.7" />
      </svg>
    )
  }
  return (
    <svg {...umum}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor" />
    </svg>
  )
}

/** "https://www.instagram.com/warung.sari" -> "@warung.sari". */
export function namaAkun(url) {
  try {
    const segmen = new URL(url).pathname.split('/').filter(Boolean)
    if (segmen[0] === 'channel') return 'Channel YouTube'
    const akun = (segmen[0] || '').replace(/^@/, '')
    return akun ? `@${akun}` : url
  } catch {
    return url
  }
}

/** Deretan tautan akun; tidak merender apa pun bila semuanya kosong. */
export function DaftarSosial({ sosial, className = '' }) {
  const ada = PLATFORM_SOSIAL.filter((p) => sosial?.[p.id])
  if (!ada.length) return null
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {ada.map((p) => (
        <li key={p.id}>
          <a
            href={sosial[p.id]}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-navy/30 hover:bg-cream-100"
            aria-label={`${p.nama} ${namaAkun(sosial[p.id])}`}
          >
            <IkonSosial platform={p.id} size={14} />
            <span className="truncate">{namaAkun(sosial[p.id])}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
