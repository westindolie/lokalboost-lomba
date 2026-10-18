import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, StatCard, ProgressBar, RekberBadge, Tekan, AIPanel } from '../components/ui.jsx'
import { MemuatHalaman, GalatMuat, MemuatBlok } from '../components/Muat.jsx'
import { tekan, EASE, DUR } from '../motion.js'
import { rupiah, ribuan, persen, statusKampanye } from '../format.js'
import { api, useApi } from '../api.js'
import VideoKreatorUmkm from '../components/VideoKreatorUmkm.jsx'
import PesertaUmkm from '../components/PesertaUmkm.jsx'
import { useSesi } from '../sesi.jsx'
import {
  Eye, Shield, Wallet, Chart, MapPin, Download, Clock, Star, ArrowRight, Sparkles,
} from '../components/icons.jsx'

/**
 * Dasbor Laporan Hasil — PRD §7.1 langkah 7 & 9.
 *
 * Angkanya berasal dari GET /api/kampanye/:id/laporan, yang menghitung
 * semuanya dari tabel tayangan. Ringkasan bahasa manusia datang dari
 * AI Auto-Report Summary (Claude bila kuncinya ada, template bila tidak) —
 * sumbernya ditampilkan apa adanya supaya tidak ada klaim "AI" yang palsu.
 */

/** Tinggi maksimum batang grafik (px). */
const TINGGI_BATANG = 140

/** Unduhan laporan sebagai CSV — dibuat di browser, tanpa endpoint tambahan. */
function unduhCsv(laporan) {
  const baris = [
    ['Laporan Kampanye', laporan.nama],
    ['Status', laporan.status],
    ['Target tayangan', laporan.targetViews],
    ['Tayangan tervalidasi', laporan.tervalidasi],
    ['Tayangan disaring', laporan.disaring],
    ['Persentase target', `${laporan.persenTarget}%`],
    ['Biaya terpakai', laporan.keuangan.terpakai],
    ['Dana disetor', laporan.keuangan.disetor],
    ['Diterima kreator', laporan.keuangan.diterimaKreator],
    [],
    ['Tanggal', 'Hari', 'Views tervalidasi'],
    ...laporan.viewsHarian.map((v) => [v.tanggal, v.hari, v.views]),
    [],
    ['Kota', 'Jumlah', 'Persen'],
    ...laporan.sebaranLokasi.map((s) => [s.kota, s.jumlah, `${s.persen}%`]),
    [],
    ['Alasan penyaringan', 'Jumlah'],
    ...laporan.antiFraud.rincian.map((r) => [r.alasan, r.jumlah]),
  ]

  const isi = baris.map((b) => b.map((sel) => `"${String(sel ?? '')}"`).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([`﻿${isi}`], { type: 'text/csv;charset=utf-8' }))
  const tautan = document.createElement('a')
  tautan.href = url
  tautan.download = `laporan-${laporan.kampanyeId}.csv`
  tautan.click()
  URL.revokeObjectURL(url)
}

export default function LaporanHasil() {
  const { id } = useParams()
  const { data, galat, memuat, muatUlang } = useApi(() => api.laporan(id), [id])
  const ringkasan = useApi(() => api.ringkasanAi(id), [id])
  const { profil } = useSesi()

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
        <GalatMuat galat={galat} onCoba={muatUlang} judul="Laporan tidak bisa dibuka" />
      </AppShell>
    )
  }

  const l = data.laporan
  const st = statusKampanye(l.status)
  const maxHarian = Math.max(1, ...l.viewsHarian.map((v) => v.views))
  const totalDiajukan = l.totalTayangan
  const ai = ringkasan.data?.ringkasan

  return (
    <AppShell>
      <Link to={`/kampanye/${id}`} className="mb-5 inline-flex text-sm font-semibold text-ink-soft hover:text-navy">
        ← Kembali ke {l.nama}
      </Link>

      <PageHeader title="Laporan Hasil Kampanye" subtitle={`${l.nama} · status ${st.label.toLowerCase()}`}>
        <motion.button {...tekan} onClick={() => unduhCsv(l)} className="btn-outline px-5 py-2.5">
          <Download size={16} /> Unduh Laporan
        </motion.button>
        <RekberBadge />
      </PageHeader>

      <motion.div variants={stagger} initial="initial" animate="animate" className="mt-8 space-y-6">
        {/* Ringkasan otomatis AI */}
        <motion.div variants={fadeUp}>
          <AIPanel
            title="Ringkasan Otomatis"
            badge="AI Auto-Report"
            footer={
              <span className="flex items-center gap-2">
                <Clock size={13} />
                {ai
                  ? `Dihasilkan ${ai.sumber === 'llm' ? 'model bahasa Claude' : 'penyusun template'} dari data tayangan`
                  : 'Sedang menyusun ringkasan…'}
              </span>
            }
          >
            {ringkasan.memuat ? (
              <MemuatBlok tinggi="h-4" jumlah={3} />
            ) : ringkasan.galat ? (
              <>Ringkasan otomatis belum bisa dibuat: {ringkasan.galat.message}</>
            ) : (
              <>
                <p>{ai.ringkasan}</p>
                {ai.sorotan?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {ai.sorotan.map((s) => (
                      <li key={s} className="flex gap-2">
                        <Sparkles size={13} className="mt-1 shrink-0 text-gold" /> {s}
                      </li>
                    ))}
                  </ul>
                )}
                {ai.saran && <p className="mt-3 text-white/70">Saran: {ai.saran}</p>}
              </>
            )}
          </AIPanel>
        </motion.div>

        {/* Statistik utama */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Views Tervalidasi"
            nilai={l.tervalidasi}
            sub={`${persen(l.persenTarget)}% dari target`}
            subTone="text-success"
            icon={Eye}
          />
          <StatCard
            label="View Disaring AI"
            nilai={l.disaring}
            sub={`${persen(l.antiFraud.persenDisaring)}% dari total tayangan`}
            subTone="text-danger"
            icon={Shield}
          />
          <StatCard
            label="Biaya Terpakai"
            nilai={l.keuangan.terpakai}
            prefiks="Rp "
            sub={`dari ${rupiah(l.keuangan.disetor)} yang disetor`}
            icon={Wallet}
          />
          <StatCard
            label="Rata-rata Ditonton"
            nilai={l.rerataDurasiTonton}
            sufiks=" Detik"
            desimal={1}
            sub={l.kotaTeratas ? `Penonton terbanyak dari ${l.kotaTeratas}` : 'Belum ada data lokasi'}
            icon={Clock}
          />
        </div>

        {/* Progres target */}
        <motion.div variants={fadeUp} className="card p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">Progres Menuju Target</h2>
            <span className="text-sm font-bold text-navy">
              {ribuan(l.tervalidasi)} / {ribuan(l.targetViews)} views
            </span>
          </div>
          <div className="mt-4">
            <ProgressBar value={l.tervalidasi} max={l.targetViews} />
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Reward dibayar dari Rekber sesuai views tervalidasi tiap kreator. Kreator yang tidak mencapai target minimal
            sampai kampanye selesai tidak dibayar, dan dananya kembali ke Anda.
          </p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Grafik views harian */}
          <motion.div variants={fadeUp} className="card p-7 lg:col-span-3">
            <h2 className="flex items-center gap-2 section-title">
              <Chart size={20} /> Views 7 Hari Terakhir
            </h2>
            <p className="mt-1 text-sm text-ink-soft">Hanya menghitung tayangan yang lolos verifikasi.</p>

            <motion.div
              initial="rest"
              whileInView="tampil"
              viewport={{ once: true, amount: 0.4 }}
              className="mt-6 flex h-52 items-end justify-between gap-3"
            >
              {l.viewsHarian.map((v, i) => (
                <motion.div
                  key={v.tanggal}
                  whileHover={{ y: -4 }}
                  transition={{ duration: DUR.hover, ease: EASE.signature }}
                  className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-2"
                  title={`${v.tanggal}: ${ribuan(v.views)} views`}
                >
                  <motion.span
                    variants={{ rest: { opacity: 0, y: 6 }, tampil: { opacity: 1, y: 0 } }}
                    transition={{ duration: 0.25, delay: 0.45 + i * 0.06, ease: EASE.entrance }}
                    className="text-xs font-semibold text-navy"
                  >
                    {ribuan(v.views)}
                  </motion.span>
                  <motion.div
                    style={{ height: `${Math.round((v.views / maxHarian) * TINGGI_BATANG)}px` }}
                    variants={{ rest: { scaleY: 0 }, tampil: { scaleY: 1 } }}
                    transition={{ duration: 0.55, delay: i * 0.06, ease: EASE.entrance }}
                    className={`w-full origin-bottom rounded-t-lg ${
                      v.views === maxHarian && v.views > 0 ? 'bg-navy' : 'bg-skyfoot'
                    }`}
                  />
                  <span className="text-xs text-ink-muted">{v.hari}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Sebaran lokasi penonton */}
          <motion.div variants={fadeUp} className="card p-7 lg:col-span-2">
            <h2 className="flex items-center gap-2 section-title">
              <MapPin size={20} /> Sebaran Lokasi Penonton
            </h2>
            <p className="mt-1 text-sm text-ink-soft">Membantu menilai apakah promosi tepat sasaran.</p>

            {l.sebaranLokasi.length === 0 ? (
              <p className="mt-6 rounded-xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-soft">
                Belum ada tayangan yang tercatat, jadi sebarannya masih kosong.
              </p>
            ) : (
              <>
                <div className="mt-6 space-y-4">
                  {l.sebaranLokasi.map((s, i) => (
                    <div key={s.kota}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-navy">{s.kota}</span>
                        <span className="text-ink-soft">{persen(s.persen)}%</span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/10">
                        <motion.div
                          className={`h-full origin-left rounded-full ${i === 0 ? 'bg-navy' : 'bg-skyfoot'}`}
                          style={{ width: `${s.persen}%` }}
                          initial={{ scaleX: 0 }}
                          whileInView={{ scaleX: 1 }}
                          viewport={{ once: true, amount: 0.6 }}
                          transition={{ duration: 0.7, delay: i * 0.08, ease: EASE.entrance }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-6 rounded-xl bg-cream-100 px-4 py-3 text-xs text-ink-soft">
                  <b className="text-navy">
                    {persen(l.sebaranLokasi.slice(0, 2).reduce((a, s) => a + s.persen, 0))}%
                  </b>{' '}
                  penonton berada di dua kota teratas — pakai ini untuk menilai apakah promosi
                  sudah menjangkau calon pembeli terdekat.
                </p>
              </>
            )}
          </motion.div>
        </div>

        {/* Anti-fraud */}
        <motion.div variants={fadeUp} className="card p-7">
          <h2 className="flex items-center gap-2 section-title">
            <Shield size={20} /> Hasil Verifikasi Anti-Fraud
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              ['Total tayangan masuk', ribuan(totalDiajukan), 'text-navy'],
              ['Lolos verifikasi', ribuan(l.tervalidasi), 'text-success'],
              ['Disaring sebagai tidak wajar', ribuan(l.disaring), 'text-danger'],
            ].map(([label, value, tone], i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: DUR.quick, delay: i * 0.08, ease: EASE.entrance }}
                className="rounded-xl bg-cream-100 p-5"
              >
                <p className={`text-2xl font-extrabold ${tone}`}>{value}</p>
                <p className="mt-1 text-xs text-ink-muted">{label}</p>
              </motion.div>
            ))}
          </div>

          {/* Rincian alasan — bukti yang sama dipakai halaman sengketa. */}
          {l.antiFraud.rincian.length > 0 && (
            <div className="mt-5 space-y-2">
              {l.antiFraud.rincian.map((r) => (
                <div
                  key={r.alasan}
                  className="flex items-start justify-between gap-4 rounded-xl bg-cream-100 px-4 py-3 text-sm"
                >
                  <span className="text-ink-soft">{r.alasan}</span>
                  <b className="shrink-0 text-navy">{ribuan(r.jumlah)}</b>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-gold-border bg-gold px-4 py-3.5">
            <Shield size={18} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-sm text-gold-text">
              Anda hanya membayar {ribuan(l.tervalidasi)} tayangan yang lolos verifikasi.
              Nilai tayangan yang disaring, {rupiah(l.disaring * l.keuangan.tarifPerView)}, tetap di Rekber.
            </p>
          </div>
        </motion.div>

        {/* Kreator, video, dan klaim produk: hanya pemilik kampanye. */}
        {profil?.peran === 'umkm' && (
          <>
            <motion.div variants={fadeUp}>
              <PesertaUmkm kampanyeId={id} />
            </motion.div>
            <motion.div variants={fadeUp}>
              <VideoKreatorUmkm kampanyeId={id} />
            </motion.div>
          </>
        )}

        {/* Neraca dana kampanye */}
        <motion.div variants={fadeUp} className="card p-7">
          <h2 className="flex items-center gap-2 section-title">
            <Wallet size={20} /> Ke Mana Dana Anda Pergi
          </h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Disetor ke Rekber', l.keuangan.disetor],
              ['Diterima kreator', l.keuangan.diterimaKreator],
              [
                l.status === 'selesai' ? 'Dikembalikan ke Anda' : 'Masih ditahan Rekber',
                l.status === 'selesai' ? l.keuangan.dikembalikan : l.keuangan.sisaDitahan,
              ],
            ].map(([label, angka]) => (
              <div key={label} className="rounded-xl bg-cream-100 p-5">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="mt-1 text-xl font-extrabold text-navy">{rupiah(angka)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            Reward kreator dibayarkan sesuai tarif dan tayangan tervalidasi. Sisa dana yang tidak terpakai kembali ke dompet Anda setelah kampanye ditutup.
          </p>
        </motion.div>

        {/* Tindak lanjut */}
        <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row">
          {l.status === 'selesai' && (
            <Tekan className="flex-1">
              <Link to={`/kampanye/${id}/ulasan`} className="btn-primary w-full py-3">
                <Star size={17} /> Beri Ulasan untuk Kreator
              </Link>
            </Tekan>
          )}
          <Tekan className="flex-1">
            <Link to="/umkm/kampanye/baru" className="btn-outline w-full py-3">
              Buat Kampanye Serupa <ArrowRight size={17} />
            </Link>
          </Tekan>
          <Tekan className="flex-1">
            <Link to="/dispute" className="btn-ghost w-full py-3">
              Ada yang tidak sesuai?
            </Link>
          </Tekan>
        </motion.div>
      </motion.div>
    </AppShell>
  )
}
