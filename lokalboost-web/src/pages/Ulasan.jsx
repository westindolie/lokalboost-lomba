import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { useSesi } from '../sesi.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, Tekan } from '../components/ui.jsx'
import { CentangSukses, Goyang } from '../components/Feedback.jsx'
import { MemuatHalaman, GalatMuat, MemuatBlok } from '../components/Muat.jsx'
import { tekan, EASE, DUR } from '../motion.js'
import { ribuan, waktuLalu } from '../format.js'
import { api, useApi } from '../api.js'
import { Star, Check, Shield, ArrowRight, Store, Video } from '../components/icons.jsx'

/**
 * Rating & Review dua arah — PRD §8.1, sekaligus mitigasi risiko §12.
 *
 * Backend hanya menerima ulasan dari dua pihak yang benar-benar
 * menyelesaikan kampanye bersama, dan menolak ulasan kedua dari orang yang
 * sama. Halaman ini tidak mencoba menebak aturan itu sendiri — ia mengirim
 * dan menampilkan jawabannya apa adanya.
 */
const aspekUMKM = ['Kualitas video', 'Ketepatan waktu', 'Kesesuaian brief', 'Komunikasi']
const aspekKreator = ['Kejelasan brief', 'Responsif', 'Kelancaran pembayaran', 'Kerja sama']

function Bintang({ nilai, ukuran = 18 }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={ukuran} className={n <= nilai ? 'text-gold-text' : 'text-ink-muted/35'} />
      ))}
    </span>
  )
}

export default function Ulasan() {
  const { id } = useParams()
  const { adalahUmkm } = useSesi()
  const menilaiKreator = adalahUmkm

  const kampanye = useApi(() => api.kampanyeDetail(id), [id])
  const ulasan = useApi(() => api.ulasan({ kampanyeId: id }), [id])
  // Satu kampanye bisa banyak kreator: UMKM memilih kreator yang dinilai.
  const peserta = useApi(() => api.pesertaKampanye(id), [id], { aktif: menilaiKreator })
  const daftarPeserta = peserta.data?.peserta || []
  const [dinilaiId, setDinilaiId] = useState('')
  const kreatorDinilai = daftarPeserta.find((p) => p.kreatorId === dinilaiId) || daftarPeserta[0]

  const [bintang, setBintang] = useState(0)
  const [hover, setHover] = useState(0)
  const [aspek, setAspek] = useState([])
  const [komentar, setKomentar] = useState('')
  const [terkirim, setTerkirim] = useState(false)
  const [galatKirim, setGalatKirim] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [protes, setProtes] = useState(0)

  if (kampanye.memuat) {
    return (
      <AppShell>
        <MemuatHalaman />
      </AppShell>
    )
  }
  if (kampanye.galat) {
    return (
      <AppShell>
        <GalatMuat galat={kampanye.galat} onCoba={kampanye.muatUlang} judul="Kampanye tidak bisa dibuka" />
      </AppShell>
    )
  }

  const k = kampanye.data.kampanye
  const daftarAspek = menilaiKreator ? aspekUMKM : aspekKreator
  const lawan = menilaiKreator ? kreatorDinilai?.nama || k.kreator?.nama || 'Kreator' : k.umkm
  const belumSelesai = k.status !== 'selesai'

  const kirim = async (e) => {
    e.preventDefault()
    if (bintang === 0) {
      setProtes((n) => n + 1)
      return
    }
    setGalatKirim('')
    setSibuk(true)
    try {
      // Aspek yang dipilih ikut masuk ke komentar; backend menyimpan satu
      // kolom komentar, dan menyembunyikan pilihan pengguna sama saja dengan
      // membuangnya.
      const catatanAspek = aspek.length ? `[${aspek.join(', ')}] ` : ''
      await api.kirimUlasan({
        kampanyeId: id,
        ...(menilaiKreator && kreatorDinilai ? { dinilaiId: kreatorDinilai.kreatorId } : {}),
        bintang,
        komentar: `${catatanAspek}${komentar}`.trim() || null,
      })
      setTerkirim(true)
      ulasan.muatUlang()
    } catch (err) {
      setGalatKirim(err.message)
      setProtes((n) => n + 1)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <AppShell>
      <Link
        to={`/kampanye/${k.id}`}
        className="mb-5 inline-flex text-sm font-semibold text-ink-soft hover:text-navy"
      >
        ← Kembali ke {k.nama}
      </Link>

      <PageHeader
        title="Penilaian & Ulasan"
        subtitle={
          belumSelesai
            ? `Kampanye "${k.nama}" masih berjalan — ulasan bisa ditulis setelah kampanye ditutup.`
            : `Kampanye "${k.nama}" telah selesai dengan ${ribuan(k.viewsTervalidasi)} views tervalidasi.`
        }
      />

      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="mt-8 grid gap-6 lg:grid-cols-5"
      >
        {/* Form penilaian */}
        <motion.div variants={fadeUp} className="card p-7 lg:col-span-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-cream-200 text-navy">
              {menilaiKreator ? <Video size={22} /> : <Store size={22} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-muted">Anda menilai</p>
              {menilaiKreator && daftarPeserta.length > 1 ? (
                <select
                  aria-label="Kreator yang dinilai"
                  value={kreatorDinilai?.kreatorId || ''}
                  onChange={(e) => {
                    setDinilaiId(e.target.value)
                    setTerkirim(false)
                    setBintang(0)
                    setKomentar('')
                    setAspek([])
                  }}
                  className="input mt-1 py-2 font-bold text-navy"
                >
                  {daftarPeserta.map((p) => (
                    <option key={p.kreatorId} value={p.kreatorId}>{p.nama}</option>
                  ))}
                </select>
              ) : (
                <p className="text-lg font-bold text-navy">{lawan}</p>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {terkirim ? (
              <motion.div
                key="sukses"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: DUR.quick, ease: EASE.entrance }}
                className="mt-7 rounded-xl border border-success-border bg-success-soft px-5 py-10 text-center"
              >
                <CentangSukses size={34} className="mx-auto" />
                <p className="mt-3 text-lg font-bold text-success">Ulasan Terkirim</p>
                <div className="mt-3 flex justify-center">
                  <Bintang nilai={bintang} ukuran={22} />
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  Terima kasih. Penilaian Anda ikut dipakai sistem rekomendasi kreator untuk merekomendasikan
                  mitra di kampanye berikutnya.
                </p>
                {menilaiKreator && daftarPeserta.length > 1 && (
                  <p className="mt-3 text-sm text-ink-soft">Pilih kreator lain di atas untuk menilainya juga.</p>
                )}
                <Tekan className="mt-6 inline-block">
                  <Link to={menilaiKreator ? '/umkm' : '/kreator'} className="btn-primary px-5 py-2.5">
                    Kembali ke Dashboard <ArrowRight size={16} />
                  </Link>
                </Tekan>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: DUR.quick, ease: EASE.signature }}
                onSubmit={kirim}
                className="mt-7"
              >
                <label className="label">Seberapa puas Anda?</label>
                <Goyang kunci={protes}>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
                      {[1, 2, 3, 4, 5].map((n) => {
                        const menyala = n <= (hover || bintang)
                        return (
                          <motion.button
                            key={n}
                            type="button"
                            animate={{ scale: menyala ? 1.08 : 1, rotate: menyala ? -4 : 0 }}
                            whileTap={{ scale: 0.86 }}
                            whileHover={{ scale: 1.18 }}
                            transition={{ duration: DUR.hover, ease: EASE.signature }}
                            onMouseEnter={() => setHover(n)}
                            onClick={() => setBintang(n)}
                            aria-label={`Beri ${n} bintang`}
                            className={menyala ? 'text-gold-text' : 'text-ink-muted/35'}
                          >
                            <Star size={34} />
                          </motion.button>
                        )
                      })}
                    </div>
                    <AnimatePresence mode="wait">
                      {(hover || bintang) > 0 && (
                        <motion.span
                          key={hover || bintang}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16, ease: EASE.signature }}
                          className="text-sm font-semibold text-navy"
                        >
                          {['Sangat kurang', 'Kurang', 'Cukup', 'Bagus', 'Sangat bagus'][(hover || bintang) - 1]}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </Goyang>

                <div className="mt-6">
                  <label className="label">Apa yang paling menonjol?</label>
                  <div className="flex flex-wrap gap-2">
                    {daftarAspek.map((a) => {
                      const dipilih = aspek.includes(a)
                      return (
                        <motion.button
                          key={a}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          transition={{ duration: DUR.press, ease: EASE.signature }}
                          onClick={() => setAspek((v) => (dipilih ? v.filter((x) => x !== a) : [...v, a]))}
                          aria-pressed={dipilih}
                          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                            dipilih
                              ? 'border-gold-border bg-gold text-gold-text'
                              : 'border-black/10 text-ink-soft hover:border-navy/30'
                          }`}
                        >
                          {dipilih && (
                            <motion.span
                              initial={{ scale: 0, width: 0 }}
                              animate={{ scale: 1, width: 'auto' }}
                              transition={{ duration: 0.18, ease: EASE.settle }}
                              className="mr-1 inline-flex"
                            >
                              <Check size={13} />
                            </motion.span>
                          )}
                          {a}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-6">
                  <label className="label" htmlFor="komentar">Tulis ulasan Anda</label>
                  <textarea
                    id="komentar"
                    rows={4}
                    value={komentar}
                    onChange={(e) => setKomentar(e.target.value)}
                    placeholder={
                      menilaiKreator
                        ? 'Ceritakan pengalaman Anda bekerja sama dengan kreator ini...'
                        : 'Ceritakan pengalaman Anda mengerjakan kampanye ini...'
                    }
                    className="input resize-none"
                  />
                  <p className="field-help">Ulasan tampil publik di profil dan membantu pengguna lain.</p>
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
                  className={`mt-6 w-full py-3 disabled:opacity-60 ${
                    bintang === 0 ? 'btn bg-ink-muted/25 text-ink-muted' : 'btn-primary'
                  }`}
                >
                  {sibuk ? 'Mengirim…' : bintang === 0 ? 'Pilih bintang dulu' : <>Kirim Ulasan <ArrowRight size={18} /></>}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Ulasan sebelumnya */}
        <div className="space-y-5 lg:col-span-2">
          <motion.div variants={fadeUp} className="card p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title">Ulasan Kampanye Ini</h2>
              {ulasan.data?.rerata != null && (
                <span className="chip gap-1 bg-gold text-gold-text">
                  <Star size={12} /> {ulasan.data.rerata}
                </span>
              )}
            </div>

            {ulasan.memuat ? (
              <div className="mt-4"><MemuatBlok tinggi="h-24" jumlah={2} /></div>
            ) : !ulasan.data?.ulasan?.length ? (
              <p className="mt-4 rounded-xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-soft">
                Belum ada ulasan untuk kampanye ini. Jadilah yang pertama.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {ulasan.data.ulasan.map((u) => (
                  <div key={u.id} className="rounded-xl bg-cream-100 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-navy">{u.penilai}</p>
                        <span className="chip mt-1 bg-cream-300 text-[10px] uppercase tracking-wide text-ink-soft">
                          {u.peranPenilai === 'umkm' ? 'UMKM' : 'Kreator'}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-ink-muted">{waktuLalu(u.dibuatPada)}</span>
                    </div>
                    <div className="mt-2"><Bintang nilai={u.bintang} ukuran={15} /></div>
                    {u.komentar && (
                      <p className="mt-2 text-sm leading-relaxed text-ink-soft">“{u.komentar}”</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="flex items-start gap-3 rounded-xl border border-gold-border bg-gold px-4 py-3.5"
          >
            <Shield size={18} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-sm text-gold-text">
              Ulasan hanya bisa ditulis oleh pihak yang benar-benar menyelesaikan kampanye bersama,
              sehingga penilaian tetap jujur.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </AppShell>
  )
}
