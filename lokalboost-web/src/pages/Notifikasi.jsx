import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { staggerRapat, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, EmptyState, Tekan } from '../components/ui.jsx'
import { MemuatBlok, GalatMuat } from '../components/Muat.jsx'
import { tekan, EASE, DUR } from '../motion.js'
import { waktuLalu } from '../format.js'
import { api, useApi } from '../api.js'
import { Bell, Wallet, Check, Shield, Store, Star, Scale, ChevronRight } from '../components/icons.jsx'

/**
 * Sistem Notifikasi — PRD §8.1 (should-have): status kampanye, pencairan
 * dana, approval, dan sengketa.
 *
 * Notifikasi dibuat backend di titik kejadiannya (escrow, lamaran, moderasi),
 * jadi daftar ini tidak pernah perlu menebak apa yang baru terjadi.
 */
const ikon = {
  dana: { Icon: Wallet, cls: 'bg-success-soft text-success' },
  approval: { Icon: Check, cls: 'bg-navy/10 text-navy' },
  ai: { Icon: Shield, cls: 'bg-gold text-gold-text' },
  kampanye: { Icon: Store, cls: 'bg-skyfoot/50 text-navy' },
  ulasan: { Icon: Star, cls: 'bg-cream-300 text-navy' },
  sengketa: { Icon: Scale, cls: 'bg-danger-soft text-danger' },
}

const filter = [
  ['semua', 'Semua'],
  ['baru', 'Belum Dibaca'],
  ['dana', 'Dana'],
  ['kampanye', 'Kampanye'],
]

export default function Notifikasi() {
  const [aktif, setAktif] = useState('semua')
  const { data, galat, memuat, muatUlang } = useApi(() => api.notifikasi({ batas: 50 }), [])

  const semua = data?.notifikasi || []
  const belumDibaca = data?.belumDibaca || 0

  const daftar = semua.filter((n) => {
    if (aktif === 'semua') return true
    if (aktif === 'baru') return n.baru
    if (aktif === 'dana') return n.jenis === 'dana'
    return n.jenis === 'kampanye' || n.jenis === 'approval'
  })

  const tandaiSemua = async () => {
    await api.bacaSemuaNotifikasi()
    muatUlang()
  }

  const buka = async (n) => {
    if (!n.baru) return
    try {
      await api.bacaNotifikasi(n.id)
    } catch {
      /* membuka halaman tujuan tetap lebih penting daripada penanda dibaca */
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Notifikasi"
        subtitle={
          belumDibaca > 0
            ? `Anda punya ${belumDibaca} notifikasi yang belum dibaca.`
            : 'Semua notifikasi sudah Anda baca.'
        }
      >
        {belumDibaca > 0 && (
          <motion.button
            {...tekan}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={tandaiSemua}
            className="btn-outline px-5 py-2.5"
          >
            <Check size={16} /> Tandai Semua Dibaca
          </motion.button>
        )}
      </PageHeader>

      {/* Filter */}
      <div className="mt-7 flex flex-wrap gap-2">
        {filter.map(([id, label]) => (
          <motion.button
            key={id}
            onClick={() => setAktif(id)}
            aria-pressed={aktif === id}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: DUR.press, ease: EASE.signature }}
            className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              aktif === id ? 'text-white' : 'bg-cream-200 text-ink-soft hover:bg-cream-300'
            }`}
          >
            {aktif === id && (
              <motion.span
                layoutId="filter-notifikasi"
                className="absolute inset-0 z-0 rounded-full bg-navy"
                transition={{ duration: DUR.quick, ease: EASE.signature }}
              />
            )}
            <span className="relative z-10">{label}</span>
            {id === 'baru' && belumDibaca > 0 && (
              <span className="relative z-10 ml-1.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                {belumDibaca}
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {galat ? (
        <div className="mt-6">
          <GalatMuat galat={galat} onCoba={muatUlang} judul="Notifikasi gagal dimuat" />
        </div>
      ) : memuat ? (
        <div className="mt-6"><MemuatBlok tinggi="h-20" jumlah={4} /></div>
      ) : daftar.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Bell}
            title="Tidak ada notifikasi"
            subtitle="Notifikasi tentang status kampanye, pencairan dana, dan persetujuan akan muncul di sini."
            action="Lihat Marketplace"
            to="/marketplace"
          />
        </div>
      ) : (
        <motion.div
          key={aktif}
          variants={staggerRapat}
          initial="initial"
          animate="animate"
          className="card mt-6 divide-y divide-black/5"
        >
          <AnimatePresence initial={false}>
            {daftar.map((n) => {
              const { Icon, cls } = ikon[n.jenis] || ikon.kampanye
              return (
                <motion.div
                  key={n.id}
                  variants={fadeUp}
                  layout
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.2, ease: EASE.exit } }}
                  whileHover={{ x: 4 }}
                  transition={{ duration: DUR.hover, ease: EASE.signature }}
                >
                  <Link
                    to={n.tautan || '/notifikasi'}
                    onClick={() => buka(n)}
                    className={`flex items-start gap-4 p-5 transition-colors hover:bg-cream-100 ${
                      n.baru ? 'bg-cream-100/60' : ''
                    }`}
                  >
                    <motion.span
                      whileHover={{ scale: 1.08, rotate: -5 }}
                      transition={{ duration: DUR.hover, ease: EASE.signature }}
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${cls}`}
                    >
                      <Icon size={19} />
                    </motion.span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-navy">{n.judul}</p>
                        {n.baru && (
                          <motion.span
                            layout
                            exit={{ scale: 0, opacity: 0 }}
                            animate={{ scale: [1, 1.25, 1] }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: EASE.ambient }}
                            className="h-2 w-2 rounded-full bg-danger"
                            aria-label="Belum dibaca"
                          />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-ink-soft">{n.isi}</p>
                      <p className="mt-1.5 text-xs text-ink-muted">{waktuLalu(n.waktu)}</p>
                    </div>

                    <ChevronRight size={18} className="mt-1 shrink-0 text-ink-muted" />
                  </Link>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <p className="mt-6 text-center text-sm text-ink-soft">
        Ada transaksi yang terasa janggal?{' '}
        <Link to="/dispute" className="font-semibold text-navy hover:underline">Ajukan sengketa</Link>
      </p>
    </AppShell>
  )
}
