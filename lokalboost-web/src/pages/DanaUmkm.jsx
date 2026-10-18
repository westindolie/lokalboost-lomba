import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, StatCard, RekberBadge, Tekan, AIPanel, EmptyState } from '../components/ui.jsx'
import { AngkaNaik } from '../components/Feedback.jsx'
import { MemuatHalaman, GalatMuat } from '../components/Muat.jsx'
import { EASE } from '../motion.js'
import { rupiah, ribuan, tanggal } from '../format.js'
import { api, useApi } from '../api.js'
import { Shield, Wallet, Clock, Chart, Plus, Store, ArrowRight } from '../components/icons.jsx'

/**
 * Riwayat Dana & Rekber (UMKM) — PRD §6.1 "riwayat transaksi dasar".
 *
 * Padanan Dompet milik kreator. Angka-angkanya tidak dihitung di halaman ini:
 * ringkasan datang dari dashboard, riwayat dari /api/dompet, dan rincian per
 * kampanye dari daftar kampanye milik pengguna — supaya tidak ada versi
 * kedua dari kebenaran yang sama.
 */
export default function DanaUmkm() {
  const dashboard = useApi(() => api.dashboardUmkm(), [])
  const dompet = useApi(() => api.dompet(), [])
  // Tidak ikut menahan halaman: tanpa data ini sisa halaman tetap lengkap.
  const biayaPasang = useApi(() => api.statusBiayaPasang(), [])

  if (dashboard.memuat || dompet.memuat) {
    return (
      <AppShell>
        <MemuatHalaman />
      </AppShell>
    )
  }
  const galat = dashboard.galat || dompet.galat
  if (galat) {
    return (
      <AppShell>
        <GalatMuat
          galat={galat}
          onCoba={() => {
            dashboard.muatUlang()
            dompet.muatUlang()
          }}
          judul="Riwayat dana gagal dimuat"
        />
      </AppShell>
    )
  }

  const { ringkasan, kampanye } = dashboard.data
  const d = dompet.data.dompet

  const totalDisetor = d.riwayat
    .filter((t) => t.jenis === 'setor')
    .reduce((a, t) => a + t.nominal, 0)
  const dihematAntiFraud = kampanye.reduce((a, k) => a + k.viewsDisaring * k.tarifPerView, 0)
  const totalDisaring = ringkasan.totalViewsDisaring

  return (
    <AppShell>
      <PageHeader
        title="Riwayat Dana & Rekber"
        subtitle="Semua uang yang Anda setor, terpakai, dan masih ditahan sistem — dalam satu halaman."
      >
        <Tekan>
          <Link to="/umkm/kampanye/baru" className="btn-primary px-5 py-3">
            <Plus size={18} /> Buat Kampanye Baru
          </Link>
        </Tekan>
        <RekberBadge />
      </PageHeader>

      <motion.div variants={stagger} initial="initial" animate="animate" className="mt-8 space-y-6">
        {/* Saldo tertahan */}
        <div className="grid gap-5 md:grid-cols-3">
          <motion.div
            variants={fadeUp}
            className="relative flex flex-col overflow-hidden rounded-2xl bg-navy p-7 text-white md:col-span-2"
          >
            <Shield size={140} className="pointer-events-none absolute -right-8 -top-6 text-white/5" />
            <p className="relative text-xs font-semibold uppercase tracking-wide text-white/60">
              Dana Tertahan di Rekber
            </p>
            <p className="relative mt-2 text-4xl font-extrabold sm:text-5xl">
              <AngkaNaik nilai={ringkasan.danaDiRekber} prefiks="Rp " />
            </p>
            <p className="relative mt-2 text-sm text-white/70">
              Belum dilepas ke kreator mana pun. Cair bertahap seiring tayangan lolos verifikasi.
            </p>
            <div className="relative mt-auto flex flex-wrap gap-3 pt-5">
              <Tekan>
                <Link to="/umkm" className="btn bg-white px-5 py-2.5 text-navy hover:bg-cream-200">
                  <Chart size={16} /> Lihat Kampanye Saya
                </Link>
              </Tekan>
            </div>
          </motion.div>

          <div className="space-y-5">
            <StatCard
              label="Saldo Kembali"
              nilai={d.saldo}
              prefiks="Rp "
              sub="Sisa kampanye yang sudah ditutup"
              subTone="text-success"
              icon={Wallet}
            />
            <StatCard
              label="Total Disetor"
              nilai={totalDisetor}
              prefiks="Rp "
              sub={`Untuk ${ringkasan.totalKampanye} kampanye`}
              icon={Clock}
            />
          </div>
        </div>

        {/* Yang diselamatkan Anti-Fraud */}
        <motion.div variants={fadeUp}>
          <AIPanel title="Yang Tidak Jadi Anda Bayar" badge="Anti-Fraud" ikon={Shield}>
            Sistem menyaring <b className="text-white">{ribuan(totalDisaring)} tayangan</b> yang
            terindikasi tidak wajar dari kampanye Anda. Nilainya{' '}
            <b className="text-white">{rupiah(dihematAntiFraud)}</b> — tetap di Rekber, tidak
            dibayarkan ke siapa pun. Komisi platform dipotong dari bagian kreator, jadi tidak
            menambah tagihan Anda.
          </AIPanel>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Riwayat. min-w-0: tanpa ini teks `truncate` di dalamnya ikut
              melebarkan kolom grid, dan di HP halaman jadi lebih lebar dari layar. */}
          <motion.div variants={fadeUp} className="card min-w-0 p-7 lg:col-span-3">
            <h2 className="section-title">Riwayat Transaksi</h2>
            <p className="mt-1 text-sm text-ink-soft">Setoran, komisi, dan pengembalian dana.</p>

            {d.riwayat.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  icon={Wallet}
                  title="Belum ada transaksi"
                  subtitle="Setoran pertama Anda ke Rekber akan tercatat di sini."
                  action="Buat Kampanye"
                  to="/umkm/kampanye/baru"
                />
              </div>
            ) : (
              <div className="mt-5 divide-y divide-black/5">
                {d.riwayat.map((t, i) => {
                  const masuk = t.arah === 'masuk'
                  return (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.05, ease: EASE.entrance }}
                      className="flex items-center gap-4 py-4"
                    >
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                          masuk ? 'bg-success-soft text-success' : 'bg-cream-200 text-ink-soft'
                        }`}
                      >
                        {t.jenis === 'setor' ? <Shield size={18} /> : <Wallet size={18} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy">{t.label}</p>
                        <p className="text-xs text-ink-muted">{tanggal(t.tanggal)}</p>
                      </div>
                      <span className={`shrink-0 font-bold ${masuk ? 'text-success' : 'text-ink'}`}>
                        {masuk ? '+' : '−'} {rupiah(t.nominal)}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* Rincian per kampanye */}
          <motion.div variants={fadeUp} className="card min-w-0 p-7 lg:col-span-2">
            <h2 className="section-title">Dana per Kampanye</h2>
            <div className="mt-5 space-y-3">
              {kampanye.map((k) => {
                const terpakai = k.viewsTervalidasi * k.tarifPerView
                return (
                  <Link
                    key={k.id}
                    to={`/kampanye/${k.id}`}
                    className="flex items-center gap-3 rounded-xl bg-cream-100 p-4 transition-colors hover:bg-cream-200"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-navy shadow-card">
                      <Store size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{k.nama}</p>
                      <p className="text-xs text-ink-muted">
                        {rupiah(terpakai)} terpakai dari {rupiah(k.anggaran)}
                      </p>
                    </div>
                  </Link>
                )
              })}
              {kampanye.length === 0 && (
                <p className="rounded-xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-soft">
                  Belum ada kampanye yang dibuat.
                </p>
              )}
            </div>

            <div className="mt-5 flex items-start gap-2 rounded-xl border border-gold-border bg-gold px-4 py-3">
              <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
              <p className="text-xs text-gold-text">
                Sisa dana kampanye yang tidak terpakai dikembalikan otomatis saat kampanye ditutup.
              </p>
            </div>

            <Tekan className="mt-4 block">
              <Link to="/dispute" className="btn-ghost w-full py-2.5">
                Ada transaksi yang janggal? <ArrowRight size={16} />
              </Link>
            </Tekan>
          </motion.div>
        </div>

        <RiwayatBiayaPasang data={biayaPasang.data} />
      </motion.div>
    </AppShell>
  )
}

/** Biaya pasang (layanan LokalBoost) dicatat terpisah: uangnya bukan dana Rekber. */
function RiwayatBiayaPasang({ data }) {
  if (!data?.aktif && !data?.riwayat?.length) return null
  return (
    <motion.div variants={fadeUp} className="card min-w-0 p-7">
      <h2 className="section-title">Biaya Pasang Kampanye</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {rupiah(data.biaya)} per kampanye, dibayar sebelum mengisi kampanye. Terpisah dari dana Rekber.
      </p>
      {data.riwayat.length === 0 ? (
        <p className="mt-4 rounded-xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-soft">
          Belum ada biaya pasang yang dibayar.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-black/5">
          {data.riwayat.map((p) => (
            <li key={p.orderId} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy">{p.namaKampanye || 'Belum dipakai untuk kampanye'}</p>
                <p className="text-xs text-ink-muted">
                  {tanggal(p.dibuatPada)} · {p.status === 'lunas' ? 'Lunas' : 'Sedang ditinjau'}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-navy">−{rupiah(p.jumlah)}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
