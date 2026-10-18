import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import Ambient from '../components/Ambient.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { Stepper } from '../components/CampaignStepper.jsx'
import { tekan, EASE, DUR } from '../motion.js'
import { Shield, Store, Video, Check, ArrowRight } from '../components/icons.jsx'

/**
 * Tiga langkah, bukan dua: PRD §6.1 mensyaratkan verifikasi OTP saat
 * pendaftaran, dan halaman Informasi Dasar sudah terlanjur mengaku nomor
 * pengguna "sudah diverifikasi" tanpa pernah memintanya. Tetap jauh di bawah
 * batas "idealnya < 5 langkah" (PRD §11).
 */
export function OnboardingStepper({ current = 1 }) {
  return (
    <div className="mx-auto max-w-md">
      <Stepper steps={['Pilih Peran', 'Informasi Dasar', 'Verifikasi']} current={current} />
    </div>
  )
}

const peranList = [
  {
    id: 'umkm',
    icon: Store,
    iconWrap: 'bg-gold text-navy',
    title: 'Saya UMKM',
    desc: 'Saya pemilik usaha yang mencari kreator untuk mempromosikan produk saya.',
  },
  {
    id: 'kreator',
    icon: Video,
    iconWrap: 'bg-skyfoot text-navy',
    title: 'Saya Kreator',
    desc: 'Saya pembuat konten yang ingin bekerja sama dengan merek dan UMKM lokal.',
  },
]

export default function Register() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [dipilih, setDipilih] = useState(params.get('peran') || 'umkm')

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
            <h1 className="page-title">Mulai Perjalanan Anda</h1>
            <p className="mt-2 text-ink-soft">Pilih bagaimana Anda ingin menggunakan LokalBoost.</p>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-8">
            <OnboardingStepper current={1} />
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-2 rounded-xl border border-gold-border bg-gold px-5 py-3"
          >
            <Shield size={18} className="text-navy" />
            <span className="text-sm font-semibold text-navy">Pendaftaran Gratis &amp; Aman</span>
          </motion.div>

          <div className="mx-auto mt-6 grid max-w-2xl gap-5 sm:grid-cols-2">
            {peranList.map(({ id, icon: Icon, iconWrap, title, desc }) => {
              const aktif = dipilih === id
              return (
                <motion.button
                  key={id}
                  variants={fadeUp}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setDipilih(id)}
                  aria-pressed={aktif}
                  className={`relative rounded-2xl border-2 bg-white p-7 text-center transition-colors ${
                    aktif ? 'border-navy shadow-cardhover' : 'border-transparent shadow-card hover:border-navy/20'
                  }`}
                >
                  {aktif && (
                    <motion.span
                      layoutId="tanda-peran"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2, ease: EASE.settle }}
                      className="absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full bg-navy text-white"
                    >
                      <Check size={14} />
                    </motion.span>
                  )}
                  <motion.span
                    animate={{ scale: aktif ? 1.05 : 1 }}
                    transition={{ duration: DUR.quick, ease: EASE.signature }}
                    className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${iconWrap}`}
                  >
                    <Icon size={28} />
                  </motion.span>
                  <h3 className="mt-4 text-xl font-bold text-navy">{title}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{desc}</p>
                </motion.button>
              )
            })}
          </div>

          <motion.div
            variants={fadeUp}
            className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 border-t border-black/5 pt-6 sm:flex-row"
          >
            <motion.div {...tekan} className="flex-1">
              <Link to="/" className="btn-outline w-full py-3">← Kembali</Link>
            </motion.div>
            <motion.button
              {...tekan}
              onClick={() => navigate(`/daftar/profil?peran=${dipilih}`)}
              className="btn-primary flex-[2] py-3"
            >
              Lanjut ke Informasi Dasar <ArrowRight size={18} />
            </motion.button>
          </motion.div>

          <motion.p variants={fadeUp} className="mt-5 text-center text-sm text-ink-soft">
            Sudah punya akun?{' '}
            <Link to="/masuk" className="font-semibold text-navy hover:underline">Masuk di sini</Link>
          </motion.p>
        </motion.div>
      </div>
    </AppShell>
  )
}
