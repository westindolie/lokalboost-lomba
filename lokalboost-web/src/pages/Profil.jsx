import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { GalatKolom, IsiFoto, PageHeader } from '../components/ui.jsx'
import { DaftarSosial, IkonSosial, PLATFORM_SOSIAL } from '../components/TautanSosial.jsx'
import { tekan } from '../motion.js'
import { api } from '../api.js'
import { useSesi } from '../sesi.jsx'
import { gradasi } from '../format.js'
import { KATEGORI, LOKASI } from '../data/pilihan.js'
import { cekTeks, galatPertama } from '../validasi.js'
import { ArrowRight, Check, Image, MapPin, Store, Video } from '../components/icons.jsx'

/**
 * Profil Saya: foto, nama, lokasi, dan akun media sosial.
 *
 * Satu halaman untuk UMKM dan kreator. Kreator mengisi niche dan bio di sini
 * agar dapat melengkapi syarat sebelum mengikuti kampanye.
 *
 * Akun sosial di sini hanya tautan. Pengikut dan views kreator tetap
 * diukur lewat Cek Profil di Portofolio, tidak pernah diketik.
 */

const SISI_FOTO = 512
const BATAS_FOTO_MB = 2

/**
 * Foto HP bisa 5-10 MB, sementara avatar cukup 512 px. Dipotong jadi persegi
 * di tengah dan dikecilkan di peramban, jadi unggahannya biasanya < 100 KB
 * dan tidak menabrak batas ukuran permintaan di Vercel.
 */
async function kecilkanFoto(berkas) {
  const bitmap = await createImageBitmap(berkas)
  const sisi = Math.min(bitmap.width, bitmap.height)
  const target = Math.min(SISI_FOTO, sisi)
  const kanvas = document.createElement('canvas')
  kanvas.width = target
  kanvas.height = target
  kanvas
    .getContext('2d')
    .drawImage(bitmap, (bitmap.width - sisi) / 2, (bitmap.height - sisi) / 2, sisi, sisi, 0, 0, target, target)
  bitmap.close?.()

  const keBlob = (jenis) => new Promise((r) => kanvas.toBlob(r, jenis, 0.86))
  // Safari lama tidak bisa menulis WebP dan diam-diam memberi PNG; JPEG aman di semua peramban.
  let blob = await keBlob('image/webp')
  let ext = 'webp'
  if (!blob || blob.type !== 'image/webp') {
    blob = await keBlob('image/jpeg')
    ext = 'jpg'
  }
  return new File([blob], `foto.${ext}`, { type: blob.type })
}

async function kecilkanFotoGaleri(berkas) {
  const bitmap = await createImageBitmap(berkas)
  const skala = Math.min(1, 1200 / bitmap.width, 1200 / bitmap.height)
  const kanvas = document.createElement('canvas')
  kanvas.width = Math.round(bitmap.width * skala)
  kanvas.height = Math.round(bitmap.height * skala)
  kanvas.getContext('2d').drawImage(bitmap, 0, 0, kanvas.width, kanvas.height)
  bitmap.close?.()
  const keBlob = (jenis) => new Promise((r) => kanvas.toBlob(r, jenis, 0.84))
  let blob = await keBlob('image/webp')
  let ext = 'webp'
  if (!blob || blob.type !== 'image/webp') {
    blob = await keBlob('image/jpeg')
    ext = 'jpg'
  }
  return new File([blob], `usaha.${ext}`, { type: blob.type })
}

function isianDari(pengguna) {
  const p = pengguna?.profil || {}
  const sosial = pengguna?.sosial || {}
  return {
    nama: pengguna?.nama || '',
    namaUsaha: p.nama_usaha || '',
    niche: p.niche || '',
    lokasi: p.lokasi || '',
    bio: p.bio || '',
    sosial: Object.fromEntries(PLATFORM_SOSIAL.map(({ id }) => [id, sosial[id] || ''])),
  }
}

export default function Profil() {
  const { pengguna, segarkan } = useSesi()
  const isUMKM = pengguna?.peran === 'umkm'

  const [isian, setIsian] = useState(() => isianDari(pengguna))
  const [galatIsian, setGalatIsian] = useState({})
  const [pesan, setPesan] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const [fotoSibuk, setFotoSibuk] = useState(false)
  const [galatFoto, setGalatFoto] = useState('')
  const pemilihFoto = useRef(null)
  const [fotoGaleri, setFotoGaleri] = useState([])
  const [batasFotoGaleri, setBatasFotoGaleri] = useState(6)
  const [galeriSibuk, setGaleriSibuk] = useState(false)
  const [galatGaleri, setGalatGaleri] = useState('')
  const pemilihGaleri = useRef(null)

  // Sesi bisa selesai dimuat setelah halaman terbuka (muat ulang langsung di /profil).
  const idPengguna = pengguna?.id
  useEffect(() => {
    if (idPengguna) setIsian(isianDari(pengguna))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPengguna])

  useEffect(() => {
    if (!isUMKM || !idPengguna) return
    let batal = false
    api.fotoGaleriUmkm()
      .then((hasil) => {
        if (!batal) {
          setFotoGaleri(hasil.foto || [])
          setBatasFotoGaleri(hasil.batas || 6)
        }
      })
      .catch((err) => { if (!batal) setGalatGaleri(err.message) })
    return () => { batal = true }
  }, [idPengguna, isUMKM])

  const foto = pengguna?.profil?.foto || null
  const lokasiPilihan = LOKASI.includes(isian.lokasi) || !isian.lokasi ? LOKASI : [isian.lokasi, ...LOKASI]

  const ubah = (bagian) => {
    setIsian((v) => ({ ...v, ...bagian }))
    setPesan('')
    setGalatIsian((g) => {
      const sisa = { ...g }
      for (const k of Object.keys(bagian)) delete sisa[k]
      return sisa
    })
  }
  const ubahSosial = (id, nilai) => {
    setIsian((v) => ({ ...v, sosial: { ...v.sosial, [id]: nilai } }))
    setPesan('')
    setGalat('')
  }

  const tanda = (k) => (galatIsian[k] ? { 'aria-invalid': true, 'aria-describedby': `galat-${k}` } : {})
  const kelas = (k) => `input${galatIsian[k] ? ' border-danger ring-1 ring-danger/30' : ''}`

  async function pilihFoto(e) {
    const berkas = e.target.files?.[0]
    e.target.value = '' // supaya memilih berkas yang sama dua kali tetap memicu unggah
    if (!berkas) return
    setGalatFoto('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(berkas.type)) {
      setGalatFoto('Pilih foto JPG, PNG, atau WebP.')
      return
    }
    setFotoSibuk(true)
    try {
      let kirim = berkas
      try {
        kirim = await kecilkanFoto(berkas)
      } catch {
        // Peramban tanpa createImageBitmap: kirim aslinya, server tetap membatasi ukurannya.
      }
      if (kirim.size > BATAS_FOTO_MB * 1024 * 1024) {
        throw new Error(`Ukuran foto maksimal ${BATAS_FOTO_MB} MB.`)
      }
      const fd = new FormData()
      fd.append('foto', kirim, kirim.name)
      await api.unggahFoto(fd)
      await segarkan()
    } catch (err) {
      setGalatFoto(err.message)
    } finally {
      setFotoSibuk(false)
    }
  }

  async function hapusFoto() {
    setGalatFoto('')
    setFotoSibuk(true)
    try {
      await api.hapusFoto()
      await segarkan()
    } catch (err) {
      setGalatFoto(err.message)
    } finally {
      setFotoSibuk(false)
    }
  }

  async function tambahFotoGaleri(e) {
    const berkasTerpilih = Array.from(e.target.files || [])
    e.target.value = ''
    if (!berkasTerpilih.length) return
    setGalatGaleri('')
    const sisa = batasFotoGaleri - fotoGaleri.length
    if (berkasTerpilih.length > sisa) {
      setGalatGaleri(`Pilih maksimal ${sisa} foto lagi. Galeri berisi paling banyak ${batasFotoGaleri} foto.`)
      return
    }
    setGaleriSibuk(true)
    try {
      for (const berkas of berkasTerpilih) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(berkas.type)) {
          throw new Error('Semua foto harus berupa JPG, PNG, atau WebP.')
        }
        let kirim = berkas
        try {
          kirim = await kecilkanFotoGaleri(berkas)
        } catch {
          // Peramban tanpa createImageBitmap: kirim berkas asli bila masih di bawah batas.
        }
        if (kirim.size > BATAS_FOTO_MB * 1024 * 1024) {
          throw new Error(`Setiap foto harus berukuran maksimal ${BATAS_FOTO_MB} MB.`)
        }
        const form = new FormData()
        form.append('foto', kirim, kirim.name)
        const hasil = await api.unggahFotoGaleriUmkm(form)
        setFotoGaleri(hasil.foto || [])
      }
    } catch (err) {
      setGalatGaleri(err.message)
    } finally {
      setGaleriSibuk(false)
    }
  }

  async function hapusFotoGaleri(id) {
    setGalatGaleri('')
    setGaleriSibuk(true)
    try {
      const hasil = await api.hapusFotoGaleriUmkm(id)
      setFotoGaleri(hasil.foto || [])
    } catch (err) {
      setGalatGaleri(err.message)
    } finally {
      setGaleriSibuk(false)
    }
  }

  async function simpan(e) {
    e.preventDefault()
    setPesan('')
    setGalat('')
    const g = {
      nama: cekTeks(isian.nama, isUMKM ? 'Nama pemilik' : 'Nama tampilan', { min: 2, maks: 60 }),
      lokasi: isian.lokasi ? '' : 'Pilih lokasi.',
      ...(isUMKM ? { namaUsaha: cekTeks(isian.namaUsaha, 'Nama toko / usaha', { min: 2, maks: 80 }) } : {}),
      ...(!isUMKM ? {
        niche: isian.niche ? '' : 'Pilih niche konten.',
        bio: cekTeks(isian.bio, 'Gaya konten', { min: 3, maks: 300 }),
      } : {}),
    }
    const ditolak = Object.fromEntries(Object.entries(g).filter(([, v]) => v))
    setGalatIsian(ditolak)
    if (Object.keys(ditolak).length) {
      setGalat(galatPertama(ditolak))
      return
    }

    setSibuk(true)
    try {
      const hasil = await api.simpanProfil({
        nama: isian.nama.trim(),
        lokasi: isian.lokasi,
        ...(isUMKM ? { namaUsaha: isian.namaUsaha.trim() } : {}),
        ...(!isUMKM ? { niche: isian.niche, bio: isian.bio.trim() } : {}),
        sosial: Object.fromEntries(PLATFORM_SOSIAL.map(({ id }) => [id, isian.sosial[id].trim()])),
      })
      await segarkan()
      // Server membakukan "@akun" jadi tautan lengkap; tampilkan bentuk yang tersimpan.
      setIsian(isianDari(hasil.pengguna))
      setPesan('Profil tersimpan.')
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  const sosialPratinjau = Object.fromEntries(
    Object.entries(pengguna?.sosial || {}).filter(([, v]) => v),
  )

  return (
    <AppShell>
      <motion.div variants={stagger} initial="initial" animate="animate">
        <PageHeader
          title="Profil Saya"
          subtitle={
            isUMKM
              ? 'Foto, nama toko, lokasi, dan akun media sosial usaha Anda. Kreator melihat ini saat membuka kampanye Anda.'
              : 'Foto, nama, lokasi, dan akun media sosialmu. UMKM melihat ini di halaman profil kreatormu.'
          }
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <motion.form variants={fadeUp} onSubmit={simpan} noValidate className="space-y-6 lg:col-span-2">
            {/* Foto */}
            <section className="card p-7">
              <h2 className="text-lg font-extrabold text-navy">Foto Profil</h2>
              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                <span
                  className={`relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br ${gradasi(
                    { id: pengguna?.id, gradasi: pengguna?.profil?.gradasi },
                  )} text-2xl font-extrabold text-white ring-4 ring-white shadow-card`}
                >
                  {!foto && (isUMKM ? <Store size={30} /> : <Video size={30} />)}
                  <IsiFoto src={foto} alt="Foto profil Anda" />
                  {fotoSibuk && <span className="absolute inset-0 grid place-items-center bg-navy/50 text-xs font-semibold">Memproses…</span>}
                </span>
                <div>
                  <div className="flex flex-wrap gap-2">
                    <motion.button
                      {...tekan}
                      type="button"
                      disabled={fotoSibuk}
                      onClick={() => pemilihFoto.current?.click()}
                      className="btn-primary px-4 py-2.5 text-sm disabled:opacity-60"
                    >
                      <Image size={16} /> {foto ? 'Ganti Foto' : 'Unggah Foto'}
                    </motion.button>
                    {foto && (
                      <motion.button
                        {...tekan}
                        type="button"
                        disabled={fotoSibuk}
                        onClick={hapusFoto}
                        className="btn-outline px-4 py-2.5 text-sm disabled:opacity-60"
                      >
                        Hapus
                      </motion.button>
                    )}
                  </div>
                  <p className="field-help">
                    {isUMKM ? 'Logo toko atau foto produk andalan. ' : 'Foto wajah yang jelas lebih dipercaya UMKM. '}
                    JPG, PNG, atau WebP. Foto otomatis dipotong persegi.
                  </p>
                  <input
                    ref={pemilihFoto}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={pilihFoto}
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Pilih foto profil"
                  />
                  {galatFoto && (
                    <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                      {galatFoto}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {isUMKM && (
              <section className="card p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold text-navy">Foto Usaha</h2>
                    <p className="mt-1.5 text-sm text-ink-soft">
                      Tampilkan makanan, tempat, atau produk. Kreator akan melihat foto ini saat mencari kampanye.
                    </p>
                  </div>
                  <span className="chip bg-cream-200 text-ink-soft">{fotoGaleri.length}/{batasFotoGaleri}</span>
                </div>
                {fotoGaleri.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {fotoGaleri.map((item) => (
                      <figure key={item.id} className="relative overflow-hidden rounded-xl border border-black/10">
                        <img src={item.foto} alt="Foto usaha" className="aspect-[4/3] w-full object-cover" />
                        <button
                          type="button"
                          disabled={galeriSibuk}
                          onClick={() => hapusFotoGaleri(item.id)}
                          className="w-full bg-white px-3 py-2 text-xs font-semibold text-danger disabled:opacity-60"
                          aria-label="Hapus foto usaha"
                        >
                          Hapus foto
                        </button>
                      </figure>
                    ))}
                  </div>
                )}
                <input
                  ref={pemilihGaleri}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={tambahFotoGaleri}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Pilih foto usaha"
                />
                <button
                  type="button"
                  disabled={galeriSibuk || fotoGaleri.length >= batasFotoGaleri}
                  onClick={() => pemilihGaleri.current?.click()}
                  className="btn-outline mt-4 px-4 py-2.5 text-sm disabled:opacity-60"
                >
                  <Image size={16} /> {galeriSibuk ? 'Menyimpan foto…' : 'Tambah Foto Usaha'}
                </button>
                <p className="field-help">Maksimal {batasFotoGaleri} foto. JPG, PNG, atau WebP.</p>
                {galatGaleri && (
                  <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    {galatGaleri}
                  </p>
                )}
              </section>
            )}

            {/* Identitas */}
            <section className="card p-7">
              <h2 className="text-lg font-extrabold text-navy">{isUMKM ? 'Identitas Usaha' : 'Identitas'}</h2>
              <div className="mt-5 space-y-5">
                <div>
                  <label className="label" htmlFor="nama">{isUMKM ? 'Nama Pemilik Usaha' : 'Nama Tampilan'}</label>
                  <input
                    id="nama"
                    autoComplete="name"
                    maxLength={60}
                    value={isian.nama}
                    onChange={(e) => ubah({ nama: e.target.value })}
                    className={kelas('nama')}
                    {...tanda('nama')}
                  />
                  <GalatKolom id="galat-nama" pesan={galatIsian.nama} />
                </div>

                {isUMKM && (
                  <div>
                    <label className="label" htmlFor="nama-usaha">Nama Toko / Usaha</label>
                    <input
                      id="nama-usaha"
                      maxLength={80}
                      value={isian.namaUsaha}
                      onChange={(e) => ubah({ namaUsaha: e.target.value })}
                      className={kelas('namaUsaha')}
                      {...tanda('namaUsaha')}
                    />
                    <GalatKolom id="galat-namaUsaha" pesan={galatIsian.namaUsaha} />
                  </div>
                )}

                {!isUMKM && (
                  <div>
                    <label className="label" htmlFor="niche">Niche Konten</label>
                    <select
                      id="niche"
                      value={isian.niche}
                      onChange={(e) => ubah({ niche: e.target.value })}
                      className={kelas('niche')}
                      {...tanda('niche')}
                    >
                      <option value="" disabled>Pilih niche konten...</option>
                      {KATEGORI.map((kategori) => <option key={kategori}>{kategori}</option>)}
                    </select>
                    <GalatKolom id="galat-niche" pesan={galatIsian.niche} />
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="lokasi">{isUMKM ? 'Lokasi Usaha' : 'Kota Domisili'}</label>
                  <select
                    id="lokasi"
                    value={isian.lokasi}
                    onChange={(e) => ubah({ lokasi: e.target.value })}
                    className={kelas('lokasi')}
                    {...tanda('lokasi')}
                  >
                    {!isian.lokasi && <option value="" disabled>Pilih lokasi...</option>}
                    {lokasiPilihan.map((l) => <option key={l}>{l}</option>)}
                  </select>
                  <GalatKolom id="galat-lokasi" pesan={galatIsian.lokasi} />
                </div>

                {!isUMKM && (
                  <div>
                    <label className="label" htmlFor="bio">Gaya Konten</label>
                    <textarea
                      id="bio"
                      rows={4}
                      maxLength={300}
                      value={isian.bio}
                      onChange={(e) => ubah({ bio: e.target.value })}
                      placeholder="Ceritakan jenis konten yang kamu buat dan gaya kreatifmu."
                      className={kelas('bio')}
                      {...tanda('bio')}
                    />
                    <p className="field-help">3-300 karakter. UMKM melihat deskripsi ini di profil publikmu.</p>
                    <GalatKolom id="galat-bio" pesan={galatIsian.bio} />
                  </div>
                )}
              </div>
            </section>

            {/* Media sosial */}
            <section className="card p-7">
              <h2 className="text-lg font-extrabold text-navy">Media Sosial</h2>
              <p className="mt-1.5 text-sm text-ink-soft">
                {isUMKM ? 'Opsional. ' : ''}Ketik nama akun (misalnya @namaakun) atau tempel tautan profil. Kosongkan
                kolom untuk menghapus akun itu.
              </p>
              <div className="mt-5 space-y-4">
                {PLATFORM_SOSIAL.map((p) => (
                  <div key={p.id}>
                    <label className="label" htmlFor={`sosial-${p.id}`}>{p.nama}</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted">
                        <IkonSosial platform={p.id} size={17} />
                      </span>
                      <input
                        id={`sosial-${p.id}`}
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={isian.sosial[p.id]}
                        onChange={(e) => ubahSosial(p.id, e.target.value)}
                        placeholder={p.contoh}
                        className="input pl-10"
                      />
                    </div>
                  </div>
                ))}
              </div>
              {!isUMKM && (
                <p className="mt-5 rounded-xl bg-cream-200 px-4 py-3 text-sm text-ink-soft">
                  Jumlah pengikut dan views tidak diisi di sini. Angkanya diukur dari akunmu lewat{' '}
                  <Link to="/kreator/portofolio" className="font-semibold text-navy underline">Cek Profil</Link>.
                </p>
              )}
            </section>

            {galat && (
              <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{galat}</p>
            )}
            {pesan && (
              <p className="flex items-center gap-2 rounded-lg bg-success-soft px-4 py-3 text-sm text-success">
                <Check size={16} /> {pesan}
              </p>
            )}

            <motion.button {...tekan} type="submit" disabled={sibuk} className="btn-primary w-full py-3 sm:w-auto sm:px-8 disabled:opacity-60">
              {sibuk ? 'Menyimpan…' : <>Simpan Profil <ArrowRight size={18} /></>}
            </motion.button>
          </motion.form>

          {/* Pratinjau dari data yang SUDAH tersimpan, bukan isian yang sedang diketik. */}
          <motion.aside variants={fadeUp} className="card h-fit p-7 lg:sticky lg:top-24">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {isUMKM ? 'Dilihat kreator' : 'Dilihat UMKM'}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span
                className={`relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br ${gradasi(
                  { id: pengguna?.id, gradasi: pengguna?.profil?.gradasi },
                )} text-white`}
              >
                {!foto && (isUMKM ? <Store size={20} /> : <Video size={20} />)}
                <IsiFoto src={foto} alt="" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-navy">
                  {isUMKM ? pengguna?.profil?.nama_usaha || pengguna?.nama : pengguna?.nama}
                </p>
                {isUMKM && <p className="truncate text-xs text-ink-muted">oleh {pengguna?.nama}</p>}
                <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                  <MapPin size={12} /> {pengguna?.profil?.lokasi || 'Lokasi belum diisi'}
                </p>
              </div>
            </div>
            <DaftarSosial sosial={sosialPratinjau} className="mt-4" />
            {!Object.keys(sosialPratinjau).length && (
              <p className="mt-4 text-xs text-ink-muted">Belum ada akun media sosial.</p>
            )}
            {!isUMKM && pengguna?.id && (
              <Link to={`/kreator/profil/${pengguna.id}`} className="mt-5 inline-flex text-sm font-semibold text-navy hover:underline">
                Buka profil publik →
              </Link>
            )}
          </motion.aside>
        </div>
      </motion.div>
    </AppShell>
  )
}
