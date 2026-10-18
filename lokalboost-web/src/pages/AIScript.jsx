import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, RekberBadge, Tekan, EmptyState } from '../components/ui.jsx'
import { MemuatBlok } from '../components/Muat.jsx'
import { tekan, tekanVarian, EASE, DUR } from '../motion.js'
import { GAYA_NASKAH } from '../data/pilihan.js'
import { api, useApi } from '../api.js'
import { Sparkles, Doc, Clock, ArrowRight, Check, Store } from '../components/icons.jsx'

/**
 * AI Script & Content Generator — PRD §8.2 (must-have).
 *
 * Naskah dibuat POST /api/ai/naskah dari brief kampanye yang diisi UMKM.
 * Backend memakai Gemini (cadangan: penyedia lain) dan jatuh ke penyusun
 * template bila semuanya gagal. Sumbernya ditampilkan terus terang di layar:
 * mengaku "AI" untuk hasil template adalah klaim yang tidak bisa
 * dipertanggungjawabkan di depan juri.
 */
export default function AIScript() {
  const [params] = useSearchParams()

  const kampanyeSaya = useApi(() => api.kampanyeSaya(), [])
  const rekomendasi = useApi(() => api.rekomendasiSaya(5), [])
  const riwayat = useApi(() => api.riwayatNaskah(), [])

  const [dipilih, setDipilih] = useState(params.get('kampanye') || '')
  const [gaya, setGaya] = useState(GAYA_NASKAH[0])
  const [naskah, setNaskah] = useState(null)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [disalin, setDisalin] = useState(false)
  const [lihatRiwayat, setLihatRiwayat] = useState(false)

  /**
   * Kampanye yang boleh dibuatkan naskah: yang sedang dikerjakan kreator ini,
   * ditambah yang direkomendasikan AI untuknya. Dulu daftarnya memuat SELURUH
   * kampanye platform, termasuk milik kreator lain.
   */
  const pilihan = useMemo(() => {
    const daftar = [...(kampanyeSaya.data?.kampanye || [])]
    for (const r of rekomendasi.data?.rekomendasi || []) {
      if (!daftar.some((k) => k.id === r.id)) daftar.push(r)
    }
    return daftar
  }, [kampanyeSaya.data, rekomendasi.data])

  const kampanyeAktif = pilihan.find((k) => k.id === dipilih)
  const memuatPilihan = kampanyeSaya.memuat || rekomendasi.memuat

  const buat = async () => {
    if (!dipilih) {
      setGalat('Pilih kampanye tujuan terlebih dahulu.')
      return
    }
    setGalat('')
    setSibuk(true)
    try {
      const hasil = await api.buatNaskah({ kampanyeId: dipilih, gaya })
      setNaskah(hasil.naskah)
      setDisalin(false)
      riwayat.muatUlang()
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  const salin = async () => {
    if (!naskah) return
    const teks = [
      naskah.judul,
      '',
      `HOOK: ${naskah.hook}`,
      '',
      ...naskah.adegan.map((a) => `[${a.detik}] ${a.visual}\n"${a.narasi}"`),
      '',
      `CTA: ${naskah.cta}`,
      (naskah.tagar || []).join(' '),
      ...(naskah.ideLain?.length ? ['', 'IDE LAIN:', ...naskah.ideLain.map((i) => `- ${i}`)] : []),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(teks)
      setDisalin(true)
      setTimeout(() => setDisalin(false), 2000)
    } catch {
      setGalat('Browser menolak akses papan klip. Salin manual dari layar ya.')
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Asisten Naskah AI"
        subtitle="Ubah brief dari UMKM menjadi ide video dan naskah yang siap direkam."
      >
        <RekberBadge text="Dilindungi Rekber" />
      </PageHeader>

      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="mt-8 grid gap-6 lg:grid-cols-5"
      >
        {/* Formulir brief */}
        <motion.div variants={fadeUp} className="card relative overflow-hidden p-6 lg:col-span-2">
          <div className="pointer-events-none absolute -right-6 top-0 h-32 w-32 rounded-full bg-gold/30 blur-2xl" />

          <h2 className="relative flex items-center gap-2 text-xl font-extrabold text-navy">
            <Doc size={22} /> Brief Naskah
          </h2>
          <p className="relative mt-1 text-sm text-ink-soft">
            Naskah disusun dari brief yang ditulis pemilik usaha, dan AI diminta memasukkan semua poin wajibnya. Periksa lagi sebelum merekam.
          </p>

          <div className="relative mt-5">
            <label className="label" htmlFor="kampanye">Kampanye Tujuan</label>
            {memuatPilihan ? (
              <MemuatBlok tinggi="h-11" jumlah={1} />
            ) : pilihan.length === 0 ? (
              <p className="rounded-xl bg-cream-100 px-4 py-4 text-sm text-ink-soft">
                Belum ada kampanye yang bisa dibuatkan naskah.{' '}
                <Link to="/marketplace" className="font-semibold text-navy hover:underline">
                  Cari kampanye
                </Link>{' '}
                lalu minta UMKM mengundang Anda ke kampanye.
              </p>
            ) : (
              <select
                id="kampanye"
                className="input py-2.5"
                value={dipilih}
                onChange={(e) => setDipilih(e.target.value)}
              >
                <option value="" disabled>Pilih kampanye...</option>
                {pilihan.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
            )}
          </div>

          {kampanyeAktif && (
            <div className="relative mt-4 rounded-xl bg-cream-100 px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-navy">
                <Store size={15} /> {kampanyeAktif.umkm}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {kampanyeAktif.kategori} · {kampanyeAktif.lokasi} · target{' '}
                {kampanyeAktif.targetViews?.toLocaleString('id-ID')} views
              </p>
            </div>
          )}

          <div className="relative mt-5">
            <label className="label">Gaya Penyampaian</label>
            <div className="flex flex-wrap gap-2">
              {GAYA_NASKAH.map((g) => (
                <motion.button
                  key={g}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setGaya(g)}
                  aria-pressed={gaya === g}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    gaya === g
                      ? 'border-gold-border bg-gold text-gold-text'
                      : 'border-black/10 text-ink-soft hover:border-navy/30'
                  }`}
                >
                  {g}
                </motion.button>
              ))}
            </div>
          </div>

          {galat && (
            <p role="alert" className="relative mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
              {galat}
            </p>
          )}

          <motion.button
            variants={tekanVarian}
            whileHover="hover"
            whileTap="tap"
            type="button"
            onClick={buat}
            disabled={sibuk || !dipilih}
            className="btn-primary relative mt-6 w-full py-3 disabled:opacity-60"
          >
            <motion.span
              variants={{ animate: { rotate: 0 }, hover: { rotate: -10, scale: 1.1 } }}
              transition={{ duration: DUR.hover, ease: EASE.signature }}
              className="inline-flex"
            >
              <Sparkles size={18} />
            </motion.span>
            {sibuk ? 'Menyusun naskah…' : naskah ? 'Buat Naskah Lagi' : 'Buatkan Naskah'}
          </motion.button>
        </motion.div>

        {/* Hasil */}
        <div className="space-y-5 lg:col-span-3">
          {sibuk && !naskah ? (
            <motion.div variants={fadeUp} className="card p-6">
              <MemuatBlok tinggi="h-6" jumlah={5} />
            </motion.div>
          ) : !naskah ? (
            <motion.div variants={fadeUp}>
              <EmptyState
                icon={Sparkles}
                title="Naskah Anda akan muncul di sini"
                subtitle="Pilih kampanye dan gaya penyampaian, lalu tekan Buatkan Naskah. Semua poin brief dari UMKM otomatis dimasukkan."
              />
            </motion.div>
          ) : (
            <>
              <motion.div
                variants={fadeUp}
                className="rounded-2xl border-l-4 border-gold-border bg-white p-5 shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                    Konsep Ide Video
                  </span>
                  <span className="chip gap-1 bg-gold text-gold-text">
                    <Sparkles size={12} />
                    {naskah.sumber !== 'llm'
                      ? 'Disusun dari template brief'
                      : naskah.penyedia === 'gemini'
                        ? 'Dibuat AI Gemini'
                        : 'Dibuat model bahasa'}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-navy">“{naskah.judul}”</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{naskah.hook}</p>
              </motion.div>

              <motion.div variants={fadeUp} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 font-semibold text-navy">
                    <Doc size={16} /> Draf Naskah ({naskah.adegan.length} adegan)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLihatRiwayat((v) => !v)}
                      className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-cream-100"
                    >
                      {lihatRiwayat ? 'Tutup Riwayat' : `Riwayat (${riwayat.data?.naskah?.length || 0})`}
                    </button>
                    <button
                      type="button"
                      onClick={buat}
                      disabled={sibuk}
                      className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-cream-100 disabled:opacity-60"
                    >
                      Buat Ulang
                    </button>
                  </div>
                </div>

                <motion.div
                  key={naskah.judul + naskah.adegan.length}
                  variants={{ animate: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } } }}
                  initial="initial"
                  animate="animate"
                  className="mt-4 space-y-5 text-sm leading-relaxed"
                >
                  {naskah.adegan.map((a, i) => {
                    const warna =
                      i === 0 ? 'border-danger' : i === naskah.adegan.length - 1 ? 'border-success' : 'border-navy'
                    const labelWarna =
                      i === 0 ? 'text-danger' : i === naskah.adegan.length - 1 ? 'text-success' : 'text-navy'
                    return (
                      <motion.div key={`${a.detik}-${i}`} variants={fadeUp} className={`border-l-2 pl-4 ${warna}`}>
                        <p className={`text-xs font-bold uppercase tracking-wide ${labelWarna}`}>
                          Detik {a.detik}
                        </p>
                        <p className="mt-1 italic text-ink-muted">[Visual: {a.visual}]</p>
                        <p className="mt-2 text-ink-soft">“{a.narasi}”</p>
                      </motion.div>
                    )
                  })}

                  <motion.div variants={fadeUp} className="border-l-2 border-gold-border pl-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-gold-text">Ajakan Penutup</p>
                    <p className="mt-2 text-ink-soft">“{naskah.cta}”</p>
                    {naskah.tagar?.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-2">
                        {naskah.tagar.map((t) => (
                          <span key={t} className="chip bg-cream-200 text-xs text-ink-soft">{t}</span>
                        ))}
                      </p>
                    )}
                  </motion.div>
                </motion.div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
                  <span className="flex items-center gap-1 text-xs text-ink-muted">
                    <Clock size={14} /> Naskah tersimpan otomatis di riwayat Anda
                  </span>
                  <motion.button {...tekan} onClick={salin} className="btn-primary px-3 py-2 text-xs">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={disalin ? 'ok' : 'salin'}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1.5"
                      >
                        {disalin ? <><Check size={13} /> Tersalin</> : 'Salin Teks'}
                      </motion.span>
                    </AnimatePresence>
                  </motion.button>
                </div>
              </motion.div>

              {naskah.ideLain?.length > 0 && (
                <motion.div variants={fadeUp} className="card p-5">
                  <p className="flex items-center gap-2 font-semibold text-navy">
                    <Sparkles size={16} /> Ide Konten Lain
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                    {naskah.ideLain.map((ide) => (
                      <li key={ide} className="rounded-xl bg-cream-100 px-4 py-3">{ide}</li>
                    ))}
                  </ul>
                </motion.div>
              )}

              {/* Riwayat naskah */}
              <AnimatePresence initial={false}>
                {lihatRiwayat && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="card overflow-hidden p-5"
                  >
                    <p className="font-semibold text-navy">Naskah yang pernah dibuat</p>
                    <div className="mt-3 space-y-2">
                      {(riwayat.data?.naskah || []).length === 0 ? (
                        <p className="text-sm text-ink-soft">Belum ada naskah tersimpan.</p>
                      ) : (
                        riwayat.data.naskah.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setNaskah(n.isi)
                              setLihatRiwayat(false)
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-xl bg-cream-100 px-4 py-3 text-left transition-colors hover:bg-cream-200"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-navy">{n.judul}</span>
                              <span className="block text-xs text-ink-muted">
                                {n.sumber === 'llm' ? 'Model bahasa' : 'Template'} · {n.kampanyeId}
                              </span>
                            </span>
                            <ArrowRight size={15} className="shrink-0 text-ink-muted" />
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row">
            <Tekan className="flex-1">
              <Link to="/kreator" className="btn-outline w-full py-3">← Kembali ke Dashboard</Link>
            </Tekan>
            <Tekan className="flex-[2]">
              <Link to="/kreator/video" className="btn-primary w-full py-3">
                Lanjut ke Setor Video <ArrowRight size={18} />
              </Link>
            </Tekan>
          </motion.div>
        </div>
      </motion.div>
    </AppShell>
  )
}
