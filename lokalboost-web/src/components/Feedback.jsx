import { useEffect, useRef } from 'react'
import {
  motion,
  useReducedMotion,
  useInView,
  useMotionValue,
  useTransform,
  animate,
} from 'motion/react'
import { suksesWadah, suksesCentang, suksesCahaya, EASE, DUR } from '../motion.js'

/**
 * Centang sukses — satu-satunya tempat kita meminjam arketipe Playful.
 * Urutan sesuai resep skill:
 *   1. Wadah skala 0,9 → 1,0 (200ms, sedikit overshoot)
 *   2. Garis centang digambar (150ms, tunda 100ms)
 *   3. Cahaya ambient mengembang lalu hilang
 */
export function CentangSukses({ size = 30, className = '' }) {
  const kurangGerak = useReducedMotion()

  if (kurangGerak) {
    return (
      <span className={`relative grid place-items-center ${className}`}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-success">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7.5 12.4l3 3 6-6.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }

  return (
    <span className={`relative grid place-items-center ${className}`}>
      {/* Lapis ambient — cahaya mengembang lalu memudar */}
      <motion.span
        aria-hidden
        variants={suksesCahaya}
        initial="initial"
        animate="animate"
        className="absolute inset-0 rounded-full bg-success/25"
      />
      <motion.svg
        variants={suksesWadah}
        initial="initial"
        animate="animate"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="relative text-success"
      >
        <motion.circle
          cx="12" cy="12" r="10"
          stroke="currentColor" strokeWidth="1.8"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.32, ease: EASE.signature }}
        />
        <motion.path
          d="M7.5 12.4l3 3 6-6.4"
          stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          variants={suksesCentang}
        />
      </motion.svg>
    </span>
  )
}

/**
 * Angka menghitung naik saat masuk viewport.
 * Premium: durasi tier "slow" (800ms), ease-out, tanpa bunyi atau kedip.
 * Format Indonesia dipertahankan (titik ribuan).
 */
export function AngkaNaik({ nilai, prefiks = '', sufiks = '', desimal = 0, className = '' }) {
  const kurangGerak = useReducedMotion()
  const ref = useRef(null)
  const terlihat = useInView(ref, { once: true, amount: 0.4 })

  // MotionValue, bukan useState: teks diperbarui langsung ke DOM sehingga React
  // tidak me-render ulang 60 kali per detik untuk setiap kartu statistik.
  const angka = useMotionValue(kurangGerak ? nilai : 0)
  const teks = useTransform(angka, (v) => {
    const inti = desimal
      ? v.toFixed(desimal).replace('.', ',')
      : Math.round(v).toLocaleString('id-ID')
    return `${prefiks}${inti}${sufiks}`
  })

  useEffect(() => {
    if (kurangGerak) {
      angka.set(nilai)
      return
    }
    if (!terlihat) return
    const kontrol = animate(angka, nilai, { duration: DUR.slow, ease: EASE.signature })
    return () => kontrol.stop()
  }, [terlihat, nilai, kurangGerak, angka])

  return (
    <motion.span ref={ref} className={className}>
      {teks}
    </motion.span>
  )
}

/**
 * Goyang tegas untuk kesalahan — 3 osilasi meredam, tanpa overshoot.
 * Dipicu lewat prop `kunci`: setiap kali nilainya berubah, goyangan diputar ulang.
 */
export function Goyang({ kunci, children, className = '' }) {
  const kurangGerak = useReducedMotion()
  if (kurangGerak) return <div className={className}>{children}</div>
  return (
    <motion.div
      key={kunci}
      className={className}
      animate={kunci ? { x: [0, -10, 8, -6, 3, 0] } : {}}
      transition={{ duration: 0.36, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Baris skeleton dengan sapuan kilau — dipakai sebagai placeholder pemuatan.
 */
export function Skeleton({ className = '' }) {
  const kurangGerak = useReducedMotion()
  return (
    <span className={`relative block overflow-hidden rounded-md bg-cream-200 ${className}`}>
      {!kurangGerak && (
        <motion.span
          className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent"
          initial={{ x: '-120%' }}
          animate={{ x: '260%' }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.4, ease: 'linear' }}
        />
      )}
    </span>
  )
}
