import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import Ambient from '../components/Ambient.jsx'
import { OnboardingStepper } from './Register.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { Goyang } from '../components/Feedback.jsx'
import { GalatKolom } from '../components/ui.jsx'
import { tekan } from '../motion.js'
import { KATEGORI, LOKASI, LOKASI_BAWAAN } from '../data/pilihan.js'
import { api } from '../api.js'
import { Shield, Store, Video, ArrowRight, Check } from '../components/icons.jsx'
import { cekEmail, cekTautanProfil, cekTelepon, cekTeks, galatPertama, rapikanTelepon } from '../validasi.js'

/**
 * Langkah 2 pendaftaran: akun + profil.
 *
 * Akun dibuat di sini (POST /api/auth/daftar) supaya kode OTP langsung
 * terbit, tapi data profil BELUM dikirim — menyimpannya butuh token, dan
 * token baru ada setelah OTP diverifikasi di langkah 3. Karena itu isian
 * profil dititipkan ke langkah berikutnya lewat state navigasi.
 *
 * Seluruh field di halaman ini benar-benar tersimpan di backend. Dua zona
 * unggah berkas yang dulu ada di sini dihapus: berkasnya tidak pernah
 * dikirim ke mana pun, dan formulir yang diam-diam membuang isian adalah
 * cacat kepercayaan yang sama seperti tombol filter yang tidak menyaring.
 */
export default function LengkapiProfil() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  // `?peran=` masih dipakai DI SINI karena sesi memang belum ada: pengguna
  // sedang membawa pilihan dari langkah 1 ke langkah 2.
  const peran = params.get('peran') === 'kreator' ? 'kreator' : 'umkm'
  const isUMKM = peran === 'umkm'

  const [isian, setIsian] = useState({
    nama: '',
    email: '',
    telepon: '',
    kataSandi: '',
    namaUsaha: '',
    kategori: '',
    lokasi: LOKASI_BAWAAN,
    targetAudiens: '',
    deskripsi: '',
    niche: '',
    portofolioUrl: '',
    bio: '',
  })
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [protes, setProtes] = useState(0)
  const [galatIsian, setGalatIsian] = useState({})

  const ubah = (bagian) => {
    setIsian((v) => ({ ...v, ...bagian }))
    // Teguran hilang begitu kolomnya disunting, tidak menunggu kirim ulang.
    setGalatIsian((g) => {
      const sisa = { ...g }
      for (const k of Object.keys(bagian)) delete sisa[k]
      return sisa
    })
  }

  /** Atribut aksesibilitas + warna merah untuk kolom yang ditolak. */
  const tanda = (k) =>
    galatIsian[k] ? { 'aria-invalid': true, 'aria-describedby': `galat-${k}` } : {}
  const kelas = (k) => `input${galatIsian[k] ? ' border-danger ring-1 ring-danger/30' : ''}`

  function periksa() {
    const g = {
      nama: cekTeks(isian.nama, isUMKM ? 'Nama pemilik' : 'Nama tampilan', { min: 2, maks: 60 }),
      email: cekEmail(isian.email),
      telepon: cekTelepon(isian.telepon),
      kataSandi: isian.kataSandi.length < 6 ? 'Kata sandi minimal 6 karakter.' : '',
      lokasi: LOKASI.includes(isian.lokasi) ? '' : 'Pilih lokasi dari daftar.',
    }
    if (isUMKM) {
      g.namaUsaha = cekTeks(isian.namaUsaha, 'Nama toko / usaha', { min: 2, maks: 80 })
      g.kategori = isian.kategori ? '' : 'Pilih kategori produk.'
      g.targetAudiens = cekTeks(isian.targetAudiens, 'Target pembeli', { min: 3, maks: 200, wajib: false })
      g.deskripsi = cekTeks(isian.deskripsi, 'Produk unggulan', { min: 10, maks: 1000, wajib: false })
    } else {
      g.niche = isian.niche ? '' : 'Pilih niche konten.'
      g.portofolioUrl = cekTautanProfil(isian.portofolioUrl, { wajib: true })
      g.bio = cekTeks(isian.bio, 'Gaya konten', { min: 3, maks: 300, wajib: false })
    }
    return Object.fromEntries(Object.entries(g).filter(([, v]) => v))
  }

  const lanjut = async (e) => {
    e.preventDefault()
    setGalat('')

    const ditolak = periksa()
    setGalatIsian(ditolak)
    if (Object.keys(ditolak).length) {
      setGalat(galatPertama(ditolak))
      setProtes((n) => n + 1)
      // Bawa pengguna ke kolom pertama yang salah, terutama penting di HP.
      // Ditunda satu frame: atribut aria-invalid baru terpasang setelah render.
      requestAnimationFrame(() => document.querySelector('form [aria-invalid="true"]')?.focus())
      return
    }

    setSibuk(true)
    try {
      const hasil = await api.daftar({
        peran,
        nama: isian.nama.trim(),
        email: isian.email.trim().toLowerCase() || undefined,
        telepon: isian.telepon.trim() ? rapikanTelepon(isian.telepon) : undefined,
        kataSandi: isian.kataSandi,
      })

      const profil = isUMKM
        ? {
            namaUsaha: isian.namaUsaha.trim(),
            kategori: isian.kategori,
            lokasi: isian.lokasi.trim(),
            targetAudiens: isian.targetAudiens.trim() || null,
            deskripsi: isian.deskripsi.trim() || null,
          }
        : {
            niche: isian.niche,
            lokasi: isian.lokasi.trim(),
            portofolioUrl: isian.portofolioUrl.trim() || null,
            bio: isian.bio.trim() || null,
          }

      navigate(`/daftar/verifikasi?peran=${peran}`, {
        state: { identitas: hasil.identitas, kodeOtp: hasil.kodeOtp || null, profil },
      })
    } catch (err) {
      setGalat(err.message)
      setProtes((n) => n + 1)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <AppShell variant="auth" flush>
      <div className="relative overflow-hidden">
        <Ambient varian="gold" />

        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="shell relative py-14"
        >
          <motion.div variants={fadeUp} className="mx-auto max-w-2xl text-center">
            <h1 className="page-title">
              {isUMKM ? 'Ceritakan Tentang Usaha Anda' : 'Ceritakan Tentang Konten Anda'}
            </h1>
            <p className="mt-2 text-ink-soft">
              {isUMKM
                ? 'Data ini membantu AI mencarikan kreator yang paling cocok dengan produk Anda.'
                : 'Data ini membantu AI merekomendasikan kampanye yang sesuai gaya kontenmu.'}
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-8">
            <OnboardingStepper current={2} />
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mx-auto mt-8 flex max-w-2xl items-center gap-3 rounded-xl border border-gold-border bg-gold px-5 py-3"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-white">
              {isUMKM ? <Store size={18} /> : <Video size={18} />}
            </span>
            <div>
              <p className="text-sm font-semibold text-navy">
                Anda mendaftar sebagai {isUMKM ? 'UMKM' : 'Kreator'}
              </p>
              <Link to="/daftar" className="text-xs text-gold-text underline">Ganti peran</Link>
            </div>
          </motion.div>

          <motion.form variants={fadeUp} onSubmit={lanjut} noValidate className="card mx-auto mt-6 max-w-2xl p-7">
            <Goyang kunci={protes}>
              {/* Akun */}
              <div className="space-y-5">
                <div>
                  <label className="label" htmlFor="nama">
                    {isUMKM ? 'Nama Pemilik Usaha' : 'Nama Tampilan'}
                  </label>
                  <input
                    id="nama"
                    required
                    autoComplete="name"
                    value={isian.nama}
                    onChange={(e) => ubah({ nama: e.target.value })}
                    placeholder={isUMKM ? 'Contoh: Sari Handayani' : 'Contoh: Rafi Pratama'}
                    className={kelas('nama')}
                    {...tanda('nama')}
                  />
                  <GalatKolom id="galat-nama" pesan={galatIsian.nama} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="email">Alamat Email</label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      value={isian.email}
                      onChange={(e) => ubah({ email: e.target.value })}
                      placeholder="nama@email.com"
                      className={kelas('email')}
                      {...tanda('email')}
                    />
                    <GalatKolom id="galat-email" pesan={galatIsian.email} />
                  </div>
                  <div>
                    <label className="label" htmlFor="telepon">
                      Nomor HP <span className="font-normal text-ink-muted">(opsional)</span>
                    </label>
                    <input
                      id="telepon"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={18}
                      value={isian.telepon}
                      // Hanya angka, spasi, +, dan tanda hubung yang boleh diketik.
                      onChange={(e) => ubah({ telepon: e.target.value.replace(/[^\d+\s-]/g, '') })}
                      placeholder="0812 3456 7890"
                      className={kelas('telepon')}
                      {...tanda('telepon')}
                    />
                    <GalatKolom id="galat-telepon" pesan={galatIsian.telepon} />
                  </div>
                </div>
                {/* Nomor HP tidak lagi bisa menggantikan email: kode verifikasi
                    hanya dikirim lewat surel, dan akun tanpa email tidak akan
                    pernah bisa diverifikasi — artinya tidak akan pernah bisa
                    masuk. Nomor tetap diminta sebagai kontak untuk UMKM. */}
                <p className="field-help -mt-3">
                  Kode verifikasi dikirim ke email Anda. Nomor HP hanya dipakai sebagai kontak.
                </p>

                <div>
                  <label className="label" htmlFor="kata-sandi">Kata Sandi</label>
                  <input
                    id="kata-sandi"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={isian.kataSandi}
                    onChange={(e) => ubah({ kataSandi: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className={kelas('kataSandi')}
                    {...tanda('kataSandi')}
                  />
                  <GalatKolom id="galat-kataSandi" pesan={galatIsian.kataSandi} />
                </div>
              </div>

              {/* Profil */}
              <div className="mt-6 space-y-5 border-t border-black/5 pt-6">
                {isUMKM ? (
                  <>
                    <div>
                      <label className="label" htmlFor="nama-toko">Nama Toko / Usaha</label>
                      <input
                        id="nama-toko"
                        required
                        value={isian.namaUsaha}
                        onChange={(e) => ubah({ namaUsaha: e.target.value })}
                        placeholder="Contoh: Mie Aceh Bang Joni"
                        className={kelas('namaUsaha')}
                        {...tanda('namaUsaha')}
                      />
                      <GalatKolom id="galat-namaUsaha" pesan={galatIsian.namaUsaha} />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="kategori-produk">Kategori Produk</label>
                        <select
                          id="kategori-produk"
                          required
                          className={kelas('kategori')}
                          {...tanda('kategori')}
                          value={isian.kategori}
                          onChange={(e) => ubah({ kategori: e.target.value })}
                        >
                          <option value="" disabled>Pilih kategori...</option>
                          {KATEGORI.map((k) => <option key={k}>{k}</option>)}
                        </select>
                        <GalatKolom id="galat-kategori" pesan={galatIsian.kategori} />
                      </div>
                      <div>
                        <label className="label" htmlFor="kota">Kota / Lokasi Usaha</label>
                        <select
                          id="kota"
                          required
                          className={kelas('lokasi')}
                          {...tanda('lokasi')}
                          value={isian.lokasi}
                          onChange={(e) => ubah({ lokasi: e.target.value })}
                        >
                          {LOKASI.map((l) => <option key={l}>{l}</option>)}
                        </select>
                        <GalatKolom id="galat-lokasi" pesan={galatIsian.lokasi} />
                      </div>
                    </div>

                    <div>
                      <label className="label" htmlFor="target-audiens">Target Pembeli</label>
                      <input
                        id="target-audiens"
                        value={isian.targetAudiens}
                        onChange={(e) => ubah({ targetAudiens: e.target.value })}
                        placeholder="Contoh: mahasiswa & pekerja kantoran di Banda Aceh"
                        className={kelas('targetAudiens')}
                        {...tanda('targetAudiens')}
                      />
                      <GalatKolom id="galat-targetAudiens" pesan={galatIsian.targetAudiens} />
                      <p className="field-help">Dipakai sistem rekomendasi kreator untuk mencocokkan audiens kreator.</p>
                    </div>

                    <div>
                      <label className="label" htmlFor="deskripsi-usaha">Ceritakan Produk Unggulan Anda</label>
                      <textarea
                        id="deskripsi-usaha"
                        rows={3}
                        value={isian.deskripsi}
                        onChange={(e) => ubah({ deskripsi: e.target.value })}
                        placeholder="Apa yang membuat produk Anda berbeda? Tulis dengan bahasa sehari-hari."
                        className={`${kelas('deskripsi')} resize-none`}
                        {...tanda('deskripsi')}
                      />
                      <GalatKolom id="galat-deskripsi" pesan={galatIsian.deskripsi} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="niche">Niche Konten</label>
                        <select
                          id="niche"
                          required
                          className={kelas('niche')}
                          {...tanda('niche')}
                          value={isian.niche}
                          onChange={(e) => ubah({ niche: e.target.value })}
                        >
                          <option value="" disabled>Pilih niche...</option>
                          {KATEGORI.map((k) => <option key={k}>{k}</option>)}
                        </select>
                        <GalatKolom id="galat-niche" pesan={galatIsian.niche} />
                      </div>
                      <div>
                        <label className="label" htmlFor="kota-kreator">Kota Domisili</label>
                        <select
                          id="kota-kreator"
                          required
                          className={kelas('lokasi')}
                          {...tanda('lokasi')}
                          value={isian.lokasi}
                          onChange={(e) => ubah({ lokasi: e.target.value })}
                        >
                          {LOKASI.map((l) => <option key={l}>{l}</option>)}
                        </select>
                        <GalatKolom id="galat-lokasi" pesan={galatIsian.lokasi} />
                      </div>
                    </div>

                    <div>
                      <label className="label" htmlFor="portofolio">Tautan Profil TikTok / Instagram / YouTube</label>
                      <input
                        id="portofolio"
                        type="url"
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        required
                        value={isian.portofolioUrl}
                        onChange={(e) => ubah({ portofolioUrl: e.target.value })}
                        placeholder="https://www.tiktok.com/@namaanda"
                        className={kelas('portofolioUrl')}
                        {...tanda('portofolioUrl')}
                      />
                      <GalatKolom id="galat-portofolioUrl" pesan={galatIsian.portofolioUrl} />
                      <p className="field-help">
                        Tautan profil (bukan tautan video), misalnya tiktok.com/@akun, instagram.com/akun, atau
                        youtube.com/@channel. Pengikut dan views Anda diukur otomatis dari tautan ini, bukan diisi manual.
                      </p>
                    </div>

                    <div>
                      <label className="label" htmlFor="bio">Gaya Konten Anda</label>
                      <textarea
                        id="bio"
                        rows={3}
                        value={isian.bio}
                        onChange={(e) => ubah({ bio: e.target.value })}
                        placeholder="Contoh: Mahasiswa yang doyan berburu jajanan kaki lima."
                        className={`${kelas('bio')} resize-none`}
                        {...tanda('bio')}
                      />
                      <GalatKolom id="galat-bio" pesan={galatIsian.bio} />
                    </div>
                  </>
                )}
              </div>
            </Goyang>

            {galat && (
              <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
                {galat}
              </p>
            )}

            <div className="mt-6 flex items-start gap-3 rounded-xl bg-cream-200 px-4 py-3.5">
              <Check size={18} className="mt-0.5 shrink-0 text-success" />
              <p className="text-sm text-ink-soft">
                Langkah berikutnya kami kirim kode OTP untuk memverifikasi akun Anda. Verifikasi
                tingkat lanjut (NIB untuk UMKM) bisa dilakukan nanti lewat tim kami.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-black/5 pt-6 sm:flex-row">
              <motion.div {...tekan} className="flex-1">
                <Link to="/daftar" className="btn-outline w-full py-3">← Kembali</Link>
              </motion.div>
              <motion.button
                {...tekan}
                type="submit"
                disabled={sibuk}
                className="btn-primary flex-[2] py-3 disabled:opacity-60"
              >
                {sibuk ? 'Membuat akun…' : <>Lanjut ke Verifikasi <ArrowRight size={18} /></>}
              </motion.button>
            </div>
          </motion.form>

          <motion.p variants={fadeUp} className="mt-5 flex items-center justify-center gap-2 text-sm text-ink-soft">
            <Shield size={15} /> Data Anda dilindungi sesuai UU Perlindungan Data Pribadi.
          </motion.p>
        </motion.div>
      </div>
    </AppShell>
  )
}
