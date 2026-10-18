import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { KepalaWizard } from '../components/CampaignStepper.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { Tekan, TipAsisten, GalatKolom } from '../components/ui.jsx'
import { EASE } from '../motion.js'
import { KATEGORI, LOKASI } from '../data/pilihan.js'
import { cekTeks, galatPertama } from '../validasi.js'
import { useDraf } from '../draf.jsx'
import { Sparkles, ArrowRight, Image, Check } from '../components/icons.jsx'
import ReferensiKonten from '../components/ReferensiKonten.jsx'
import GerbangBiayaPasang from '../components/GerbangBiayaPasang.jsx'
import PemeriksaanEtika from '../components/PemeriksaanEtika.jsx'
import { MemuatBlok } from '../components/Muat.jsx'
import { api, useApi } from '../api.js'
import { rupiah } from '../format.js'

const BATAS_FOTO_KAMPANYE = 2 * 1024 * 1024

async function dataUrlFotoProduk(berkas) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(berkas.type)) {
    throw new Error('Foto produk harus berupa JPG, PNG, atau WebP.')
  }
  let gambar = berkas
  try {
    const bitmap = await createImageBitmap(berkas)
    const skala = Math.min(1, 1200 / bitmap.width, 1200 / bitmap.height)
    const kanvas = document.createElement('canvas')
    kanvas.width = Math.round(bitmap.width * skala)
    kanvas.height = Math.round(bitmap.height * skala)
    kanvas.getContext('2d').drawImage(bitmap, 0, 0, kanvas.width, kanvas.height)
    bitmap.close?.()
    const keBlob = (jenis) => new Promise((r) => kanvas.toBlob(r, jenis, 0.84))
    gambar = await keBlob('image/webp')
    if (!gambar || gambar.type !== 'image/webp') gambar = await keBlob('image/jpeg')
  } catch {
    // Browser tanpa createImageBitmap tetap boleh mengunggah foto kecil.
  }
  if (!gambar || gambar.size > BATAS_FOTO_KAMPANYE) {
    throw new Error('Foto produk harus berukuran maksimal 2 MB setelah diproses.')
  }
  return new Promise((resolve, reject) => {
    const pembaca = new FileReader()
    pembaca.onload = () => resolve(pembaca.result)
    pembaca.onerror = () => reject(new Error('Foto produk tidak bisa dibaca.'))
    pembaca.readAsDataURL(gambar)
  })
}

export default function BuatKampanye() {
  const { draf, ubah: ubahDraf } = useDraf()
  const navigate = useNavigate()
  const [galat, setGalat] = useState('')
  const [galatIsian, setGalatIsian] = useState({})
  const [fotoSibuk, setFotoSibuk] = useState(false)
  const [galatFoto, setGalatFoto] = useState('')
  const pemilihFoto = useRef(null)
  const [memeriksa, setMemeriksa] = useState(false)
  const [moderasi, setModerasi] = useState(null)

  // Biaya pasang dibayar sebelum formulir terbuka. Kampanye yang sudah
  // tersimpan (kembali dari langkah 3 untuk menyunting) tidak ditagih lagi.
  const biaya = useApi(() => api.statusBiayaPasang(), [])
  const { data: konfigBayar } = useApi(() => api.konfigurasiPembayaran(), [])
  const sedangSunting = Boolean(draf.kampanyeIdDibuat)
  const perluBayar = Boolean(biaya.data?.aktif && !biaya.data.sudahBayar && !sedangSunting)

  async function pilihFotoProduk(e) {
    const berkas = e.target.files?.[0]
    e.target.value = ''
    if (!berkas) return
    setGalatFoto('')
    setFotoSibuk(true)
    try {
      ubahDraf({ gambarProduk: await dataUrlFotoProduk(berkas) })
    } catch (err) {
      setGalatFoto(err.message)
    } finally {
      setFotoSibuk(false)
    }
  }

  const ubah = (bagian) => {
    ubahDraf(bagian)
    setGalatIsian((g) => {
      const sisa = { ...g }
      for (const k of Object.keys(bagian)) delete sisa[k]
      return sisa
    })
  }
  const tanda = (k) => (galatIsian[k] ? { 'aria-invalid': true, 'aria-describedby': `galat-${k}` } : {})
  const kelas = (k) => `input${galatIsian[k] ? ' border-danger ring-1 ring-danger/30' : ''}`

  // Divalidasi di sini supaya pengguna tidak sampai ke halaman pembayaran
  // dengan kampanye yang pasti ditolak API. Aturannya sama dengan
  // rapikanIsianKampanye() di routes/kampanye.js.
  const lanjut = async () => {
    const poin = draf.brief.split('\n').map((p) => p.trim()).filter(Boolean)
    const g = {
      nama: cekTeks(draf.nama, 'Nama produk', { min: 3, maks: 80 }),
      kategori: draf.kategori ? '' : 'Pilih kategori produk.',
      lokasi: LOKASI.includes(draf.lokasi) ? '' : 'Pilih lokasi usaha dari daftar.',
      deskripsi: cekTeks(draf.deskripsi, 'Cerita produk', { min: 10, maks: 1000 }),
      brief: !poin.length
        ? 'Tulis minimal satu poin yang wajib muncul di video.'
        : poin.length > 10
          ? 'Maksimal 10 poin.'
          : poin.some((p) => p.length > 200)
            ? 'Setiap poin maksimal 200 karakter.'
            : '',
    }
    const ditolak = Object.fromEntries(Object.entries(g).filter(([, v]) => v))
    setGalatIsian(ditolak)
    if (Object.keys(ditolak).length) {
      setGalat(galatPertama(ditolak))
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus())
      return
    }
    setGalat('')

    // Pemeriksaan etika AI saat isi kampanye ditulis, bukan baru saat bayar:
    // isi yang menjelekkan usaha lain berhenti di sini dan tidak pernah
    // sampai ke langkah Midtrans. Gerbang di langkah bayar tetap jadi lapis kedua.
    setMemeriksa(true)
    setModerasi(null)
    try {
      const { moderasi: hasil } = await api.periksaIsiKampanye({
        nama: draf.nama,
        deskripsi: draf.deskripsi || undefined,
        brief: poin,
        referensi: (draf.referensi || []).map(({ judul, penulis }) => ({ judul, penulis })),
      })
      if (hasil.status === 'ditolak') {
        setModerasi(hasil)
        requestAnimationFrame(() => document.getElementById('hasil-etika')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
        return
      }
    } catch (err) {
      // Pemeriksa tak terjangkau: jangan mengunci UMKM. Langkah bayar memeriksa ulang.
      if (err.rincian?.moderasi) {
        setModerasi(err.rincian.moderasi)
        return
      }
    } finally {
      setMemeriksa(false)
    }
    navigate('/umkm/kampanye/target')
  }

  return (
    <AppShell>
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="mx-auto max-w-2xl"
      >
        <KepalaWizard
          langkah={1}
          judul="Buat Kampanye Baru"
          sub={
            perluBayar
              ? `Bayar biaya pasang ${rupiah(biaya.data.biaya)} untuk membuka formulir kampanye.`
              : 'Mari promosikan produk Anda ke jangkauan yang lebih luas dengan bantuan kreator lokal.'
          }
        />

        {biaya.memuat && !sedangSunting ? (
          <MemuatBlok tinggi="h-48" jumlah={2} />
        ) : perluBayar ? (
          <GerbangBiayaPasang status={biaya.data} konfigurasi={konfigBayar} onLunas={biaya.muatUlang} />
        ) : (
        <>
        {biaya.data?.aktif && biaya.data.tiket && !sedangSunting && (
          <motion.p
            variants={fadeUp}
            role="status"
            className="mb-4 flex items-center gap-2 rounded-xl border border-success-border bg-success-soft px-4 py-3 text-sm font-semibold text-success"
          >
            <Check size={16} /> Biaya pasang {rupiah(biaya.data.biaya)} lunas. Berlaku untuk satu kampanye ini.
          </motion.p>
        )}

        <motion.div variants={fadeUp} className="card p-7">
          <div className="flex items-start gap-3 rounded-xl bg-cream-200 px-4 py-3.5 text-sm text-ink-soft">
            <motion.span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-navy text-white"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: EASE.ambient }}
            >
              <Sparkles size={16} />
            </motion.span>
            <p>Halo! Mari kita mulai dengan mengenalkan produk unggulan Anda kepada para kreator.</p>
          </div>


          <div className="mt-6 space-y-5">
            <div>
              <label className="label" htmlFor="nama-produk">Nama Produk</label>
              <input
                id="nama-produk"
                type="text"
                value={draf.nama}
                onChange={(e) => ubah({ nama: e.target.value })}
                placeholder="Contoh: Mie Aceh Kepiting Bang Joni"
                maxLength={80}
                className={kelas('nama')}
                {...tanda('nama')}
              />
              <GalatKolom id="galat-nama" pesan={galatIsian.nama} />
            </div>

            <div>
              <label className="label" htmlFor="kategori">Kategori</label>
              <select
                id="kategori"
                className={kelas('kategori')}
                {...tanda('kategori')}
                value={draf.kategori}
                onChange={(e) => ubah({ kategori: e.target.value })}
              >
                <option value="" disabled>Pilih kategori yang sesuai...</option>
                {KATEGORI.map((k) => <option key={k}>{k}</option>)}
              </select>
              <GalatKolom id="galat-kategori" pesan={galatIsian.kategori} />
              <p className="field-help">Kategori membantu AI mencarikan kreator yang tepat.</p>
            </div>

            <div>
              <label className="label" htmlFor="lokasi">Lokasi Usaha</label>
              <select
                id="lokasi"
                className={kelas('lokasi')}
                {...tanda('lokasi')}
                value={draf.lokasi}
                onChange={(e) => ubah({ lokasi: e.target.value })}
              >
                {!LOKASI.includes(draf.lokasi) && <option value="" disabled>Pilih lokasi...</option>}
                {LOKASI.map((l) => <option key={l}>{l}</option>)}
              </select>
              <GalatKolom id="galat-lokasi" pesan={galatIsian.lokasi} />
            </div>

            <div>
              <label className="label" htmlFor="deskripsi">Ceritakan tentang produk Anda</label>
              <textarea
                id="deskripsi"
                rows={4}
                value={draf.deskripsi}
                onChange={(e) => ubah({ deskripsi: e.target.value })}
                placeholder="Ceritakan apa yang membuat produk Anda spesial dengan bahasa yang sederhana..."
                maxLength={1000}
                className={`${kelas('deskripsi')} resize-none`}
                {...tanda('deskripsi')}
              />
              <GalatKolom id="galat-deskripsi" pesan={galatIsian.deskripsi} />
            </div>

            <div>
              <label className="label">Foto Produk Utama</label>
              <p className="field-help mt-0">Foto ini tampil di pencarian kampanye dan halaman detail. Opsional.</p>
              {draf.gambarProduk ? (
                <div className="mt-3 flex items-center gap-4 rounded-xl border border-black/10 p-3">
                  <img src={draf.gambarProduk} alt="Pratinjau foto produk" className="h-20 w-28 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => { ubahDraf({ gambarProduk: '' }); setGalatFoto('') }}
                    className="text-sm font-semibold text-danger hover:underline"
                  >
                    Hapus foto
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={pemilihFoto}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={pilihFotoProduk}
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Pilih foto produk utama"
                  />
                  <button
                    type="button"
                    disabled={fotoSibuk}
                    onClick={() => pemilihFoto.current?.click()}
                    className="btn-outline mt-3 px-4 py-2.5 text-sm disabled:opacity-60"
                  >
                    <Image size={16} /> {fotoSibuk ? 'Memproses foto…' : 'Unggah Foto Produk'}
                  </button>
                </>
              )}
              {galatFoto && <p role="alert" className="mt-2 text-sm text-danger">{galatFoto}</p>}
            </div>

            <ReferensiKonten draf={draf} ubah={ubah} />

            {/* Brief inilah bahan mentah AI Script Generator (PRD §8.2) —
                tanpa ini, naskah yang dibuat kreator hanya bisa menebak. */}
            <div>
              <label className="label" htmlFor="brief">Poin yang Wajib Muncul di Video</label>
              <textarea
                id="brief"
                rows={draf.brief.split('\n').length > 4 ? 8 : 4}
                value={draf.brief}
                onChange={(e) => ubah({ brief: e.target.value })}
                placeholder={'Satu poin per baris. Contoh:\nTunjukkan momen kuah panas dituang.\nSebutkan varian pedas level 5.\nCantumkan lokasi warung.'}
                className={`${kelas('brief')} resize-none`}
                {...tanda('brief')}
              />
              <GalatKolom id="galat-brief" pesan={galatIsian.brief} />
              <p className="field-help">
                Poin-poin ini dipakai kreator dan Asisten Naskah AI saat menyusun videonya.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Tekan className="flex-1">
            <Link to="/umkm" className="btn-outline w-full py-3.5">← Batal</Link>
          </Tekan>
          <Tekan className="flex-[2]">
            <button
              type="button"
              onClick={lanjut}
              disabled={memeriksa}
              className="btn-primary w-full py-3.5 disabled:opacity-60"
            >
              {memeriksa ? 'AI memeriksa isi kampanye…' : <>Lanjut ke Target &amp; Anggaran <ArrowRight size={18} /></>}
            </button>
          </Tekan>
        </motion.div>

        {moderasi && (
          <div id="hasil-etika" className="mt-4">
            <PemeriksaanEtika moderasi={moderasi} kampanyeId={null} tautanUbah="#nama-produk" />
          </div>
        )}

        {galat && (
          <motion.p
            variants={fadeUp}
            role="alert"
            className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {galat}
          </motion.p>
        )}
        </>
        )}

        <motion.div variants={fadeUp} className="mt-6">
          <TipAsisten>
            “Untuk produk makanan seperti sambal, kami menyarankan target minimal 500 views
            untuk melihat dampak nyata pada penjualan Anda. Fokuskan deskripsi pada rasa pedas
            yang otentik!”
          </TipAsisten>
        </motion.div>
      </motion.div>
    </AppShell>
  )
}
