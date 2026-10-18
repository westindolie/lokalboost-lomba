import { useId, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { KepalaWizard } from '../components/CampaignStepper.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { Tekan, AvatarKreator, GalatKolom } from '../components/ui.jsx'
import { EASE, DUR } from '../motion.js'
import { KATEGORI as categories } from '../data/pilihan.js'
import { rupiah, ribuan, pengikut } from '../format.js'
import { api, useApi } from '../api.js'
import { useDraf } from '../draf.jsx'
import { MemuatBlok } from '../components/Muat.jsx'
import {
  BATAS,
  MODEL,
  PILIHAN_AMBANG,
  PILIHAN_TARGET,
  PILIHAN_TARIF_CPM,
  PILIHAN_TARIF_VIEW,
  galatDraf,
  hitungDraf,
  jepit,
  tarifPerViewTeks,
} from '../reward.js'
import { Shield, ArrowRight, Sparkles, Coins, Target, Info, Plus, Check, Image } from '../components/icons.jsx'

/**
 * Langkah 2: Target & Reward.
 *
 * Tiga konsep yang sengaja dipisah di layar, karena paling mudah tertukar:
 *   - Target views kampanye   : jangkauan total dari semua kreator.
 *   - Target views minimal    : syarat SEORANG kreator berhak atas reward.
 *   - Tarif reward            : rupiah per views tervalidasi.
 *
 * Semua angka dihitung reward.js (rumus yang sama dengan server) dan
 * disimpan di draf bersama, supaya langkah 3 menagih angka yang persis sama.
 */

/** Pil pilihan cepat dengan latar terpilih yang meluncur. */
function PilihanCepat({ layoutId, pilihan, nilai, onPilih, format = ribuan, nonaktif = () => false }) {
  return (
    <div className="flex flex-wrap gap-2">
      {pilihan.map((v) => {
        const terpilih = nilai === v
        const mati = nonaktif(v)
        return (
          <motion.button
            key={v}
            type="button"
            disabled={mati}
            onClick={() => onPilih(v)}
            whileTap={mati ? undefined : { scale: 0.96 }}
            transition={{ duration: DUR.press, ease: EASE.signature }}
            className={`relative rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              terpilih ? 'text-white' : 'bg-cream-200 text-ink-soft hover:bg-cream-300'
            }`}
          >
            {/* z-0, bukan -z-10: nilai negatif menaruh pil di belakang kartu putih. */}
            {terpilih && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 z-0 rounded-full bg-navy"
                transition={{ duration: DUR.quick, ease: EASE.signature }}
              />
            )}
            <span className="relative z-10">{format(v)}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

/**
 * Slider + kotak angka yang selalu sinkron. Kotak angka menerima ketikan
 * bebas (termasuk di luar jangkauan slider) dan baru dijepit ke batas saat
 * fokus lepas, supaya mengetik "25000" tidak terpotong di tengah jalan.
 */
function InputViews({ id, label, nilai, onUbah, min, maks, sliderMaks = maks, step = 500, pilihan, layoutId, galat }) {
  const [ketik, setKetik] = useState(null)
  const tampil = ketik ?? ribuan(nilai)
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="label mb-0" htmlFor={id}>{label}</label>
        <div className="flex items-center gap-2">
          <input
            id={id}
            inputMode="numeric"
            value={tampil}
            onFocus={() => setKetik(String(nilai))}
            onChange={(e) => {
              const bersih = e.target.value.replace(/\D/g, '').slice(0, 9)
              setKetik(bersih)
              if (bersih) onUbah(Number(bersih))
            }}
            onBlur={() => {
              onUbah(jepit(nilai, min, maks))
              setKetik(null)
            }}
            aria-invalid={Boolean(galat) || undefined}
            aria-describedby={galat ? `${id}-galat` : undefined}
            className={`input w-32 py-2 text-right text-lg font-extrabold text-navy ${galat ? 'border-danger' : ''}`}
          />
          <span className="text-sm font-semibold text-ink-soft">views</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={sliderMaks}
        step={step}
        value={Math.min(Math.max(nilai, min), sliderMaks)}
        onChange={(e) => onUbah(Number(e.target.value))}
        aria-label={`${label} (geser)`}
        className="mt-3 w-full accent-navy"
      />
      <div className="mt-1 flex justify-between text-[11px] text-ink-muted">
        <span>{ribuan(min)}</span>
        <span>
          {ribuan(sliderMaks)}
          {sliderMaks < maks ? '+ (ketik untuk lebih)' : ''}
        </span>
      </div>
      {pilihan && (
        <div className="mt-3">
          <PilihanCepat layoutId={layoutId} pilihan={pilihan} nilai={nilai} onPilih={onUbah} nonaktif={(v) => v > maks} />
        </div>
      )}
      <GalatKolom id={`${id}-galat`} pesan={galat} />
    </div>
  )
}

/** Kotak rupiah yang menerima ketikan angka saja. */
function InputRupiah({ id, nilai, onUbah, galat, placeholder }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-soft">Rp</span>
      <input
        id={id}
        inputMode="numeric"
        value={nilai ? ribuan(nilai) : ''}
        placeholder={placeholder}
        onChange={(e) => onUbah(Number(e.target.value.replace(/\D/g, '').slice(0, 10)) || 0)}
        aria-invalid={Boolean(galat) || undefined}
        className={`input pl-10 font-semibold ${galat ? 'border-danger' : ''}`}
      />
    </div>
  )
}

function Bagian({ nomor, judul, sub, children, ikon: Ikon }) {
  return (
    <motion.section variants={fadeUp} className="card p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-white">{nomor}</span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-navy">
            {Ikon && <Ikon size={17} />} {judul}
          </h2>
          {sub && <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </motion.section>
  )
}

/** Katalog produk: pilih produk + jumlah, atau tambah produk baru di tempat. */
function PilihProduk({ katalog, memuat, terpilih, onUbah, onKatalogBerubah, galat }) {
  const [baru, setBaru] = useState(null)
  const [sibuk, setSibuk] = useState(false)
  const [galatBaru, setGalatBaru] = useState('')
  const inputFoto = useRef(null)
  const idForm = useId()

  const kuotaDari = (id) => terpilih.find((r) => r.produkId === id)?.kuota
  const alih = (p) => {
    if (kuotaDari(p.id) != null) onUbah(terpilih.filter((r) => r.produkId !== p.id))
    else onUbah([...terpilih, { produkId: p.id, kuota: Math.min(5, p.stok) || 1 }])
  }
  const ubahKuota = (id, kuota) => onUbah(terpilih.map((r) => (r.produkId === id ? { ...r, kuota } : r)))

  const simpanBaru = async (e) => {
    e.preventDefault()
    setSibuk(true)
    setGalatBaru('')
    try {
      const hasil = await api.tambahProduk({ nama: baru.nama, nilai: baru.nilai, stok: baru.stok })
      const berkas = inputFoto.current?.files?.[0]
      if (berkas) {
        const form = new FormData()
        form.append('foto', berkas)
        await api.unggahFotoProduk(hasil.produk.id, form).catch((err) => setGalatBaru(`Produk tersimpan, foto gagal: ${err.message}`))
      }
      onKatalogBerubah()
      onUbah([...terpilih, { produkId: hasil.produk.id, kuota: Math.min(5, hasil.produk.stok) || 1 }])
      setBaru(null)
    } catch (err) {
      setGalatBaru(err.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <div>
      {memuat ? (
        <MemuatBlok tinggi="h-16" jumlah={2} />
      ) : !katalog.length && !baru ? (
        <p className="rounded-xl bg-cream-100 px-4 py-4 text-sm text-ink-soft">
          Katalog produk Anda masih kosong. Tambahkan produk yang ingin dijadikan reward.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {katalog.map((p) => {
            const kuota = kuotaDari(p.id)
            const dipilih = kuota != null
            return (
              <div
                key={p.id}
                className={`min-w-0 rounded-xl border p-3 transition-colors ${dipilih ? 'border-navy bg-cream-100' : 'border-black/10 bg-white'}`}
              >
                <button
                  type="button"
                  onClick={() => alih(p)}
                  disabled={!p.stok && !dipilih}
                  aria-pressed={dipilih}
                  className="flex w-full items-center gap-3 text-left disabled:opacity-50"
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-cream-200 text-ink-muted">
                    {p.foto ? <img src={p.foto} alt="" className="h-full w-full object-cover" /> : <Image size={20} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-navy">{p.nama}</span>
                    <span className="block text-xs text-ink-soft">
                      {rupiah(p.nilai)} · stok {ribuan(p.stok)}
                    </span>
                  </span>
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                      dipilih ? 'border-navy bg-navy text-white' : 'border-black/20 text-transparent'
                    }`}
                  >
                    <Check size={13} />
                  </span>
                </button>
                {dipilih && (
                  <label className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-soft">
                    Jumlah untuk kampanye
                    <input
                      inputMode="numeric"
                      value={kuota || ''}
                      onChange={(e) => ubahKuota(p.id, Number(e.target.value.replace(/\D/g, '').slice(0, 5)) || 0)}
                      className="input w-20 py-1.5 text-right"
                      aria-label={`Jumlah ${p.nama} untuk reward`}
                    />
                  </label>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AnimatePresence initial={false} mode="wait">
        {baru ? (
          <motion.form
            key="baru"
            onSubmit={simpanBaru}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden rounded-xl border border-dashed border-navy/30 p-4"
          >
            <p className="text-sm font-semibold text-navy">Produk baru</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="label" htmlFor={`${idForm}-nama`}>Nama produk</label>
                <input
                  id={`${idForm}-nama`}
                  value={baru.nama}
                  onChange={(e) => setBaru({ ...baru, nama: e.target.value })}
                  className="input"
                  placeholder="Contoh: Nastar 500 gr"
                />
              </div>
              <div>
                <label className="label" htmlFor={`${idForm}-nilai`}>Harga (nilai)</label>
                <InputRupiah id={`${idForm}-nilai`} nilai={baru.nilai} onUbah={(nilai) => setBaru({ ...baru, nilai })} />
              </div>
              <div>
                <label className="label" htmlFor={`${idForm}-stok`}>Stok reward</label>
                <input
                  id={`${idForm}-stok`}
                  inputMode="numeric"
                  value={baru.stok || ''}
                  onChange={(e) => setBaru({ ...baru, stok: Number(e.target.value.replace(/\D/g, '').slice(0, 6)) || 0 })}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor={`${idForm}-foto`}>Foto (opsional)</label>
                <input id={`${idForm}-foto`} ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" className="input py-2 text-xs" />
              </div>
            </div>
            {galatBaru && <p role="alert" className="mt-3 text-sm text-danger">{galatBaru}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBaru(null)} className="btn-outline px-4 py-2 text-sm">Batal</button>
              <button type="submit" disabled={sibuk} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
                {sibuk ? 'Menyimpan…' : 'Simpan ke Katalog'}
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.button
            key="tombol"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setBaru({ nama: '', nilai: 0, stok: 10 })}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy hover:underline"
          >
            <Plus size={15} /> Tambah produk ke katalog
          </motion.button>
        )}
      </AnimatePresence>
      <GalatKolom id="galat-produk" pesan={galat} />
    </div>
  )
}

function BarisRingkasan({ label, nilai }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/10 py-2">
      <dt className="text-sm text-white/70">{label}</dt>
      <dd className="text-right text-sm font-semibold">{nilai}</dd>
    </div>
  )
}

export default function TargetBudgeting() {
  const { draf, ubah, langkahSatuLengkap } = useDraf()
  const navigasi = useNavigate()
  const [cobaLanjut, setCobaLanjut] = useState(false)

  const katalogApi = useApi(() => api.produkSaya(), [])
  const katalog = useMemo(() => katalogApi.data?.produk || [], [katalogApi.data])
  const h = useMemo(() => hitungDraf(draf, katalog), [draf, katalog])
  const galat = useMemo(() => galatDraf(draf, katalog), [draf, katalog])
  const adaGalat = Object.keys(galat).length > 0
  // Kolom yang kosong di awal (produk) baru ditandai setelah pengguna mencoba lanjut.
  const tampilGalat = (k) => (cobaLanjut || k !== 'produk' ? galat[k] : '')

  const kategoriTerpilih = [draf.kategori, ...(draf.kategoriLain || [])].filter(Boolean)
  const alihKategori = (c) => {
    const ada = kategoriTerpilih.includes(c)
    const baru = ada ? kategoriTerpilih.filter((x) => x !== c) : [...kategoriTerpilih, c]
    if (!baru.length) return // minimal satu kategori
    ubah({ kategori: baru[0], kategoriLain: baru.slice(1) })
  }

  const cat = draf.kategori || 'Kuliner'
  const { data: kandidat, memuat: memuatKandidat } = useApi(
    () => api.daftarKreator({ niche: cat, lokasi: draf.lokasi?.split(',')[0]?.trim() }),
    [cat, draf.lokasi],
  )
  const semuaKreator = useApi(() => api.daftarKreator({ niche: cat }), [cat])
  const potensi = kandidat?.kreator?.[0] || semuaKreator.data?.kreator?.[0] || null

  if (!langkahSatuLengkap) return <Navigate to="/umkm/kampanye/baru" replace />

  const lanjut = () => {
    setCobaLanjut(true)
    if (adaGalat) {
      requestAnimationFrame(() =>
        document.querySelector('[aria-invalid="true"], #galat-lanjut')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      )
      return
    }
    navigasi('/umkm/kampanye/setor')
  }

  const contohAmbang = Math.min(h.pakaiTunai ? h.ambangTunai : h.ambangProduk, h.target)
  let nomor = 0
  const berikut = () => ++nomor

  return (
    <AppShell>
      <motion.div variants={stagger} initial="initial" animate="animate">
        <KepalaWizard
          langkah={2}
          judul="Tentukan Target & Reward"
          sub="Atur jangkauan yang ingin dicapai, reward untuk kreator, dan kapan reward itu boleh dicairkan."
        />
      </motion.div>

      <motion.div variants={stagger} initial="initial" animate="animate" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Target jangkauan */}
          <Bagian
            nomor={berikut()}
            judul="Target Jangkauan Campaign"
            ikon={Target}
            sub="Total views yang ingin dicapai dari semua kreator yang ikut, bukan target untuk tiap kreator."
          >
            <InputViews
              id="target-views"
              label="Target views kampanye"
              nilai={draf.targetViews}
              onUbah={(n) => ubah({ targetViews: n })}
              min={BATAS.targetMin}
              maks={BATAS.targetMaks}
              sliderMaks={BATAS.sliderTargetMaks}
              pilihan={PILIHAN_TARGET}
              layoutId="pil-target"
              galat={tampilGalat('target')}
            />
            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-soft">
              <Info size={13} className="mt-0.5 shrink-0" />
              Hanya views yang tervalidasi sesuai ketentuan LokalBoost yang dihitung: views sebelum video disetor, dari akun
              orang lain, atau yang naik tidak wajar tidak ikut dihitung.
            </p>
          </Bagian>

          {/* Model reward */}
          <Bagian nomor={berikut()} judul="Pilih Model Reward" ikon={Sparkles} sub="Apa yang didapat kreator saat videonya ditonton.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Model reward">
              {Object.entries(MODEL).map(([kunci, m]) => {
                const terpilih = h.model === kunci
                return (
                  <motion.button
                    key={kunci}
                    type="button"
                    role="radio"
                    aria-checked={terpilih}
                    onClick={() => ubah({ modelReward: kunci })}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: DUR.hover, ease: EASE.signature }}
                    className={`relative rounded-xl border p-4 text-left transition-colors ${
                      terpilih ? 'border-navy bg-navy text-white' : 'border-black/10 bg-white hover:border-navy/40'
                    }`}
                  >
                    <span className="text-2xl" aria-hidden>
                      {kunci === 'tunai' ? '💵' : kunci === 'produk' ? '🎁' : '💵🎁'}
                    </span>
                    <span className="mt-2 block font-bold">{m.judul}</span>
                    <span className={`mt-0.5 block text-xs ${terpilih ? 'text-white/75' : 'text-ink-soft'}`}>{m.sub}</span>
                    {terpilih && (
                      <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-gold text-navy">
                        <Check size={12} />
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>
          </Bagian>

          {/* Tarif & anggaran (uang) */}
          {h.pakaiTunai && (
            <Bagian
              nomor={berikut()}
              judul="Tarif & Anggaran Uang"
              ikon={Coins}
              sub="Reward uang dihitung dari views tervalidasi, dibayar dari dana yang Anda setor ke Rekber."
            >
              <div className="inline-flex flex-wrap rounded-2xl bg-cream-200 p-1" role="radiogroup" aria-label="Skema tarif">
                {[
                  { k: 'per_view', l: 'Per view' },
                  { k: 'cpm', l: 'Per 1.000 views (CPM)' },
                ].map(({ k, l }) => {
                  const aktif = (draf.skemaTarif || 'per_view') === k
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={aktif}
                      onClick={() => ubah({ skemaTarif: k })}
                      className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-colors ${aktif ? 'bg-navy text-white' : 'text-ink-soft'}`}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="label" htmlFor="tarif">{draf.skemaTarif === 'cpm' ? 'Tarif per 1.000 views' : 'Tarif per view'}</label>
                  <InputRupiah
                    id="tarif"
                    nilai={draf.skemaTarif === 'cpm' ? draf.tarifCpm : draf.tarifPerView}
                    onUbah={(n) => ubah(draf.skemaTarif === 'cpm' ? { tarifCpm: n } : { tarifPerView: n })}
                    galat={tampilGalat('tarif')}
                  />
                  <div className="mt-2">
                    <PilihanCepat
                      layoutId="pil-tarif"
                      pilihan={draf.skemaTarif === 'cpm' ? PILIHAN_TARIF_CPM : PILIHAN_TARIF_VIEW}
                      nilai={draf.skemaTarif === 'cpm' ? draf.tarifCpm : draf.tarifPerView}
                      onPilih={(v) => ubah(draf.skemaTarif === 'cpm' ? { tarifCpm: v } : { tarifPerView: v })}
                      format={(v) => rupiah(v)}
                    />
                  </div>
                  <p className="field-help">
                    {draf.skemaTarif === 'cpm'
                      ? `Setara ${tarifPerViewTeks(h.cpm)} per view. Rp ${ribuan(BATAS.cpmMin)} sampai Rp ${ribuan(BATAS.cpmMaks)}.`
                      : `Rp ${BATAS.tarifMin} sampai Rp ${ribuan(BATAS.tarifMaks)} per view tervalidasi.`}
                  </p>
                  <GalatKolom id="galat-tarif" pesan={tampilGalat('tarif')} />
                </div>

                <div className="min-w-0">
                  <label className="label" htmlFor="anggaran">Anggaran maksimal kampanye</label>
                  <InputRupiah id="anggaran" nilai={h.anggaran} onUbah={(n) => ubah({ anggaranManual: true, anggaranMaks: n })} galat={galat.anggaran} />
                  <p className="field-help">
                    {draf.anggaranManual ? (
                      <button type="button" onClick={() => ubah({ anggaranManual: false })} className="font-semibold text-navy underline">
                        Samakan dengan estimasi ({rupiah(h.biayaTarget)})
                      </button>
                    ) : (
                      'Mengikuti estimasi biaya target. Ketik angka lain untuk menambah cadangan.'
                    )}
                  </p>
                  <p className="field-help">Dana ini disetor ke Rekber. Yang tidak terpakai kembali ke Anda.</p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { l: 'Estimasi biaya reward', v: rupiah(h.biayaTarget), s: `untuk ${ribuan(h.target)} views` },
                  { l: 'Views terbiayai', v: ribuan(h.viewsTerbiayai), s: 'dengan anggaran ini' },
                  { l: 'Sisa anggaran', v: rupiah(h.sisaAnggaran), s: 'cadangan di Rekber' },
                  { l: 'Tarif efektif', v: tarifPerViewTeks(h.cpm), s: 'per view' },
                ].map((x) => (
                  <div key={x.l} className="min-w-0 rounded-xl bg-cream-100 px-3 py-3">
                    <dt className="text-[11px] text-ink-muted">{x.l}</dt>
                    <dd className="truncate text-base font-extrabold text-navy">{x.v}</dd>
                    <dd className="text-[11px] text-ink-soft">{x.s}</dd>
                  </div>
                ))}
              </dl>
              {galat.anggaran && (
                <p role="alert" className="mt-4 rounded-lg border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning">
                  {galat.anggaran}
                </p>
              )}
            </Bagian>
          )}

          {/* Produk */}
          {h.pakaiProduk && (
            <Bagian
              nomor={berikut()}
              judul="Produk sebagai Reward"
              sub="Pilih produk dari katalog dan berapa yang disiapkan. Satu kreator mendapat satu produk, selama kuota masih ada."
            >
              <PilihProduk
                katalog={katalog}
                memuat={katalogApi.memuat}
                terpilih={draf.produkReward || []}
                onUbah={(produkReward) => ubah({ produkReward })}
                onKatalogBerubah={katalogApi.muatUlang}
                galat={tampilGalat('produk')}
              />
              <p className="mt-4 rounded-lg bg-cream-100 px-4 py-3 text-xs text-ink-soft">
                Kreator mengisi alamat saat mengklaim, lalu Anda mengirim produknya sendiri dan menandainya “dikirim” di Laporan
                Hasil. Stok dipotong saat kampanye terbit; sisa yang tidak diklaim kembali ke katalog.
              </p>
            </Bagian>
          )}

          {/* Ambang views */}
          <Bagian
            nomor={berikut()}
            judul="Target Views Minimal untuk Reward"
            ikon={Target}
            sub="Syarat seorang kreator berhak atas reward. Ambang ini menentukan kelayakan, bukan nominal."
          >
            <div className="mb-5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              {[
                { j: 'Target views kampanye', i: `${ribuan(h.target)} views, dari semua kreator` },
                { j: 'Target views minimal', i: 'Syarat tiap kreator sebelum reward boleh dicairkan atau diklaim' },
                { j: 'Tarif reward', i: h.pakaiTunai ? `${tarifPerViewTeks(h.cpm)} per view tervalidasi` : 'Produk, bukan uang' },
              ].map((x) => (
                <div key={x.j} className="rounded-lg border border-black/5 bg-cream-100 px-3 py-2.5">
                  <p className="font-semibold text-navy">{x.j}</p>
                  <p className="mt-0.5 text-ink-soft">{x.i}</p>
                </div>
              ))}
            </div>

            {h.pakaiTunai && (
              <InputViews
                id="ambang-tunai"
                label={h.model === 'kombinasi' && !draf.pisahAmbang ? 'Minimal views untuk reward uang & produk' : 'Minimal views untuk pencairan uang'}
                nilai={draf.ambangViewsTunai}
                onUbah={(n) => ubah({ ambangViewsTunai: n })}
                min={BATAS.ambangMin}
                maks={Math.max(BATAS.ambangMin, h.target)}
                sliderMaks={Math.max(BATAS.ambangMin, Math.min(h.target, 50_000))}
                step={100}
                pilihan={PILIHAN_AMBANG}
                layoutId="pil-ambang-tunai"
                galat={galat.ambangTunai}
              />
            )}

            {h.model === 'kombinasi' && (
              <label className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={Boolean(draf.pisahAmbang)}
                  onChange={(e) => ubah({ pisahAmbang: e.target.checked, ambangViewsProduk: draf.ambangViewsTunai })}
                  className="h-4 w-4 accent-navy"
                />
                Atur target minimal klaim produk secara terpisah
              </label>
            )}

            {(h.model === 'produk' || (h.model === 'kombinasi' && draf.pisahAmbang)) && (
              <div className="mt-5">
                <InputViews
                  id="ambang-produk"
                  label="Minimal views untuk klaim produk"
                  nilai={draf.ambangViewsProduk}
                  onUbah={(n) => ubah({ ambangViewsProduk: n })}
                  min={BATAS.ambangMin}
                  maks={Math.max(BATAS.ambangMin, h.target)}
                  sliderMaks={Math.max(BATAS.ambangMin, Math.min(h.target, 50_000))}
                  step={100}
                  pilihan={PILIHAN_AMBANG}
                  layoutId="pil-ambang-produk"
                  galat={galat.ambangProduk}
                />
              </div>
            )}

            {h.pakaiTunai && (
              <fieldset className="mt-6">
                <legend className="label">Aturan pencairan uang</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    {
                      k: 'per_milestone',
                      j: 'Sekali di setiap milestone (bawaan)',
                      i: `Boleh dicairkan di ${ribuan(h.ambangTunai)}, ${ribuan(h.ambangTunai * 2)}, ${ribuan(h.ambangTunai * 3)} views, dan seterusnya. Tiap milestone hanya sekali.`,
                    },
                    {
                      k: 'sekali',
                      j: 'Sekali saja',
                      i: `Cair sekali saat ${ribuan(h.ambangTunai)} views tercapai. Sisanya cair saat kampanye selesai.`,
                    },
                  ].map((o) => {
                    const aktif = (draf.modePencairan || 'per_milestone') === o.k
                    return (
                      <label
                        key={o.k}
                        className={`cursor-pointer rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-navy/30 ${
                          aktif ? 'border-navy bg-cream-100' : 'border-black/10 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="mode-pencairan"
                          value={o.k}
                          checked={aktif}
                          onChange={() => ubah({ modePencairan: o.k })}
                          className="sr-only"
                        />
                        <span className="flex items-center gap-2 text-sm font-semibold text-navy">
                          <span className={`h-3.5 w-3.5 rounded-full border-2 ${aktif ? 'border-navy bg-navy' : 'border-black/25'}`} />
                          {o.j}
                        </span>
                        <span className="mt-1 block text-xs text-ink-soft">{o.i}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}

            <div className="mt-5 rounded-xl border border-gold-border bg-gold px-4 py-3.5 text-sm text-gold-text">
              <p className="font-semibold text-navy">Contoh dengan angka Anda</p>
              <p className="mt-1">
                Target kampanye {ribuan(h.target)} views. Kreator yang sudah mendapat {ribuan(contohAmbang)} views tervalidasi
                {h.pakaiTunai && <> boleh mencairkan {rupiah(h.rewardDiAmbang)} (sebelum komisi platform)</>}
                {h.pakaiTunai && h.pakaiProduk && ' dan'}
                {h.pakaiProduk && <> boleh mengklaim satu produk selama kuota masih ada</>}. Kreator yang sampai kampanye selesai belum
                mencapai ambangnya tidak mendapat reward{h.pakaiTunai && ', dan dananya kembali ke Anda'}.
              </p>
            </div>
          </Bagian>

          {/* Kategori + lama */}
          <Bagian
            nomor={berikut()}
            judul="Penonton & Durasi"
            sub="Kategori pertama adalah kategori utama produk Anda. Tambahkan kategori lain bila penontonnya juga cocok."
          >
            <div className="flex flex-wrap gap-2.5">
              {categories.map((c) => {
                const terpilih = kategoriTerpilih.includes(c)
                const utama = c === draf.kategori
                return (
                  <motion.button
                    key={c}
                    type="button"
                    aria-pressed={terpilih}
                    onClick={() => alihKategori(c)}
                    whileTap={{ scale: 0.96 }}
                    transition={{ duration: DUR.press, ease: EASE.signature }}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      terpilih ? 'bg-navy text-white' : 'bg-cream-200 text-ink-soft hover:bg-cream-300'
                    }`}
                  >
                    {c}
                    {utama && <span className="ml-1.5 text-[10px] font-bold uppercase text-gold">utama</span>}
                  </motion.button>
                )
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <label className="label mb-0" htmlFor="tenggat">Lama kampanye</label>
              <input
                id="tenggat"
                inputMode="numeric"
                value={draf.tenggatHari || ''}
                onChange={(e) => ubah({ tenggatHari: Math.min(BATAS.lamaMaks, Number(e.target.value.replace(/\D/g, '')) || 0) })}
                aria-invalid={Boolean(galat.lama) || undefined}
                className="input w-20 py-2 text-right"
              />
              <span className="text-sm text-ink-soft">hari</span>
            </div>
            <GalatKolom id="galat-lama" pesan={galat.lama} />
          </Bagian>

          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
            <Tekan>
              <Link to="/umkm/kampanye/baru" className="btn-outline px-5 py-3">← Kembali</Link>
            </Tekan>
            <Tekan>
              <button type="button" onClick={lanjut} className="btn-primary px-5 py-3">
                {h.model === 'produk' ? 'Lanjut ke Ringkasan' : 'Lanjut ke Pembayaran'} <ArrowRight size={18} />
              </button>
            </Tekan>
          </motion.div>
          {cobaLanjut && adaGalat && (
            <div id="galat-lanjut" role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
              <p className="font-semibold">Periksa lagi sebelum lanjut:</p>
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(galat).map(([k, p]) => <li key={k}>{p}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Ringkasan: kanan di desktop, di bawah formulir di HP. Kartu potensi
            di atas supaya kartu ringkasan yang sticky tidak menimpa apa pun. */}
        <motion.aside variants={fadeUp} className="min-w-0 space-y-5">
          <div className="card p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-navy">
              <Sparkles size={15} /> Potensi Kreator Cocok
            </p>
            {memuatKandidat ? (
              <div className="mt-3"><MemuatBlok tinggi="h-12" jumlah={1} /></div>
            ) : !potensi ? (
              <p className="mt-3 rounded-lg bg-cream-100 px-3 py-4 text-center text-xs text-ink-soft">
                Belum ada kreator terdaftar di niche {cat}. Kampanye tetap bisa dibuat; kreator dari niche berdekatan masih boleh
                melamar.
              </p>
            ) : (
              <Link to={`/kreator/profil/${potensi.id}`} className="mt-3 flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-cream-100">
                <AvatarKreator c={potensi} className="h-11 w-11 rounded-full" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{potensi.nama}</p>
                  <p className="text-sm text-ink-soft">
                    {pengikut(potensi.pengikut)} pengikut · {potensi.lokasi || potensi.niche}
                  </p>
                </div>
              </Link>
            )}
          </div>

          <div className="rounded-2xl bg-navy p-6 text-white lg:sticky lg:top-24 lg:z-10 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <h2 className="text-xl font-bold">Ringkasan Kampanye</h2>
            <dl className="mt-3">
              <BarisRingkasan label="Target views kampanye" nilai={`${ribuan(h.target)} views`} />
              <BarisRingkasan label="Model reward" nilai={MODEL[h.model].judul} />
              {h.pakaiTunai && (
                <>
                  <BarisRingkasan
                    label="Tarif reward"
                    nilai={draf.skemaTarif === 'cpm' ? `${rupiah(h.cpm)} / 1.000 views` : `${rupiah(draf.tarifPerView)} / view`}
                  />
                  <BarisRingkasan label="Minimal views pencairan" nilai={`${ribuan(h.ambangTunai)} views`} />
                  <BarisRingkasan label="Aturan pencairan" nilai={draf.modePencairan === 'sekali' ? 'Sekali saja' : 'Tiap milestone'} />
                  <BarisRingkasan label="Estimasi reward" nilai={rupiah(h.biayaTarget)} />
                  <BarisRingkasan label="Sisa anggaran" nilai={rupiah(h.sisaAnggaran)} />
                </>
              )}
              {h.pakaiProduk && (
                <>
                  <BarisRingkasan label="Minimal views klaim produk" nilai={`${ribuan(h.ambangProduk)} views`} />
                  <BarisRingkasan
                    label="Produk reward"
                    nilai={h.produk.length ? h.produk.map((p) => `${p.nama} ×${ribuan(p.kuota)}`).join(', ') : 'Belum dipilih'}
                  />
                  <BarisRingkasan label="Nilai produk" nilai={rupiah(h.nilaiProduk)} />
                </>
              )}
            </dl>
            {h.pakaiTunai ? (
              <div className="mt-3 border-t border-white/20 pt-3">
                <p className="text-sm text-white/80">Total anggaran (disetor ke Rekber)</p>
                <motion.p
                  key={h.anggaran}
                  initial={{ y: -6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.22, ease: EASE.entrance }}
                  className="mt-0.5 whitespace-nowrap text-3xl font-extrabold"
                >
                  {rupiah(h.anggaran)}
                </motion.p>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80">
                Tidak ada uang yang disetor. Kampanye terbit setelah lolos pemeriksaan isi.
              </p>
            )}
            {h.kreatorMaksDiAmbang > 0 && (
              <p className="mt-4 text-xs text-white/70">
                Cukup untuk sekitar {ribuan(h.kreatorMaksDiAmbang)} kreator yang masing-masing mencapai {ribuan(h.ambangTunai)} views.
                Kreator boleh terus bergabung sampai anggaran habis.
              </p>
            )}
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-white/10 px-3 py-2.5 text-xs text-white/80">
              <Shield size={14} className="mt-0.5 shrink-0 text-gold" />
              Kampanye baru aktif setelah pembayaran benar-benar terkonfirmasi. Reward hanya dibayar dari views tervalidasi.
            </p>
          </div>
        </motion.aside>
      </motion.div>
    </AppShell>
  )
}
