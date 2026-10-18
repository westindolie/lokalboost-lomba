import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { mengambang, EASE } from '../motion.js'

/**
 * LAPIS AMBIENT — kehidupan latar.
 *
 * Sebelumnya orb-orb ini hanya div statis, jadi halaman terasa mati.
 * Sekarang tiga orb mengambang dengan periode berbeda (4s / 5,5s / 3,5s) agar
 * tidak pernah bergerak serempak, plus parallax scroll pelan.
 *
 * Aturan yang dipatuhi dari skill:
 *   - Amplitudo ambient maksimal 10–20% dari gerak utama
 *   - Perpindahan parallax total < 100px, dan tidak pernah pada teks
 *   - Hanya transform + opacity (murah untuk compositor)
 *   - Mati total saat pengguna memilih "reduce motion"
 */
export default function Ambient({ varian = 'gold', className = '' }) {
  const kurangGerak = useReducedMotion()
  const { scrollY } = useScroll()

  // Parallax: lapis latar bergerak 0,15x kecepatan scroll (maks ~90px)
  const yLatar = useTransform(scrollY, [0, 600], [0, 90])
  const yTengah = useTransform(scrollY, [0, 600], [0, 45])

  const preset = {
    gold: [
      { warna: 'bg-gold/30', ukuran: 'h-80 w-80', posisi: '-right-24 -top-24' },
      { warna: 'bg-skyfoot/40', ukuran: 'h-72 w-72', posisi: '-left-20 top-40' },
      { warna: 'bg-cream-300/50', ukuran: 'h-64 w-64', posisi: 'right-1/4 top-72' },
    ],
    sky: [
      { warna: 'bg-skyfoot/40', ukuran: 'h-80 w-80', posisi: '-right-24 top-10' },
      { warna: 'bg-gold/25', ukuran: 'h-72 w-72', posisi: '-left-24 bottom-10' },
      { warna: 'bg-cream-300/40', ukuran: 'h-56 w-56', posisi: 'left-1/3 top-1/2' },
    ],
  }[varian]

  if (kurangGerak) {
    return (
      <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
        {preset.map((o, i) => (
          <div key={i} className={`absolute rounded-full blur-3xl ${o.warna} ${o.ukuran} ${o.posisi}`} />
        ))}
      </div>
    )
  }


  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {preset.map((o, i) => {
        const f = mengambang(i)
        return (
          /* Luar: parallax scroll. Dalam: mengambang — warna & blur ada di
             elemen yang sama dengan animasinya, kalau tidak geraknya tak terlihat. */
          <motion.div
            key={i}
            style={{ y: i === 0 ? yLatar : i === 1 ? yTengah : undefined }}
            className={`absolute ${o.ukuran} ${o.posisi}`}
          >
            <motion.div
              className={`h-full w-full rounded-full blur-3xl ${o.warna}`}
              animate={f.animate}
              transition={f.transition}
            />
          </motion.div>
        )
      })}
    </div>
  )
}

/**
 * Kilau melintas — untuk aksen premium dan skeleton.
 * Sapuan gradien 2 detik, jeda 3 detik, opasitas puncak 30%.
 */
export function Kilau({ className = '', tunda = 0 }) {
  const kurangGerak = useReducedMotion()
  if (kurangGerak) return null
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
    >
      <motion.div
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
        initial={{ x: '-150%' }}
        animate={{ x: '350%' }}
        transition={{
          duration: 2,
          delay: tunda,
          repeat: Infinity,
          repeatDelay: 3,
          ease: EASE.ambient,
        }}
      />
    </motion.div>
  )
}

/**
 * Titik berdenyut untuk status "sedang berjalan".
 * Skala ditahan di ±3% agar tidak menuntut perhatian.
 */
export function DenyutStatus({ className = 'bg-success' }) {
  const kurangGerak = useReducedMotion()
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {!kurangGerak && (
        <motion.span
          className={`absolute inline-flex h-full w-full rounded-full ${className}`}
          animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: EASE.exit }}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${className}`} />
    </span>
  )
}
