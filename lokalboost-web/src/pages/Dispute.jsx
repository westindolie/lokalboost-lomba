import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { useSesi } from '../sesi.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, StatusChip, Tekan } from '../components/ui.jsx'
import { CentangSukses, Goyang } from '../components/Feedback.jsx'
import { MemuatBlok, GalatMuat } from '../components/Muat.jsx'
import { tekan, EASE, DUR } from '../motion.js'
import { ribuan, persen, tanggal, statusSengketa } from '../format.js'
import { api, useApi } from '../api.js'
import { Scale, Shield, Check, Clock, Doc, ArrowRight, Eye, Info } from '../components/icons.jsx'

/**
 * Pusat Sengketa — PRD §8.1 "Manajemen Dispute" dan §12: bukti otomatis dari
 * sistem tracking views menjadi dasar keputusan.
 *
 * Setiap sengketa yang dibuat backend langsung membawa potret angka
 * anti-fraud pada saat pengajuan. Itu yang ditampilkan di kartu riwayat —
 * bukan janji bahwa "bukti tersedia", melainkan buktinya sendiri.
 */

const ALASAN = [
  { id: 'kreator_tidak_menyelesaikan', label: 'Kreator tidak menyelesaikan kampanye', untuk: 'umkm' },
  { id: 'video_tidak_sesuai_brief', label: 'Video tidak sesuai brief yang disepakati', untuk: 'umkm' },
  { id: 'penyaringan_anti_fraud_keliru', label: 'Views saya salah terdeteksi sebagai fraud', untuk: 'kreator' },
  { id: 'pembayaran_tidak_sesuai', label: 'Dana belum cair padahal target tercapai', untuk: 'kreator' },
  { id: 'lainnya', label: 'Masalah lain', untuk: 'semua' },
]

const tahapan = ['Diajukan', 'Ditinjau Admin', 'Keputusan']

/** Panel keputusan admin — PRD §4.3 dan mekanisme banding §15. */
function KeputusanAdmin({ sengketa, onSelesai }) {
  const [buka, setBuka] = useState(false)
  const [keputusan, setKeputusan] = useState('')
  const [status, setStatus] = useState('selesai')
  const [pulihkan, setPulihkan] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  const alasanTersaring = sengketa.bukti?.antiFraud?.rincian || []

  const putuskan = async (e) => {
    e.preventDefault()
    setGalat('')
    setSibuk(true)
    try {
      await api.putuskanSengketa(sengketa.id, {
        status,
        keputusan,
        pulihkanAlasan: pulihkan || undefined,
      })
      setBuka(false)
      onSelesai()
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  if (sengketa.status === 'selesai' || sengketa.status === 'ditolak') {
    return (
      <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-ink-soft">
        <b className="text-navy">Keputusan:</b> {sengketa.keputusan}
      </p>
    )
  }

  return (
    <div className="mt-3">
      {!buka ? (
        <button
          type="button"
          onClick={() => setBuka(true)}
          className="btn-outline w-full px-4 py-2 text-xs"
        >
          Tinjau &amp; Putuskan
        </button>
      ) : (
        <form onSubmit={putuskan} className="space-y-3 rounded-lg bg-white p-3">
          <div>
            <label className="label text-xs" htmlFor={`status-${sengketa.id}`}>Hasil Tinjauan</label>
            <select
              id={`status-${sengketa.id}`}
              className="input py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="ditinjau">Masih ditinjau</option>
              <option value="selesai">Selesai — sengketa diterima</option>
              <option value="ditolak">Ditolak — bukti tidak mendukung</option>
            </select>
          </div>

          <div>
            <label className="label text-xs" htmlFor={`keputusan-${sengketa.id}`}>Isi Keputusan</label>
            <textarea
              id={`keputusan-${sengketa.id}`}
              rows={2}
              required
              value={keputusan}
              onChange={(e) => setKeputusan(e.target.value)}
              placeholder="Ditulis apa adanya kepada kedua pihak…"
              className="input resize-none py-2 text-sm"
            />
          </div>

          {alasanTersaring.length > 0 && (
            <div>
              <label className="label text-xs" htmlFor={`pulihkan-${sengketa.id}`}>
                Pulihkan tayangan yang tersaring (opsional)
              </label>
              <select
                id={`pulihkan-${sengketa.id}`}
                className="input py-2 text-sm"
                value={pulihkan}
                onChange={(e) => setPulihkan(e.target.value)}
              >
                <option value="">Tidak memulihkan apa pun</option>
                {alasanTersaring.map((r) => (
                  <option key={r.alasan} value={r.alasan}>
                    {r.alasan} ({r.jumlah})
                  </option>
                ))}
              </select>
              <p className="field-help">
                Tayangan yang dipulihkan ikut dihitung pada pencairan berikutnya.
              </p>
            </div>
          )}

          {galat && <p className="rounded bg-danger-soft px-3 py-2 text-xs text-danger">{galat}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={sibuk} className="btn-primary flex-1 px-3 py-2 text-xs disabled:opacity-60">
              {sibuk ? 'Menyimpan…' : 'Simpan Keputusan'}
            </button>
            <button type="button" onClick={() => setBuka(false)} className="btn-ghost px-3 py-2 text-xs">
              Batal
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function Dispute() {
  const { peran, adalahAdmin, adalahUmkm, adalahKreator, sudahMasuk } = useSesi()

  const [kampanyeId, setKampanyeId] = useState('')
  const [dipilih, setDipilih] = useState('')
  const [kronologi, setKronologi] = useState('')
  const [terkirim, setTerkirim] = useState(null)
  const [galatKirim, setGalatKirim] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [protes, setProtes] = useState(0)

  const riwayat = useApi(() => api.sengketa(), [], { aktif: sudahMasuk })

  // Kampanye yang boleh disengketakan hanyalah kampanye yang menyangkut
  // pengguna ini — backend menolak sisanya, jadi jangan ditawarkan.
  const kampanyeUmkm = useApi(() => api.dashboardUmkm(), [], { aktif: adalahUmkm })
  const kampanyeKreator = useApi(() => api.kampanyeSaya(), [], { aktif: adalahKreator })
  const kampanyeSaya = adalahUmkm
    ? kampanyeUmkm.data?.kampanye || []
    : kampanyeKreator.data?.kampanye || []

  const relevan = ALASAN.filter((a) => a.untuk === peran || a.untuk === 'semua')

  const kirim = async (e) => {
    e.preventDefault()
    if (!dipilih || !kampanyeId) {
      setProtes((n) => n + 1)
      return
    }
    setGalatKirim('')
    setSibuk(true)
    try {
      const hasil = await api.ajukanSengketa({
        kampanyeId,
        kategori: dipilih,
        alasan: kronologi,
      })
      setTerkirim(hasil)
      riwayat.muatUlang()
    } catch (err) {
      setGalatKirim(err.message)
      setProtes((n) => n + 1)
    } finally {
      setSibuk(false)
    }
  }

  const daftar = riwayat.data?.sengketa || []

  return (
    <AppShell>
      <PageHeader
        title="Pusat Sengketa"
        subtitle="Ajukan keberatan bila ada yang tidak sesuai. Setiap sengketa ditinjau dengan bukti otomatis dari sistem tracking views."
      >
        <span className="chip gap-2 border border-gold-border bg-gold px-4 py-2.5 text-gold-text">
          <Shield size={16} /> Dana Ditahan Selama Sengketa
        </span>
      </PageHeader>

      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="mt-8 grid gap-6 lg:grid-cols-5"
      >
        {/* Form pengajuan */}
        <motion.div variants={fadeUp} className="card p-7 lg:col-span-3">
          <h2 className="flex items-center gap-2 section-title">
            <Scale size={20} /> {adalahAdmin ? 'Antrean Peninjauan' : 'Ajukan Sengketa Baru'}
          </h2>

          <AnimatePresence mode="wait" initial={false}>
            {!sudahMasuk ? (
              /* Sengketa selalu antara dua pihak yang terikat sebuah kampanye,
                 jadi tamu tidak punya apa pun untuk disengketakan. Isinya boleh
                 dibaca, aksinya yang dikunci, dengan alasan yang dinyatakan. */
              <motion.div
                key="tamu"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: DUR.quick, ease: EASE.entrance }}
                className="mt-6 rounded-xl bg-cream-100 px-5 py-10 text-center"
              >
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cream-300 text-navy">
                  <Scale size={26} />
                </span>
                <p className="mt-4 text-lg font-bold text-navy">Masuk untuk mengajukan sengketa</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
                  Sengketa selalu terkait sebuah kampanye yang Anda ikuti, jadi kami perlu tahu
                  Anda bergabung sebagai pihak yang mana.
                </p>
                <Tekan className="mt-5 inline-block">
                  <Link to="/masuk?lanjut=/dispute" className="btn-primary px-5 py-2.5">
                    Masuk ke Akun <ArrowRight size={16} />
                  </Link>
                </Tekan>
              </motion.div>
            ) : adalahAdmin ? (
              <motion.div key="admin" className="mt-6 rounded-xl bg-cream-100 px-5 py-8 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cream-300 text-navy">
                  <Shield size={26} />
                </span>
                <p className="mt-4 text-lg font-bold text-navy">Anda meninjau, bukan mengajukan</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
                  Seluruh sengketa platform ada di panel sebelah kanan, lengkap dengan potret data
                  tayangan saat sengketa diajukan. Keputusan Anda langsung dikirim ke kedua pihak.
                </p>
              </motion.div>
            ) : terkirim ? (
              <motion.div
                key="sukses"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: DUR.quick, ease: EASE.entrance }}
                className="mt-6 rounded-xl border border-success-border bg-success-soft px-5 py-10 text-center"
              >
                <CentangSukses size={34} className="mx-auto" />
                <p className="mt-3 text-lg font-bold text-success">Sengketa Diajukan</p>
                <p className="mt-2 text-sm text-ink-soft">
                  Nomor tiket <b className="text-navy">SNG-{terkirim.sengketaId}</b>. {terkirim.pesan}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Tekan>
                    <Link to="/notifikasi" className="btn-primary px-5 py-2.5">Lihat Notifikasi</Link>
                  </Tekan>
                  <motion.button
                    {...tekan}
                    onClick={() => {
                      setTerkirim(null)
                      setDipilih('')
                      setKronologi('')
                    }}
                    className="btn-outline px-5 py-2.5"
                  >
                    Ajukan Lagi
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: DUR.quick, ease: EASE.signature }}
                onSubmit={kirim}
                className="mt-6"
              >
                <div>
                  <label className="label" htmlFor="kampanye-sengketa">Kampanye Terkait</label>
                  <select
                    id="kampanye-sengketa"
                    required
                    className="input"
                    value={kampanyeId}
                    onChange={(e) => setKampanyeId(e.target.value)}
                  >
                    <option value="" disabled>Pilih kampanye...</option>
                    {kampanyeSaya.map((k) => (
                      <option key={k.id} value={k.id}>{k.nama}</option>
                    ))}
                  </select>
                  {kampanyeSaya.length === 0 && (
                    <p className="field-help">
                      Belum ada kampanye atas nama Anda yang bisa disengketakan.
                    </p>
                  )}
                </div>

                <div className="mt-5">
                  <label className="label">Alasan Pengajuan</label>
                  <Goyang kunci={protes}>
                    <div className="space-y-2.5">
                      {relevan.map((a) => {
                        const aktif = dipilih === a.id
                        return (
                          <motion.button
                            key={a.id}
                            type="button"
                            onClick={() => setDipilih(a.id)}
                            aria-pressed={aktif}
                            whileHover={{ x: 3 }}
                            whileTap={{ scale: 0.99 }}
                            transition={{ duration: DUR.hover, ease: EASE.signature }}
                            className={`flex w-full items-center gap-3 rounded-xl border-2 bg-white px-4 py-3.5 text-left text-sm transition-colors ${
                              aktif ? 'border-navy' : 'border-black/10 hover:border-navy/30'
                            }`}
                          >
                            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${aktif ? 'border-navy' : 'border-black/25'}`}>
                              {aktif && (
                                <motion.span
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ duration: 0.18, ease: EASE.settle }}
                                  className="h-2.5 w-2.5 rounded-full bg-navy"
                                />
                              )}
                            </span>
                            <span className={aktif ? 'font-semibold text-navy' : 'text-ink-soft'}>{a.label}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </Goyang>
                </div>

                <div className="mt-5">
                  <label className="label" htmlFor="kronologi">Kronologi Singkat</label>
                  <textarea
                    id="kronologi"
                    rows={4}
                    required
                    value={kronologi}
                    onChange={(e) => setKronologi(e.target.value)}
                    placeholder="Ceritakan apa yang terjadi, sejelas mungkin, dengan tanggal kejadiannya..."
                    className="input resize-none"
                  />
                  <p className="field-help">
                    Tidak perlu melampirkan tangkapan layar tayangan — data tayangan otomatis ikut
                    terlampir sebagai bukti.
                  </p>
                </div>

                {galatKirim && (
                  <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
                    {galatKirim}
                  </p>
                )}

                <motion.button
                  {...tekan}
                  type="submit"
                  disabled={sibuk}
                  className={`mt-6 w-full py-3 disabled:opacity-60 ${!dipilih ? 'btn bg-ink-muted/25 text-ink-muted' : 'btn-primary'}`}
                >
                  {sibuk ? 'Mengirim…' : !dipilih ? 'Pilih alasan dulu' : <>Kirim Pengajuan <ArrowRight size={18} /></>}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Sisi kanan */}
        <div className="space-y-5 lg:col-span-2">
          {/* Bukti otomatis */}
          <motion.div variants={fadeUp} className="card p-6">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
              <Eye size={16} /> Bukti Otomatis Tersedia
            </h2>
            <p className="mt-1.5 text-sm text-ink-soft">
              Data ini otomatis dilampirkan ke sengketa Anda sebagai dasar keputusan.
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                'Jumlah tayangan masuk, lolos, dan disaring',
                'Rincian alasan setiap penyaringan sistem anti-fraud',
                'Status kampanye pada saat sengketa diajukan',
                'Riwayat pergerakan dana di Rekber',
              ].map((t) => (
                <li key={t} className="flex gap-2 text-ink-soft">
                  <Check size={16} className="mt-0.5 shrink-0 text-success" /> {t}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Riwayat sengketa */}
          <motion.div variants={fadeUp} className="card p-6">
            <h2 className="section-title text-base">
              {adalahAdmin ? 'Seluruh Sengketa' : 'Sengketa Anda'}
            </h2>

            {!sudahMasuk ? (
              <p className="mt-3 rounded-xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-soft">
                Masuk untuk melihat sengketa yang pernah Anda ajukan.
              </p>
            ) : riwayat.galat ? (
              <div className="mt-3">
                <GalatMuat galat={riwayat.galat} onCoba={riwayat.muatUlang} judul="Riwayat gagal dimuat" />
              </div>
            ) : riwayat.memuat ? (
              <div className="mt-3"><MemuatBlok tinggi="h-28" jumlah={2} /></div>
            ) : daftar.length === 0 ? (
              <p className="mt-3 rounded-xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-soft">
                Belum ada sengketa atas nama Anda. Semoga tetap begitu.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {daftar.map((r) => {
                  const s = statusSengketa(r.status)
                  const label = ALASAN.find((a) => a.id === r.kategori)?.label || r.kategori
                  return (
                    <div key={r.id} className="rounded-xl bg-cream-100 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-navy">{label}</p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            SNG-{r.id} · {r.namaKampanye}
                          </p>
                        </div>
                        <StatusChip status={s.label} tone={s.tone} denyut={s.langkah < 3} />
                      </div>

                      {/* Tahapan */}
                      <div className="mt-4 flex items-center">
                        {tahapan.map((t, i) => {
                          const lewat = i + 1 <= s.langkah
                          return (
                            <div key={t} className="contents">
                              <div className="flex flex-col items-center">
                                <motion.span
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  whileInView={{ scale: 1, opacity: 1 }}
                                  viewport={{ once: true }}
                                  transition={{ duration: 0.25, delay: i * 0.08, ease: EASE.entrance }}
                                  className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${
                                    lewat ? 'bg-navy text-white' : 'bg-cream-300 text-ink-muted'
                                  }`}
                                >
                                  {lewat ? <Check size={12} /> : i + 1}
                                </motion.span>
                                <span className={`mt-1 text-[10px] ${lewat ? 'font-semibold text-navy' : 'text-ink-muted'}`}>
                                  {t}
                                </span>
                              </div>
                              {i < tahapan.length - 1 && (
                                <span className="mb-4 h-0.5 flex-1 overflow-hidden rounded bg-black/10">
                                  <motion.span
                                    className="block h-full rounded bg-navy"
                                    initial={{ width: 0 }}
                                    whileInView={{ width: i + 1 < s.langkah ? '100%' : 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.45, delay: 0.15 + i * 0.08, ease: EASE.signature }}
                                  />
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Potret bukti yang ikut tersimpan saat pengajuan */}
                      {r.bukti?.antiFraud && (
                        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-ink-soft">
                          Saat diajukan: {ribuan(r.bukti.antiFraud.tervalidasi)} tayangan lolos,{' '}
                          {ribuan(r.bukti.antiFraud.disaring)} disaring
                          ({persen(r.bukti.antiFraud.persenDisaring)}%).
                        </p>
                      )}

                      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
                        <Clock size={12} /> Diajukan {r.pengaju} · {tanggal(r.dibuatPada)}
                      </p>

                      {adalahAdmin ? (
                        <KeputusanAdmin sengketa={r} onSelesai={riwayat.muatUlang} />
                      ) : (
                        r.keputusan && (
                          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-ink-soft">
                            <b className="text-navy">Keputusan:</b> {r.keputusan}
                          </p>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="flex items-start gap-3 rounded-xl border border-gold-border bg-gold px-4 py-3.5"
          >
            <Info size={18} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-sm text-gold-text">
              Selama sengketa berlangsung, dana tetap ditahan di Rekber dan tidak dilepas
              ke pihak mana pun sampai ada keputusan.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="card p-6">
            <p className="flex items-center gap-2 text-sm font-bold text-navy">
              <Doc size={16} /> Sebelum mengajukan
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Banyak masalah selesai lewat obrolan langsung. Coba hubungi pihak terkait dari
              halaman kampanye terlebih dahulu — sengketa sebaiknya jadi langkah terakhir.
            </p>
            <Link to="/marketplace" className="btn-outline mt-4 w-full py-2.5">
              Buka Marketplace
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </AppShell>
  )
}
