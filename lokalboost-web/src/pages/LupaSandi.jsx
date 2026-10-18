import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import Ambient from '../components/Ambient.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { tekan } from '../motion.js'
import { useSesi } from '../sesi.jsx'
import { hanyaAngka } from '../validasi.js'
import { api } from '../api.js'
import { Shield, ArrowRight } from '../components/icons.jsx'

/**
 * Lupa Kata Sandi — dua langkah.
 *
 *   1. identitas → POST /api/auth/sandi/lupa   (menerbitkan kode ke email)
 *   2. kode + sandi baru → POST /api/auth/sandi/atur
 *
 * Balasan langkah 1 sengaja sama untuk email terdaftar maupun tidak, jadi
 * layar ini SELALU maju ke langkah 2. Menampilkan "email tidak ditemukan"
 * akan lebih ramah, tapi juga menjadikan halaman ini alat untuk memetakan
 * siapa saja yang punya akun di sini.
 */
export default function LupaSandi() {
  const navigate = useNavigate()
  const { terapkanSesi } = useSesi()

  const [tahap, setTahap] = useState('identitas') // identitas -> kode
  const [identitas, setIdentitas] = useState('')
  const [kode, setKode] = useState('')
  const [sandiBaru, setSandiBaru] = useState('')
  const [pesan, setPesan] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const mintaKode = async (e) => {
    e.preventDefault()
    setGalat('')
    setSibuk(true)
    try {
      const jawab = await api.lupaSandi(identitas.trim())
      setPesan(jawab.pesan)
      // Mode demo mengembalikan kodenya sekalian (BOCORKAN_OTP=true).
      if (jawab.kodeOtp) setKode(jawab.kodeOtp)
      setTahap('kode')
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  const simpanSandi = async (e) => {
    e.preventDefault()
    setGalat('')
    setSibuk(true)
    try {
      const jawab = await api.aturSandi(identitas.trim(), kode.trim(), sandiBaru)
      // Backend mengembalikan token — pengguna langsung masuk, tidak perlu
      // mengetik sandi yang baru saja dibuatnya.
      terapkanSesi(jawab.token, jawab.pengguna)
      navigate(jawab.pengguna.peran === 'umkm' ? '/umkm' : '/kreator', { replace: true })
    } catch (err) {
      setGalat(err.message)
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
          className="shell relative grid items-center gap-12 py-16 lg:grid-cols-2"
        >
          <motion.div variants={fadeUp} className="hidden lg:block">
            <span className="chip gap-2 border border-gold-border bg-gold px-4 py-2 text-gold-text">
              <Shield size={15} /> Pemulihan Akun
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-navy">
              Lupa kata sandi bukan berarti kehilangan akun
            </h1>
            <p className="mt-4 max-w-md leading-relaxed text-ink-soft">
              Kami kirim kode sekali pakai ke email yang terdaftar. Kode berlaku 10 menit
              dan hangus setelah 5 kali salah — dana di dompet Anda tetap aman selama prosesnya.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="mx-auto w-full max-w-md">
            <div className="card overflow-hidden p-8">
              <h2 className="text-2xl font-extrabold text-navy">
                {tahap === 'identitas' ? 'Atur Ulang Kata Sandi' : 'Masukkan Kode & Sandi Baru'}
              </h2>
              <p className="mt-1.5 text-sm text-ink-soft">
                {tahap === 'identitas'
                  ? 'Masukkan email akun Anda. Kami kirim kode untuk membuat kata sandi baru.'
                  : pesan || `Kode dikirim ke ${identitas}.`}
              </p>

              <AnimatePresence mode="wait" initial={false}>
                {tahap === 'identitas' ? (
                  <motion.form
                    key="identitas"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    onSubmit={mintaKode}
                    className="mt-6"
                  >
                    <label className="label" htmlFor="identitas-lupa">Email</label>
                    <input
                      id="identitas-lupa"
                      type="email"
                      required
                      value={identitas}
                      onChange={(e) => setIdentitas(e.target.value)}
                      placeholder="nama@email.com"
                      className="input"
                    />

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
                      {sibuk ? 'Mengirim…' : <>Kirim Kode <ArrowRight size={18} /></>}
                    </motion.button>
                  </motion.form>
                ) : (
                  <motion.form
                    key="kode"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    onSubmit={simpanSandi}
                    className="mt-6"
                  >
                    <label className="label" htmlFor="kode-lupa">Kode Verifikasi</label>
                    <input
                      id="kode-lupa"
                      inputMode="numeric"
                      required
                      value={kode}
                      onChange={(e) => setKode(hanyaAngka(e.target.value))}
                      maxLength={6}
                      placeholder="6 digit dari email"
                      className="input tracking-[0.3em]"
                    />

                    <div className="mt-4">
                      <label className="label" htmlFor="sandi-baru">Kata Sandi Baru</label>
                      <input
                        id="sandi-baru"
                        type="password"
                        required
                        value={sandiBaru}
                        onChange={(e) => setSandiBaru(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="input"
                      />
                    </div>

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
                      {sibuk ? 'Menyimpan…' : <>Simpan & Masuk <ArrowRight size={18} /></>}
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => {
                        setTahap('identitas')
                        setGalat('')
                      }}
                      className="mt-4 w-full text-sm text-ink-soft underline-offset-2 hover:underline"
                    >
                      Ganti alamat email
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>

              <p className="mt-6 text-center text-sm text-ink-soft">
                Ingat kata sandinya?{' '}
                <Link to="/masuk" className="font-semibold text-navy underline-offset-2 hover:underline">
                  Kembali ke Masuk
                </Link>
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </AppShell>
  )
}
