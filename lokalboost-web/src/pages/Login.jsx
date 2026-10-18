import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import Ambient from '../components/Ambient.jsx'
import { AngkaNaik, Goyang } from '../components/Feedback.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { tekan, EASE, DUR } from '../motion.js'
import { useSesi } from '../sesi.jsx'
import { api, useApi } from '../api.js'
import { Shield, ArrowRight, Store, Video, Sparkles } from '../components/icons.jsx'

/**
 * Halaman Masuk.
 *
 * Dua jalan yang sama-sama nyata di backend:
 *   - kata sandi  → POST /api/auth/masuk
 *   - kode OTP    → POST /api/auth/otp/kirim lalu /api/auth/otp/verifikasi
 *
 * Pemilih peran yang dulu ada di sini sudah dihapus: peran melekat pada akun,
 * bukan pada tombol yang ditekan saat masuk. Tempatnya diisi akun demo,
 * karena prototype ini dinilai orang yang tidak punya akun di sini.
 */

/**
 * Akun contoh untuk penilai yang tidak punya akun di sini.
 *
 * Akun admin sengaja TIDAK ada di daftar ini. Kredensial di halaman ini ikut
 * masuk ke bundel yang tayang publik, dan ruang admin bisa memutus sengketa,
 * memoderasi konten, serta membaca seluruh buku transaksi platform — itu
 * bukan sesuatu yang boleh dibuka satu klik oleh siapa pun yang lewat.
 * Ruang admin diperagakan langsung lewat login biasa saat presentasi.
 */
const AKUN_DEMO = [
  { peran: 'umkm', label: 'UMKM', icon: Store, identitas: 'busari@warungsunda.id', nama: 'Bu Sari' },
  { peran: 'kreator', label: 'Kreator', icon: Video, identitas: 'rafi@kreator.id', nama: 'Rafi' },
]
const SANDI_DEMO = 'lokalboost123'
const PANJANG_OTP = 6

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { masuk, terapkanSesi } = useSesi()

  const lanjut = params.get('lanjut')

  const [identitas, setIdentitas] = useState('')
  const [kataSandi, setKataSandi] = useState('')
  const [tahap, setTahap] = useState('identitas') // identitas -> otp
  const [kode, setKode] = useState(Array(PANJANG_OTP).fill(''))
  const [kodeDemo, setKodeDemo] = useState(null)
  const [pesanKirim, setPesanKirim] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [protes, setProtes] = useState(0)
  const kotak = useRef([])

  // Angka di kolom kiri dihitung dari basis data, bukan janji pemasaran.
  const { data: statistik } = useApi(() => api.statistikPublik(), [])

  const kePeran = (pengguna) => {
    // `lanjut` bisa peninggalan sesi orang lain (mis. token kreator kedaluwarsa
    // lalu UMKM yang masuk). Ruang kerja peran lain hanya berujung di layar
    // "bukan untuk peran Anda", jadi abaikan dan antar ke beranda perannya.
    const ruang = lanjut?.match(/^\/(umkm|kreator|admin)(\/|$)/)?.[1]
    const milikPeranLain = ruang && ruang !== pengguna.peran && !lanjut.startsWith('/kreator/profil/') &&
      !(pengguna.peran !== 'umkm' && /^\/umkm\/kampanye\/[^/]+\/laporan$/.test(lanjut))
    if (lanjut && lanjut.startsWith('/') && !lanjut.startsWith('//') && !milikPeranLain) {
      return navigate(lanjut, { replace: true })
    }
    navigate({ umkm: '/umkm', kreator: '/kreator', admin: '/admin' }[pengguna.peran] || '/', {
      replace: true,
    })
  }

  const masukSandi = async (e) => {
    e.preventDefault()
    setGalat('')
    setSibuk(true)
    try {
      const pengguna = await masuk(identitas.trim(), kataSandi)
      kePeran(pengguna)
    } catch (err) {
      // Kata sandinya benar, hanya akunnya yang belum pernah diverifikasi.
      // Backend sudah menerbitkan kode baru, jadi jangan tinggalkan pengguna
      // di jalan buntu dengan pesan merah — antar dia ke layar kodenya.
      if (err.status === 403 && err.rincian?.perluVerifikasi) {
        navigate('/daftar/verifikasi', {
          state: { identitas: err.rincian.identitas, kodeOtp: err.rincian.kodeOtp || null },
        })
        return
      }
      setGalat(err.message)
      setProtes((n) => n + 1)
    } finally {
      setSibuk(false)
    }
  }

  const kirimOtp = async () => {
    if (!identitas.trim()) {
      setGalat('Isi alamat email Anda dulu.')
      setProtes((n) => n + 1)
      return
    }
    setGalat('')
    setSibuk(true)
    try {
      const hasil = await api.kirimUlangOtp(identitas.trim())
      setKodeDemo(hasil.kodeOtp || null)
      // Backend sengaja menjawab netral — ia tidak memberi tahu apakah email
      // itu terdaftar. Teruskan kalimatnya apa adanya, jangan menjanjikan
      // sesuatu yang belum tentu terjadi.
      setPesanKirim(hasil.pesan || '')
      setKode(Array(PANJANG_OTP).fill(''))
      setTahap('otp')
    } catch (err) {
      setGalat(err.message)
      setProtes((n) => n + 1)
    } finally {
      setSibuk(false)
    }
  }

  const verifikasi = async (e) => {
    e.preventDefault()
    const isi = kode.join('')
    if (isi.length < PANJANG_OTP) {
      setProtes((n) => n + 1)
      return
    }
    setGalat('')
    setSibuk(true)
    try {
      const hasil = await api.verifikasiOtp(identitas.trim(), isi)
      terapkanSesi(hasil.token, hasil.pengguna)
      kePeran(hasil.pengguna)
    } catch (err) {
      setGalat(err.message)
      setProtes((n) => n + 1)
    } finally {
      setSibuk(false)
    }
  }

  const isiDigit = (i, nilai) => {
    const bersih = nilai.replace(/\D/g, '').slice(-1)
    setKode((k) => {
      const baru = [...k]
      baru[i] = bersih
      return baru
    })
    if (bersih && i < PANJANG_OTP - 1) kotak.current[i + 1]?.focus()
  }

  const pakaiDemo = (akun) => {
    setIdentitas(akun.identitas)
    setKataSandi(SANDI_DEMO)
    setGalat('')
  }

  const angkaKiri = [
    [statistik?.umkmTerdaftar ?? 0, '', 'UMKM lokal sudah bergabung'],
    [statistik?.kreatorTerdaftar ?? 0, '', 'Kreator pemula aktif berkarya'],
    [statistik?.kampanyeSelesai ?? 0, '', 'Kampanye sudah selesai'],
  ]

  return (
    <AppShell variant="auth" flush>
      <div className="relative overflow-hidden">
        <Ambient varian="sky" />

        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="shell relative grid items-center gap-12 py-16 lg:grid-cols-2"
        >
          {/* Kiri: pesan kepercayaan */}
          <motion.div variants={fadeUp} className="hidden lg:block">
            <span className="chip gap-2 border border-gold-border bg-gold px-4 py-2 text-gold-text">
              <Shield size={15} /> Dana Aman di Rekber
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-navy">
              Selamat datang kembali di LokalBoost
            </h1>
            <p className="mt-4 max-w-md leading-relaxed text-ink-soft">
              Masuk untuk memantau kampanye, meninjau kreator, dan melihat laporan hasil
              yang sudah diverifikasi sistem anti-fraud.
            </p>

            {/* Angka hanya tampil bila ada pengguna sungguhan; akun contoh tidak
                dihitung. Selama masih nol, yang ditampilkan cara kerjanya. */}
            {angkaKiri.some(([n]) => n > 0) ? (
              <dl className="mt-8 space-y-4">
                {angkaKiri.map(([n, s, l]) => (
                  <div key={l} className="flex items-baseline gap-4">
                    <dt className="w-24 shrink-0 text-xl font-extrabold text-navy">
                      {n != null ? <AngkaNaik nilai={n} sufiks={s} /> : s}
                    </dt>
                    <dd className="text-sm text-ink-soft">{l}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <ul className="mt-8 space-y-3 text-sm text-ink-soft">
                {[
                  'Dana kampanye ditahan di Rekber sampai views tervalidasi.',
                  'Kreator dibayar per penonton asli, bukan per unggahan.',
                  'Isi kampanye diperiksa supaya tidak menjelekkan usaha lain.',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>

          {/* Kanan: formulir */}
          <motion.div variants={fadeUp} className="mx-auto w-full max-w-md">
            <div className="card overflow-hidden p-8">
              <h2 className="text-2xl font-extrabold text-navy">
                {tahap === 'identitas' ? 'Masuk ke Akun Anda' : 'Masukkan Kode OTP'}
              </h2>
              <p className="mt-1.5 text-sm text-ink-soft">
                {tahap === 'identitas'
                  ? 'Gunakan kata sandi, atau minta kode sekali pakai.'
                  : pesanKirim || `Kode 6 digit dikirim ke ${identitas}. Berlaku 10 menit.`}
              </p>

              <AnimatePresence mode="wait" initial={false}>
                {tahap === 'identitas' ? (
                  <motion.form
                    key="identitas"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: DUR.quick, ease: EASE.signature }}
                    onSubmit={masukSandi}
                    className="mt-6"
                  >
                    <label className="label">Coba dengan akun demo</label>
                    <div className="grid grid-cols-2 gap-2">
                      {AKUN_DEMO.map((akun) => (
                        <motion.button
                          key={akun.peran}
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => pakaiDemo(akun)}
                          className={`flex flex-col items-center gap-1 rounded-lg border-2 py-3 text-xs font-semibold transition-colors ${
                            identitas === akun.identitas
                              ? 'border-navy bg-skyfoot/40 text-navy'
                              : 'border-black/10 text-ink-soft hover:border-navy/30'
                          }`}
                        >
                          <akun.icon size={17} /> {akun.label}
                        </motion.button>
                      ))}
                    </div>
                    <p className="field-help">
                      Menekan salah satu akan mengisi email dan kata sandi contoh.
                    </p>

                    {/* Pemilih Email/Nomor HP dihapus: kode verifikasi hanya
                        dikirim lewat surel, jadi masuk dengan nomor HP tidak
                        pernah bisa dituntaskan. Menawarkannya hanya menyesatkan. */}
                    <Goyang kunci={protes}>
                      <div className="mt-5">
                        <label className="label" htmlFor="identitas">Alamat Email</label>
                        <input
                          id="identitas"
                          type="email"
                          required
                          value={identitas}
                          onChange={(e) => setIdentitas(e.target.value)}
                          placeholder="nama@email.com"
                          className="input"
                        />
                      </div>

                      <div className="mt-4">
                        <div className="flex items-baseline justify-between">
                          <label className="label" htmlFor="kata-sandi">Kata Sandi</label>
                          <Link
                            to="/lupa-sandi"
                            className="text-xs font-semibold text-navy underline-offset-2 hover:underline"
                          >
                            Lupa kata sandi?
                          </Link>
                        </div>
                        <input
                          id="kata-sandi"
                          type="password"
                          required
                          value={kataSandi}
                          onChange={(e) => setKataSandi(e.target.value)}
                          placeholder="Minimal 6 karakter"
                          className="input"
                        />
                      </div>
                    </Goyang>

                    {galat && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        role="alert"
                        className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger"
                      >
                        {galat}
                      </motion.p>
                    )}

                    <motion.button
                      {...tekan}
                      type="submit"
                      disabled={sibuk}
                      className="btn-primary mt-6 w-full py-3 disabled:opacity-60"
                    >
                      {sibuk ? 'Memeriksa…' : <>Masuk ke Dashboard <ArrowRight size={18} /></>}
                    </motion.button>

                    <button
                      type="button"
                      onClick={kirimOtp}
                      disabled={sibuk}
                      className="mt-3 w-full text-sm font-semibold text-navy transition-colors hover:opacity-70"
                    >
                      Lupa kata sandi? Masuk dengan kode OTP
                    </button>
                  </motion.form>
                ) : (
                  <motion.form
                    key="otp"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: DUR.quick, ease: EASE.signature }}
                    onSubmit={verifikasi}
                    className="mt-6"
                  >
                    <Goyang kunci={protes}>
                      <div className="flex justify-between gap-2">
                        {kode.map((d, i) => (
                          <motion.input
                            key={i}
                            ref={(el) => (kotak.current[i] = el)}
                            initial={{ opacity: 0, y: 8, scale: 0.94 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.22, delay: 0.08 + i * 0.04, ease: EASE.entrance }}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={1}
                            value={d}
                            onChange={(e) => isiDigit(i, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && !kode[i] && i > 0) kotak.current[i - 1]?.focus()
                            }}
                            aria-label={`Digit ${i + 1}`}
                            className="input h-14 w-full px-0 text-center text-xl font-bold"
                          />
                        ))}
                      </div>
                    </Goyang>

                    {/* Di produksi kode dikirim lewat SMS/email. Prototype ini
                        menampilkannya supaya bisa diperagakan tanpa gawai. */}
                    {kodeDemo && (
                      <p className="mt-4 flex items-center gap-2 rounded-lg border border-gold-border bg-gold px-4 py-3 text-xs text-gold-text">
                        <Sparkles size={14} className="shrink-0 text-navy" />
                        Mode demo — kode Anda: <b className="tracking-widest text-navy">{kodeDemo}</b>
                      </p>
                    )}

                    {galat && (
                      <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
                        {galat}
                      </p>
                    )}

                    <motion.button
                      {...tekan}
                      type="submit"
                      disabled={sibuk}
                      className="btn-primary mt-6 w-full py-3 disabled:opacity-60"
                    >
                      {sibuk ? 'Memverifikasi…' : <>Masuk ke Dashboard <ArrowRight size={18} /></>}
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => {
                        setTahap('identitas')
                        setGalat('')
                      }}
                      className="mt-3 w-full text-sm text-ink-soft transition-colors hover:text-navy"
                    >
                      ← Ubah email
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="mt-6 flex items-start gap-2 rounded-xl border border-gold-border bg-gold px-4 py-3">
                <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
                <p className="text-xs text-gold-text">
                  Kami tidak pernah meminta PIN atau kata sandi rekening Anda.
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-sm text-ink-soft">
              Belum punya akun?{' '}
              <Link to="/daftar" className="font-semibold text-navy hover:underline">Daftar gratis</Link>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </AppShell>
  )
}
