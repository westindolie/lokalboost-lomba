import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, AIPanel, StatCard, StatusChip, ProgressBar, Tekan, EmptyState } from '../components/ui.jsx'
import { AngkaNaik } from '../components/Feedback.jsx'
import { MemuatHalaman, GalatMuat } from '../components/Muat.jsx'
import TombolLanjutBayar from '../components/TombolLanjutBayar.jsx'
import { EASE, DUR } from '../motion.js'
import { rupiah, ribuan, statusKampanye } from '../format.js'
import { api, useApi } from '../api.js'
import { useSesi } from '../sesi.jsx'
import { Shield, Eye, Sparkles, Store, Wallet, Plus, Users, Chart } from '../components/icons.jsx'

/**
 * Dashboard UMKM — PRD §7.1 langkah 7 ("memantau performa").
 *
 * Seluruh angka datang dari GET /api/dashboard/umkm dalam satu panggilan.
 * Dulu halaman ini menjumlahkan sendiri isi mock.js; sekarang penjumlahannya
 * dilakukan backend, sehingga dashboard, laporan, dan ruang admin mustahil
 * berbeda pendapat tentang berapa view yang sudah tervalidasi.
 */
export default function DashboardUMKM() {
  const { profil } = useSesi()
  const { data, galat, memuat, muatUlang } = useApi(() => api.dashboardUmkm(), [])

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

  const { ringkasan, kampanye, lamaranPerluDitinjau } = data
  const berjalan = kampanye.filter((k) => k.status === 'berjalan')

  // Tenggat terdekat di antara kampanye yang masih berjalan.
  const tenggat = berjalan.length ? Math.min(...berjalan.map((k) => k.sisaHari ?? 99)) : null
  const kampanyeTenggat = berjalan.find((k) => k.sisaHari === tenggat)

  return (
    <AppShell>
      <PageHeader
        title={`Selamat datang, ${profil.nama}`}
        subtitle="Siap mengembangkan bisnis Anda hari ini?"
      >
        <Tekan>
          <Link to="/umkm/kampanye/baru" className="btn-primary px-5 py-3">
            <Plus size={18} /> Buat Kampanye Baru
          </Link>
        </Tekan>
      </PageHeader>

      <motion.div variants={stagger} initial="initial" animate="animate" className="mt-8 space-y-6">
        {/* Saran AI + saldo */}
        <div className="grid gap-6 lg:grid-cols-3">
          <motion.div variants={fadeUp} className="lg:col-span-2">
            <AIPanel
              title="Langkah Berikutnya"
              ikon={Store}
              action={lamaranPerluDitinjau > 0 ? 'Tinjau Undangan' : 'Lihat Kreator'}
              to={
                lamaranPerluDitinjau > 0 && kampanye.length
                  ? `/umkm/kampanye/${
                      kampanye.find((k) => k.status === 'berjalan')?.id ||
                      kampanye[0].id
                    }/kreator`
                  : '/marketplace'
              }
            >
              {lamaranPerluDitinjau > 0 ? (
                <>
                  Ada <b className="text-white">{lamaranPerluDitinjau} undangan kreator</b> yang
                  menunggu keputusan Anda. Semakin cepat ditinjau, semakin cepat kampanye Anda
                  mulai menghasilkan tayangan.
                </>
              ) : ringkasan.berjalanTanpaKreator > 0 ? (
                <>
                  <b className="text-white">{ringkasan.berjalanTanpaKreator} kampanye</b> Anda sedang berjalan
                  dan belum memiliki kreator. Anda bisa memilih lalu mengundang kreator
                  secara langsung dari rekomendasi kreator.
                </>
              ) : (
                <>
                  Semua kampanye Anda sedang berjalan dengan kreator terpilih. Pantau hasilnya di
                  laporan, atau buat kampanye baru untuk produk lain.
                </>
              )}
            </AIPanel>
          </motion.div>

          <motion.div variants={fadeUp} className="card p-7">
            <div className="flex items-center justify-between text-ink-muted">
              <span className="text-xs font-semibold uppercase tracking-wide">Dana di Rekber</span>
              <Wallet size={20} />
            </div>
            <p className="mt-3 text-4xl font-extrabold text-navy">
              <AngkaNaik nilai={ringkasan.danaDiRekber} prefiks="Rp " />
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Untuk {ringkasan.totalKampanye} kampanye
              {ringkasan.saldoDompet > 0 && <> · saldo kembali {rupiah(ringkasan.saldoDompet)}</>}
            </p>
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-gold-border bg-gold px-4 py-3">
              <Shield size={18} className="shrink-0 text-navy" />
              <span className="text-sm font-medium text-navy">Dana Aman di Sistem Rekber</span>
            </div>
          </motion.div>
        </div>

        {/* Statistik */}
        <div className="grid gap-5 md:grid-cols-3">
          <StatCard
            label="Kampanye Berjalan"
            nilai={ringkasan.berjalan}
            sufiks=" Kampanye"
            sub={`Dari total ${ringkasan.totalKampanye} kampanye`}
            icon={Chart}
          />
          <StatCard
            label="Total Views Tervalidasi"
            nilai={ringkasan.totalViewsTervalidasi}
            sub={`${ribuan(ringkasan.totalViewsDisaring)} view disaring sistem anti-fraud`}
            subTone="text-success"
            icon={Eye}
          />
          {tenggat != null ? (
            <StatCard
              label="Tenggat Terdekat"
              nilai={tenggat}
              sufiks={tenggat === 1 ? ' Hari Lagi' : ' Hari Lagi'}
              sub={kampanyeTenggat?.nama}
              subTone="text-danger"
              icon={Sparkles}
            />
          ) : (
            <StatCard
              label="Kampanye Selesai"
              nilai={ringkasan.selesai}
              sufiks=" Kampanye"
              sub="Laporan hasilnya bisa dibuka kapan saja"
              icon={Sparkles}
            />
          )}
        </div>

        {/* Daftar kampanye */}
        <motion.div variants={fadeUp} className="card p-7">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Kampanye Saya</h2>
            <Link to="/marketplace" className="text-sm font-semibold text-navy hover:opacity-70">
              Cari Kreator
            </Link>
          </div>

          {kampanye.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                icon={Store}
                title="Belum ada kampanye"
                subtitle="Buat kampanye pertama Anda, setor dananya ke Rekber, dan biarkan kreator lokal melamar."
                action="Buat Kampanye Baru"
                to="/umkm/kampanye/baru"
              />
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {kampanye.map((k, i) => {
                const st = statusKampanye(k.status, k.sisaHari)
                const sedangJalan = k.status === 'berjalan'
                const aksi = sedangJalan
                  ? { label: 'Lihat Laporan', ikon: Chart, to: `/umkm/kampanye/${k.id}/laporan` }
                  : k.status === 'selesai'
                    ? { label: 'Lihat Laporan', ikon: Chart, to: `/umkm/kampanye/${k.id}/laporan` }
                    : { label: 'Pilih Kreator', ikon: Users, to: `/umkm/kampanye/${k.id}/kreator` }

                return (
                  <motion.div
                    key={k.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: DUR.quick, delay: 0.1 + i * 0.06, ease: EASE.entrance }}
                    className="flex flex-col gap-3 rounded-xl border border-black/5 bg-cream-100 px-4 py-4 transition-colors hover:bg-cream-200 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-navy shadow-card">
                      <Store size={20} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/kampanye/${k.id}`}
                        className="font-semibold text-navy hover:underline"
                      >
                        {k.nama}
                      </Link>
                      <p className="text-sm text-ink-soft">
                        Target {ribuan(k.targetViews)} views · Anggaran {rupiah(k.anggaran)}
                      </p>
                      {(sedangJalan || k.viewsTervalidasi > 0) && (
                        <div className="mt-2 max-w-xs">
                          <ProgressBar value={k.viewsTervalidasi} max={k.targetViews} />
                          <p className="mt-1 text-xs text-ink-muted">
                            {ribuan(k.viewsTervalidasi)} dari {ribuan(k.targetViews)} views
                          </p>
                        </div>
                      )}
                    </div>

                    <StatusChip status={st.label} tone={st.tone} denyut={sedangJalan} />

                    {k.status === 'menunggu_dana' ? (
                      <TombolLanjutBayar kampanye={k} onLunas={muatUlang} />
                    ) : (
                      <Tekan className="shrink-0">
                        <Link to={aksi.to} className="btn-outline w-full px-4 py-2.5 sm:w-auto">
                          <aksi.ikon size={16} /> {aksi.label}
                        </Link>
                      </Tekan>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AppShell>
  )
}
