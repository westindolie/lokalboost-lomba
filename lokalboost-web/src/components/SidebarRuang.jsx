import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Grid, Upload, Wallet, Store, Info, Plus, Chart, Users, User, Scale, Shield, Sparkles } from './icons.jsx'
import { EASE, DUR } from '../motion.js'
import { api, useApi } from '../api.js'

/**
 * Sidebar ruang kerja — satu komponen untuk semua peran.
 *
 * Dulu sidebar hanya ada untuk kreator, sehingga dua ruang kerja pada aplikasi
 * yang sama punya kerangka navigasi yang berbeda: kreator memakai sidebar +
 * navbar, UMKM hanya navbar. Berpindah peran terasa seperti berpindah produk.
 */
export const MENU = {
  umkm: [
    { label: 'Dashboard', icon: Grid, to: '/umkm' },
    { label: 'Cari Kreator', icon: Users, to: '/marketplace' },
    { label: 'Buat Kampanye', icon: Plus, to: '/umkm/kampanye/baru' },
    // Tujuannya diisi belakangan: laporan selalu milik sebuah kampanye, dan
    // kampanye mana yang relevan baru diketahui setelah datanya dimuat.
    { label: 'Laporan Hasil', icon: Chart, to: null },
    { label: 'Riwayat Dana', icon: Wallet, to: '/umkm/dana' },
    { label: 'Profil Saya', icon: User, to: '/profil' },
  ],
  // "Cari Kampanye" sudah ada di navbar atas, dan naskah dibuat dari halaman
  // detail kampanye ("Buatkan naskah dari brief ini"), jadi keduanya tidak
  // diulang di sini.
  kreator: [
    { label: 'Dashboard', icon: Grid, to: '/kreator' },
    { label: 'Setor Video', icon: Upload, to: '/kreator/video' },
    { label: 'Portofolio Saya', icon: Sparkles, to: '/kreator/portofolio' },
    { label: 'Dompet Saya', icon: Wallet, to: '/kreator/dompet' },
    { label: 'Profil Saya', icon: User, to: '/profil' },
  ],
  admin: [
    { label: 'Ringkasan', icon: Grid, to: '/admin' },
    { label: 'Sengketa', icon: Scale, to: '/dispute' },
    { label: 'Marketplace', icon: Store, to: '/marketplace' },
  ],
}

const JUDUL = {
  umkm: 'Ruang UMKM',
  kreator: 'Ruang Kreator',
  admin: 'Ruang Admin',
}

export default function SidebarRuang({ peran = 'kreator', pathname = '' }) {
  // Kampanye yang paling masuk akal dibuka laporannya: yang sedang berjalan,
  // atau kampanye terbaru bila belum ada yang berjalan.
  const { data } = useApi(() => api.dashboardUmkm(), [], { aktif: peran === 'umkm' })
  const kampanye = data?.kampanye || []
  const untukLaporan = kampanye.find((k) => k.status === 'berjalan') || kampanye[0]

  // Selama kampanyenya belum diketahui — atau memang belum ada — menu laporan
  // dibiarkan tanpa tujuan. Menautkannya ke /umkm akan membuatnya ikut
  // tersorot bersama Dashboard, seolah dua menu aktif sekaligus.
  const items = (MENU[peran] || []).map((m) =>
    m.to === null
      ? { ...m, to: untukLaporan ? `/umkm/kampanye/${untukLaporan.id}/laporan` : null }
      : m,
  )

  return (
    <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] w-64 shrink-0 flex-col border-r border-black/5 bg-cream-100 p-4 lg:flex">
      <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
        {JUDUL[peran]}
      </p>

      <nav className="space-y-1">
        {items.map(({ label, icon: Icon, to }) => {
          if (!to) {
            return (
              <span
                key={label}
                title="Laporan terbuka setelah Anda punya kampanye"
                className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted/60"
              >
                <Icon size={18} /> {label}
              </span>
            )
          }
          const active = pathname === to
          return (
            <Link
              key={label}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? 'text-white' : 'text-ink-soft hover:bg-cream-200 hover:text-navy'
              }`}
            >
              {/* Latar aktif meluncur dari menu sebelumnya, bukan berpindah mendadak */}
              {active && (
                <motion.span
                  layoutId="sidebar-aktif"
                  className="absolute inset-0 -z-10 rounded-lg bg-navy"
                  transition={{ duration: DUR.quick, ease: EASE.signature }}
                />
              )}
              <Icon size={18} /> {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-1">
        {peran !== 'admin' && (
          <div className="flex items-start gap-2 rounded-lg border border-gold-border bg-gold px-3 py-2.5">
            <Shield size={15} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-[11px] leading-relaxed text-gold-text">
              Dana kampanye Anda aman di Rekber.
            </p>
          </div>
        )}
        <Link
          to="/dispute"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-cream-200 hover:text-navy"
        >
          <Info size={16} /> Pusat Sengketa
        </Link>
      </div>
    </aside>
  )
}
