import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import {
  PageHeader, RekberBadge, StatCard, StatusChip, ProgressBar, HoverCard, Tekan, EmptyState,
  IsiFoto,
} from '../components/ui.jsx'
import { MemuatHalaman, GalatMuat } from '../components/Muat.jsx'
import { EASE, DUR } from '../motion.js'
import { rupiah, ribuan, statusKampanye, gradasi } from '../format.js'
import { api, useApi } from '../api.js'
import { useSesi } from '../sesi.jsx'
import { Wallet, Chart, Eye, Sparkles, MapPin, Store, Doc } from '../components/icons.jsx'

/**
 * Dashboard Kreator — PRD §7.2 langkah 2 & 7.
 *
 * Kampanye yang dikerjakan, rekomendasi sistem rekomendasi kreator, dan angka
 * pendapatan semuanya dari GET /api/dashboard/kreator. "Estimasi pendapatan"
 * kini memakai saldo sungguhan (siap tarik + tertahan), bukan perkalian
 * views × tarif yang dilakukan halaman ini sendiri — perkalian itu selalu
 * bisa berbeda dari reward yang sudah tervalidasi dan masuk ke saldo.
 */
export default function DashboardKreator() {
  const { profil } = useSesi()
  const { data, galat, memuat, muatUlang } = useApi(() => api.dashboardKreator(), [])
  const [demoSibuk, setDemoSibuk] = useState('')
  const [pesanDemo, setPesanDemo] = useState('')

  const selesaikanDemo = async (kampanye) => {
    setDemoSibuk(kampanye.id)
    setPesanDemo('')
    try {
      const hasil = await api.simulasiPencairanKampanye(kampanye.id)
      setPesanDemo(`${hasil.pesan} Total ${rupiah(hasil.totalDibayar)} dibagi kepada ${hasil.kreatorDibayar} kreator.`)
      await muatUlang()
    } catch (err) {
      setPesanDemo(err.message)
    } finally {
      setDemoSibuk('')
    }
  }

  if (memuat) {
    return (
      <AppShell>
        <MemuatHalaman />
      </AppShell>
    )
  }
  if (galat) {
    return (
      <AppShell>
        <GalatMuat galat={galat} onCoba={muatUlang} judul="Dashboard gagal dimuat" />
      </AppShell>
    )
  }

  const { ringkasan, kampanyeSaya, rekomendasi } = data
  const aktif = kampanyeSaya.filter((k) => k.status === 'berjalan')

  return (
    <AppShell>
      <PageHeader
        title={`Halo, ${profil.nama}! Siap berkarya hari ini?`}
        subtitle={
          rekomendasi.length
            ? `Ada ${rekomendasi.length} kampanye yang cocok untuk audiensmu. Mari bantu UMKM lokal tumbuh.`
            : 'Belum ada kampanye baru yang cocok. Coba lengkapi profil agar AI mengenali gayamu.'
        }
      >
        <RekberBadge text="Akun Terverifikasi Rekber" />
      </PageHeader>

      <motion.div variants={stagger} initial="initial" animate="animate" className="mt-8 space-y-8">
        {/* Statistik */}
        <div className="grid gap-5 md:grid-cols-3">
          <StatCard
            label="Pendapatan Terkumpul"
            nilai={ringkasan.saldo + ringkasan.saldoTertahan}
            prefiks="Rp "
            sub={`${rupiah(ringkasan.saldo)} siap ditarik`}
            subTone="text-success"
            icon={Wallet}
          />
          <StatCard
            label="Kampanye Berjalan"
            nilai={ringkasan.kampanyeBerjalan}
            sufiks=" Proyek"
            sub={
              `${ringkasan.kampanyeSelesai} kampanye sudah selesai`
            }
            icon={Chart}
          />
          <StatCard
            label="Views Tervalidasi"
            nilai={ringkasan.totalViewsTervalidasi}
            sub="Sudah lolos sistem anti-fraud"
            subTone="text-success"
            icon={Eye}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Kampanye yang dikerjakan */}
          <motion.div variants={fadeUp}>
            <h2 className="flex items-center gap-2 section-title">
              <Chart size={20} /> Status Kampanye Aktif
            </h2>
            {kampanyeSaya.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Store}
                  title="Belum ada kampanye yang dikerjakan"
                  subtitle="Cari kampanye yang cocok dan bergabung langsung. Di mode normal, lengkapi profil serta verifikasi akun sosial sebelum ikut."
                  action="Cari Kampanye"
                  to="/marketplace"
                />
              </div>
            ) : (
              <div className="card mt-4 divide-y divide-black/5">
                {kampanyeSaya.map((k) => {
                  const st = statusKampanye(k.status, k.sisaHari)
                  return (
                    <motion.div
                      key={k.id}
                      whileHover={{ x: 4 }}
                      transition={{ duration: DUR.hover, ease: EASE.signature }}
                    >
                      <Link
                        to={`/kampanye/${k.id}`}
                        className="flex items-center gap-4 p-5 transition-colors hover:bg-cream-100"
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-cream-200 text-navy">
                          <Store size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-navy">{k.nama}</p>
                          <p className="text-sm text-ink-soft">
                            Tenggat {k.sisaHari} hari lagi · Target {ribuan(k.targetViews)} views
                          </p>
                          <div className="mt-2">
                            <ProgressBar value={k.viewsTervalidasi} max={k.targetViews} />
                            <p className="mt-1 text-xs text-ink-muted">
                              {ribuan(k.viewsTervalidasi)} views tervalidasi
                            </p>
                          </div>
                        </div>
                        <StatusChip status={st.label} tone={st.tone} denyut={k.status === 'berjalan'} />
                      </Link>
                      {data.modeDemo && k.demoSiap && k.status === 'berjalan' && (
                        <button
                          type="button"
                          onClick={() => selesaikanDemo(k)}
                          disabled={Boolean(demoSibuk)}
                          className="mx-5 mb-4 rounded-lg border border-gold-border bg-gold px-4 py-2 text-sm font-semibold text-gold-text disabled:opacity-60"
                        >
                          {demoSibuk === k.id ? 'Mengirim saldo demo…' : 'Selesaikan demo dan masukkan saldo'}
                        </button>
                      )}
                    </motion.div>
                  )
                })}
                {aktif.length > 0 && (
                  <Link
                    to="/kreator/video"
                    className="block p-4 text-center text-sm font-semibold text-navy transition-colors hover:bg-cream-100"
                  >
                    Setor Video & Cek Reward Kampanye Aktif →
                  </Link>
                )}
              </div>
            )}
            {pesanDemo && <p role="status" className="mt-3 rounded-lg bg-gold px-4 py-3 text-sm text-gold-text">{pesanDemo}</p>}
          </motion.div>

          {/* Rekomendasi Kreator */}
          <motion.div variants={fadeUp}>
            <h2 className="flex items-center gap-2 section-title">
              <Sparkles size={20} /> Kampanye Cocok Untukmu
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Dipilihkan sistem rekomendasi berdasarkan lokasi dan niche kontenmu.
            </p>

            {rekomendasi.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Sparkles}
                  title="Belum ada rekomendasi"
                  subtitle="Semua kampanye terbuka sudah kamu lamar, atau belum ada yang cocok dengan niche-mu."
                  action="Lihat Marketplace"
                  to="/marketplace"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-5">
                {rekomendasi.map((k) => (
                  <HoverCard key={k.id} className="card overflow-hidden">
                    <div className="flex gap-4 p-4">
                      <div className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br ${gradasi(k)}`}>
                        <IsiFoto src={k.gambar} alt={k.nama} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-navy">{k.nama}</p>
                            <p className="flex items-center gap-1 text-sm text-ink-soft">
                              <MapPin size={14} /> {k.lokasi} · {k.kategori}
                            </p>
                          </div>
                          <span className="chip shrink-0 gap-1 bg-navy text-white">
                            <Sparkles size={12} /> Cocok {k.kecocokan}%
                          </span>
                        </div>
                        {k.alasan?.length > 0 && (
                          <p className="mt-2 line-clamp-2 text-xs text-ink-muted">
                            {Array.isArray(k.alasan) ? k.alasan.join(' · ') : k.alasan}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-y border-black/5 bg-cream-100 px-5 py-3 text-sm">
                      <div>
                        <p className="text-ink-muted">Anggaran</p>
                        <p className="font-bold text-navy">{rupiah(k.anggaran)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-ink-muted">Target Views</p>
                        <p className="font-bold text-navy">{ribuan(k.targetViews)}</p>
                      </div>
                    </div>

                    <div className="flex gap-3 p-4">
                      <Tekan className="flex-1">
                        <Link to={`/kampanye/${k.id}`} className="btn-primary w-full py-2.5">Lihat Detail</Link>
                      </Tekan>
                      <Tekan>
                        <Link
                          to={`/kreator/ai-script?kampanye=${k.id}`}
                          className="btn-outline px-4 py-2.5"
                          title="Buat naskah dengan AI"
                          aria-label="Buat naskah dengan AI"
                        >
                          <Doc size={16} />
                        </Link>
                      </Tekan>
                    </div>
                  </HoverCard>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </AppShell>
  )
}
