import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import Ambient from '../components/Ambient.jsx'
import { OnboardingStepper } from './Register.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { tekan, EASE } from '../motion.js'
import { Goyang } from '../components/Feedback.jsx'
import { useSesi } from '../sesi.jsx'
import { api } from '../api.js'
import { Shield, Store, Video, ArrowRight, Phone, Mail, Sparkles } from '../components/icons.jsx'

/**
 * Langkah 3 pendaftaran — verifikasi OTP yang benar-benar diverifikasi.
 *
 * Kode dicocokkan ke POST /api/auth/otp/verifikasi. Kalau cocok, backend
 * menandai akun terverifikasi dan menerbitkan token; token itulah yang
 * dipakai untuk menyimpan profil yang dititipkan langkah 2.
 */
const PANJANG = 6
/** Samakan dengan JEDA_KIRIM_DETIK di backend — kalau tombolnya muncul lebih
 *  cepat, satu-satunya yang didapat pengguna adalah pesan penolakan. */
const JEDA_KIRIM = 60

export default function VerifikasiOtp() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const { terapkanSesi } = useSesi()

  const peran = params.get('peran') === 'kreator' ? 'kreator' : 'umkm'
  const isUMKM = peran === 'umkm'

  const [kode, setKode] = useState(Array(PANJANG).fill(''))
  const [kodeDemo, setKodeDemo] = useState(state?.kodeOtp || null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [protes, setProtes] = useState(0)
  const [detik, setDetik] = useState(JEDA_KIRIM)
  const kotak = useRef([])

  useEffect(() => {
    if (detik <= 0) return
    const t = setTimeout(() => setDetik((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [detik])

  // Tanpa identitas, halaman ini tidak punya akun untuk diverifikasi —
  // biasanya berarti pengguna membuka alamatnya langsung.
  if (!state?.identitas) return <Navigate to={`/daftar/profil?peran=${peran}`} replace />

  const identitas = state.identitas
  const lewatEmail = identitas.includes('@')
  // Langkah 2 pendaftaran menitipkan `profil` untuk disimpan setelah token ada.
  // Ketiadaannya berarti pengguna sampai ke sini lewat halaman Masuk.
  const dariPendaftaran = Boolean(state.profil)
  const lengkap = kode.every((d) => d !== '')

  const isiDigit = (i, nilaiBaru) => {
    const bersih = nilaiBaru.replace(/\D/g, '').slice(-1)
    setKode((k) => {
      const baru = [...k]
      baru[i] = bersih
      return baru
    })
    if (bersih && i < PANJANG - 1) kotak.current[i + 1]?.focus()
  }

  const kirimUlang = async () => {
    setGalat('')
    try {
      const hasil = await api.kirimUlangOtp(identitas)
      setKodeDemo(hasil.kodeOtp || null)
      setKode(Array(PANJANG).fill(''))
      setDetik(JEDA_KIRIM)
    } catch (err) {
      setGalat(err.message)
    }
  }

  const kirim = async (e) => {
    e.preventDefault()
    if (!lengkap) {
      setProtes((n) => n + 1)
      return
    }
    setGalat('')
    setSibuk(true)
    try {
      const hasil = await api.verifikasiOtp(identitas, kode.join(''))
      terapkanSesi(hasil.token, hasil.pengguna)

      // Profil dititipkan langkah 2 dan baru bisa disimpan sekarang, setelah
      // token ada. Kegagalannya tidak boleh menahan pengguna di layar ini —
      // akunnya sudah sah, profilnya bisa dilengkapi lagi nanti.
      if (state.profil) {
        try {
          await api.simpanProfil(state.profil)
        } catch {
          /* diabaikan dengan sengaja */
        }
      }

      // Tujuan ditentukan peran pada akun, bukan peran di alamat halaman.
      // Halaman ini juga dipakai oleh pengguna lama yang gagal masuk karena
      // belum terverifikasi — mereka datang tanpa ?peran= yang bisa dipercaya.
      const tujuan = { umkm: '/umkm', kreator: '/kreator', admin: '/admin' }
      navigate(tujuan[hasil.pengguna?.peran] || (isUMKM ? '/umkm' : '/kreator'), { replace: true })
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
        <Ambient varian="sky" />

        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="shell relative py-14"
        >
          <motion.div variants={fadeUp} className="mx-auto max-w-2xl text-center">
            <h1 className="page-title">{dariPendaftaran ? 'Satu Langkah Terakhir' : 'Verifikasi Akun Anda'}</h1>
            <p className="mt-2 text-ink-soft">
              {dariPendaftaran
                ? `Kami mengirim kode 6 digit ke ${lewatEmail ? 'email' : 'nomor'} Anda. Masukkan di bawah untuk mengaktifkan akun.`
                : `Akun ini belum pernah diverifikasi. Masukkan kode 6 digit yang kami kirim ke ${lewatEmail ? 'email' : 'nomor'} Anda untuk melanjutkan.`}
            </p>
          </motion.div>

          {/* Langkah pendaftaran hanya relevan bagi yang memang sedang
              mendaftar. Pengguna lama yang gagal masuk karena belum
              terverifikasi datang ke sini tanpa peran yang bisa dipercaya —
              menampilkan "Anda mendaftar sebagai UMKM" kepada seorang kreator
              yang cuma ingin masuk adalah keterangan yang salah. */}
          {dariPendaftaran && (
            <>
              <motion.div variants={fadeUp} className="mt-8">
                <OnboardingStepper current={3} />
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
                  <Link to={`/daftar/profil?peran=${peran}`} className="text-xs text-gold-text underline">
                    Kembali ubah data
                  </Link>
                </div>
              </motion.div>
            </>
          )}

          <motion.form
            variants={fadeUp}
            onSubmit={kirim}
            className="card mx-auto mt-6 max-w-2xl p-7 sm:p-9"
          >
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              {lewatEmail ? <Mail size={16} className="text-navy" /> : <Phone size={16} className="text-navy" />}
              Kode dikirim ke {identitas}
            </div>

            <Goyang kunci={protes}>
              <div className="mt-5 flex justify-between gap-2 sm:gap-3">
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
                    className="input h-14 w-full px-0 text-center text-xl font-bold sm:h-16"
                  />
                ))}
              </div>
            </Goyang>

            {/* Backend hanya membocorkan kode saat SMTP belum diatur (mode demo),
                supaya alur pendaftaran tetap bisa diperagakan tanpa gawai. */}
            {kodeDemo ? (
              <p className="mt-4 flex items-center gap-2 rounded-lg border border-gold-border bg-gold px-4 py-3 text-xs text-gold-text">
                <Sparkles size={14} className="shrink-0 text-navy" />
                Mode demo — kode Anda: <b className="tracking-widest text-navy">{kodeDemo}</b>
              </p>
            ) : lewatEmail ? (
              <p className="mt-4 text-center text-xs text-ink-muted">
                Email belum masuk? Cek folder Spam atau Promosi.
              </p>
            ) : null}

            {galat && (
              <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
                {galat}
              </p>
            )}

            <div className="mt-4 text-center text-sm text-ink-soft">
              {detik > 0 ? (
                <>Belum menerima kode? Kirim ulang dalam <b className="text-navy">{detik} detik</b>.</>
              ) : (
                <button
                  type="button"
                  onClick={kirimUlang}
                  className="font-semibold text-navy hover:underline"
                >
                  Kirim ulang kode
                </button>
              )}
            </div>

            <motion.button
              {...tekan}
              type="submit"
              disabled={sibuk}
              className={`mt-6 w-full py-3 disabled:opacity-60 ${
                lengkap ? 'btn-primary' : 'btn bg-ink-muted/25 text-ink-muted'
              }`}
            >
              {sibuk ? (
                'Memverifikasi…'
              ) : lengkap ? (
                <>Verifikasi &amp; Masuk Dashboard <ArrowRight size={18} /></>
              ) : (
                'Masukkan 6 digit kode'
              )}
            </motion.button>

            <div className="mt-6 flex items-start gap-2 rounded-xl border border-gold-border bg-gold px-4 py-3">
              <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
              <p className="text-xs text-gold-text">
                Jangan bagikan kode ini kepada siapa pun. Kami tidak pernah meminta PIN atau kata
                sandi rekening Anda.
              </p>
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
