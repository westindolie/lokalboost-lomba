import { motion } from 'motion/react'
import { Check } from './icons.jsx'
import { EASE, DUR } from '../motion.js'
import { fadeUp } from './PageTransition.jsx'

const LANGKAH_KAMPANYE = ['Info Produk', 'Target & Anggaran', 'Setor Dana']

/**
 * Penanda langkah — satu bentuk untuk semua alur bertahap.
 *
 * Aplikasi ini punya dua alur bertahap (pendaftaran dan pembuatan kampanye)
 * yang dulu digambar dengan dua komponen berbeda: yang satu memakai ruas
 * penghubung `flex-1` yang memenuhi lebar, yang lain garis `w-24` tetap; yang
 * satu menganimasikan `scaleX`, yang lain `width`. Berdiri sendiri keduanya
 * masuk akal, tapi dalam satu produk terlihat seperti dua pola desain.
 */
export function Stepper({ steps, current = 1 }) {
  return (
    /* items-start, bukan items-center: label sepanjang "Target & Anggaran"
       jatuh ke dua baris, dan dengan items-center kolom yang lebih tinggi itu
       menarik lingkarannya ke atas — ketiga nomor jadi tidak sebaris. */
    <div className="mx-auto flex max-w-3xl items-start justify-between">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <div key={label} className="contents">
            <div className="flex w-24 flex-col items-center text-center sm:w-28">
              <motion.span
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: active ? 1.06 : 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: i * 0.07, ease: EASE.entrance }}
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                  done ? 'bg-cream-300 text-navy' : active ? 'bg-navy text-white' : 'bg-cream-300 text-ink-muted'
                }`}
              >
                {done ? <Check size={16} /> : n}
              </motion.span>
              <span className={`mt-2 text-xs ${active || done ? 'font-semibold text-navy' : 'text-ink-muted'}`}>
                {label}
              </span>
            </div>
            {n < steps.length && (
              /* Ruas penghubung terisi saat langkah sudah dilewati */
              <span className="mx-1 mt-[18px] h-0.5 flex-1 overflow-hidden rounded bg-black/10">
                <motion.span
                  className="block h-full w-full origin-left rounded bg-navy"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: done ? 1 : 0 }}
                  transition={{ duration: DUR.standard, delay: 0.15, ease: EASE.signature }}
                />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Kepala halaman untuk ketiga langkah pembuatan kampanye.
 *
 * Sebelumnya tiap langkah menulis judulnya sendiri dengan gaya berbeda
 * (text-2xl bold, lalu text-2xl/3xl extrabold, lalu text-3xl extrabold) dan
 * meletakkan stepper di posisi yang berbeda pula. Akibatnya judul seolah
 * "melompat" ukuran setiap kali pengguna menekan Lanjutkan, padahal ini satu
 * alur yang sama.
 */
export function KepalaWizard({ langkah, judul, sub }) {
  return (
    <motion.div variants={fadeUp} className="mb-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="page-title">{judul}</h1>
        {sub && <p className="mx-auto mt-1.5 max-w-md text-ink-soft">{sub}</p>}
      </div>
      <div className="mt-7">
        <CampaignStepper current={langkah} />
      </div>
    </motion.div>
  )
}

// current: nomor langkah aktif (mulai dari 1)
export default function CampaignStepper({ current = 1 }) {
  return <Stepper steps={LANGKAH_KAMPANYE} current={current} />
}
