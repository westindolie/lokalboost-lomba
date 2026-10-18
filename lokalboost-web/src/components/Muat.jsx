import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from './AppShell.jsx'
import { Skeleton } from './Feedback.jsx'
import { Tekan } from './ui.jsx'
import { useSesi } from '../sesi.jsx'
import { Shield, ArrowRight } from './icons.jsx'

/**
 * Keadaan-keadaan yang muncul begitu data datang dari jaringan, bukan dari
 * berkas mock: sedang memuat, gagal memuat, dan tidak berhak membuka.
 *
 * Ketiganya dikumpulkan di sini supaya seluruh halaman menampilkannya dengan
 * rupa yang sama. Kalau tiap halaman menulis sendiri, kita akan mengulang
 * cacat lama: satu tujuan dengan lima wajah berbeda.
 */

/** Placeholder berbentuk kartu — dipakai saat isi halaman belum datang. */
export function MemuatBlok({ tinggi = 'h-32', jumlah = 3, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Sedang memuat data…</span>
      {Array.from({ length: jumlah }).map((_, i) => (
        <Skeleton key={i} className={`w-full ${tinggi}`} />
      ))}
    </div>
  )
}

/** Halaman penuh yang sedang memuat, lengkap dengan judul palsu. */
export function MemuatHalaman() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-5 w-96" />
      <MemuatBlok tinggi="h-28" jumlah={3} />
    </div>
  )
}

/**
 * Kegagalan memuat. Pesannya datang dari backend yang memang sudah menulis
 * dalam bahasa manusia; yang ditambahkan di sini hanya jalan keluarnya.
 */
export function GalatMuat({ galat, onCoba, judul = 'Data gagal dimuat' }) {
  const perluMasuk = galat?.status === 401
  // 403 (bukan hak Anda) dan 404 (tidak ada) tidak berubah dengan mengulang;
  // tombol "Coba Lagi" di sana cuma janji palsu.
  const percumaDiulang = galat?.status === 403 || galat?.status === 404
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card grid place-items-center px-6 py-12 text-center"
      role="alert"
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
        <Shield size={26} />
      </span>
      <p className="mt-4 text-lg font-bold text-navy">{judul}</p>
      <p className="mt-1.5 max-w-md text-sm text-ink-soft">
        {galat?.message || 'Terjadi kesalahan yang tidak terduga.'}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {perluMasuk ? (
          <Tekan>
            <Link to="/masuk" className="btn-primary px-5 py-2.5">
              Masuk ke Akun <ArrowRight size={16} />
            </Link>
          </Tekan>
        ) : (
          onCoba && !percumaDiulang && (
            <button type="button" onClick={onCoba} className="btn-primary px-5 py-2.5">
              Coba Lagi
            </button>
          )
        )}
        <Link to="/" className={`${percumaDiulang ? 'btn-primary' : 'btn-outline'} px-5 py-2.5`}>
          Ke Halaman Depan
        </Link>
      </div>
    </motion.div>
  )
}

/**
 * Alamat yang tidak cocok dengan rute mana pun. Tanpa ini React Router tidak
 * merender apa-apa dan pengguna hanya melihat layar putih kosong.
 */
export function TidakDitemukan() {
  const sesi = useSesi()
  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card mx-auto grid max-w-lg place-items-center px-6 py-14 text-center"
      >
        <span className="grid h-14 w-14 place-items-center rounded-full bg-cream-200 text-xl font-extrabold text-navy">
          404
        </span>
        <p className="mt-4 text-lg font-bold text-navy">Halaman tidak ditemukan</p>
        <p className="mt-1.5 text-sm text-ink-soft">
          Alamat yang Anda buka tidak ada atau sudah dipindahkan.
        </p>
        <Tekan className="mt-5">
          <Link to={sesi.profil.beranda} className="btn-primary px-5 py-2.5">
            {sesi.sudahMasuk ? 'Ke Ruang Kerja Saya' : 'Ke Halaman Depan'} <ArrowRight size={16} />
          </Link>
        </Tekan>
      </motion.div>
    </AppShell>
  )
}

/**
 * Penjaga rute berdasarkan peran.
 *
 * Sebelum backend tersambung, membuka /umkm sudah cukup untuk menjadi UMKM.
 * Sekarang peran datang dari token, jadi rute ruang kerja harus dijaga —
 * kalau tidak, halaman akan memanggil API dengan tangan kosong dan pengguna
 * hanya melihat deretan galat 401 tanpa tahu harus berbuat apa.
 */
export function Terproteksi({ peran, children }) {
  const sesi = useSesi()
  const lokasi = useLocation()
  const diizinkan = Array.isArray(peran) ? peran : [peran]
  // Halaman ini sedang memudar keluar (AnimatePresence mode="wait") sementara
  // router sudah pindah. <Routes location> membekukan lokasi untuk halaman
  // yang keluar, jadi pembandingnya harus URL peramban yang sebenarnya. Saat
  // pengguna menekan Keluar, sesi kosong di tengah animasi itu dan penjaga ini
  // dulu ikut membelokkan ke /masuk?lanjut=..., menimpa tujuan "/" dari menu.
  if (window.location.pathname !== lokasi.pathname) return null

  if (sesi.memuat) {
    return (
      <AppShell>
        <MemuatHalaman />
      </AppShell>
    )
  }

  if (!sesi.sudahMasuk) {
    // Alamat tujuan dibawa serta supaya setelah masuk pengguna mendarat di
    // halaman yang tadi ia tuju, bukan di dashboard yang generik.
    return <Navigate to={`/masuk?lanjut=${encodeURIComponent(lokasi.pathname)}`} replace />
  }

  if (!diizinkan.includes(sesi.peran)) {
    return (
      <AppShell>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card mx-auto grid max-w-lg place-items-center px-6 py-14 text-center"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-cream-200 text-navy">
            <Shield size={26} />
          </span>
          <p className="mt-4 text-lg font-bold text-navy">Halaman ini bukan untuk peran Anda</p>
          <p className="mt-1.5 text-sm text-ink-soft">
            Anda masuk sebagai {sesi.profil.label}. Halaman ini hanya bisa dibuka oleh{' '}
            {diizinkan.map((p) => ({ umkm: 'UMKM', kreator: 'kreator', admin: 'admin' }[p])).join(' atau ')}.
          </p>
          <Tekan className="mt-5">
            <Link to={sesi.profil.beranda} className="btn-primary px-5 py-2.5">
              Ke Ruang Kerja Saya <ArrowRight size={16} />
            </Link>
          </Tekan>
        </motion.div>
      </AppShell>
    )
  }

  return children
}
