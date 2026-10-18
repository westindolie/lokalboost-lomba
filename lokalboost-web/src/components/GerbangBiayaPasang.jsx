import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { fadeUp } from './PageTransition.jsx'
import { Tekan } from './ui.jsx'
import { DUR, EASE } from '../motion.js'
import { rupiah } from '../format.js'
import { api } from '../api.js'
import { bayarBiayaPasangDenganSnap, pesanStatus } from '../midtrans.js'
import { ArrowRight, Check, Shield, Wallet } from './icons.jsx'

/**
 * Gerbang biaya pasang kampanye (services/biaya-pasang.js di API).
 *
 * UMKM membayar biaya pasang SEBELUM formulir kampanye terbuka. Satu
 * pembayaran = satu kampanye; tiketnya terpakai saat kampanye disimpan di
 * langkah 3. Yang menentukan lunas tetap server (Midtrans ditanya ulang),
 * bukan callback popup.
 */
const MANFAAT = [
  'Kampanye tayang di marketplace kreator lokal',
  'Isi kampanye diperiksa AI sebelum tayang',
  'Rekomendasi kreator yang cocok dari AI Matchmaker',
  'Views disaring AI Anti-Fraud, laporan hasil otomatis',
]

const METODE = [
  { id: 'ewallet', judul: 'E-Wallet & QRIS', sub: 'GoPay, ShopeePay, QRIS' },
  { id: 'va', judul: 'Virtual Account', sub: 'BCA, BNI, BRI, Mandiri' },
]

export default function GerbangBiayaPasang({ status, konfigurasi, onLunas }) {
  const [metode, setMetode] = useState('ewallet')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [tagihan, setTagihan] = useState(status.menunggu || null)

  const pakaiMidtrans = Boolean(status.midtrans && konfigurasi?.aktif)

  const bayar = async () => {
    setGalat('')
    setInfo('')
    setSibuk(true)
    try {
      if (pakaiMidtrans) {
        const hasil = await bayarBiayaPasangDenganSnap({ konfigurasi, metode })
        setTagihan(hasil.tagihan)
        if (hasil.tagihan.status === 'lunas') return onLunas()
        setInfo(pesanStatus(hasil))
        return
      }
      await api.bayarBiayaPasangSimulasi()
      onLunas()
    } catch (err) {
      // 409 "sudah lunas" = tiket ada (mis. dibayar di tab lain): lanjut saja.
      if (err.status === 409 && /sudah lunas/i.test(err.message)) return onLunas()
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  const cekStatus = async () => {
    if (!tagihan) return
    setGalat('')
    setSibuk(true)
    try {
      const hasil = await api.cekPembayaran(tagihan.orderId)
      setTagihan(hasil.tagihan)
      if (hasil.tagihan.status === 'lunas') return onLunas()
      setInfo(pesanStatus({ popup: 'pending', tagihan: hasil.tagihan }))
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <motion.div variants={fadeUp} className="card overflow-hidden">
      <div className="bg-navy px-7 py-6 text-white">
        <div className="flex items-center gap-2 text-white/70">
          <Wallet size={18} />
          <p className="text-sm font-semibold">Biaya Pasang Kampanye</p>
        </div>
        <p className="mt-2 text-4xl font-extrabold tracking-tight">{rupiah(status.biaya)}</p>
        <p className="mt-1 text-sm text-white/75">
          Dibayar sekali per kampanye, sebelum Anda mengisi detail kampanye.
        </p>
      </div>

      <div className="p-7">
        <ul className="space-y-2.5">
          {MANFAAT.map((m, i) => (
            <motion.li
              key={m}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, delay: 0.1 + i * 0.06, ease: EASE.entrance }}
              className="flex items-start gap-2.5 text-sm text-ink"
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-navy">
                <Check size={12} />
              </span>
              {m}
            </motion.li>
          ))}
        </ul>

        {pakaiMidtrans && (
          <>
            <p className="mt-6 text-sm font-semibold text-navy">Metode Pembayaran</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {METODE.map((m) => {
                const aktif = metode === m.id
                return (
                  <motion.button
                    key={m.id}
                    type="button"
                    onClick={() => setMetode(m.id)}
                    whileTap={{ scale: 0.99 }}
                    transition={{ duration: DUR.hover, ease: EASE.signature }}
                    aria-pressed={aktif}
                    className={`rounded-xl border-2 bg-white px-4 py-3 text-left transition-colors ${
                      aktif ? 'border-navy' : 'border-black/10 hover:border-navy/30'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-navy">{m.judul}</span>
                    <span className="block text-xs text-ink-soft">{m.sub}</span>
                  </motion.button>
                )
              })}
            </div>
          </>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-gold-border bg-gold px-3 py-3">
          <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
          <p className="text-xs text-gold-text">
            Biaya pasang adalah biaya layanan LokalBoost, terpisah dari dana Rekber. Dana reward untuk kreator
            Anda setor di langkah 3 dan tetap hanya dibayar untuk views tervalidasi.
          </p>
        </div>

        {galat && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
            {galat}
          </p>
        )}

        {(info || tagihan?.status === 'menunggu') && (
          <div role="status" className="mt-4 rounded-lg bg-cream-100 px-4 py-3 text-sm text-ink-soft">
            <p>{info || 'Ada tagihan biaya pasang yang belum selesai dibayar.'}</p>
            {tagihan?.status === 'menunggu' && (
              <button
                type="button"
                onClick={cekStatus}
                disabled={sibuk}
                className="mt-2 font-semibold text-navy hover:underline disabled:opacity-60"
              >
                Cek Status Pembayaran
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Tekan className="flex-1">
            <Link to="/umkm" className="btn-outline w-full py-3.5">← Batal</Link>
          </Tekan>
          <Tekan className="flex-[2]">
            <button type="button" onClick={bayar} disabled={sibuk} className="btn-primary w-full py-3.5 disabled:opacity-60">
              {sibuk ? (
                'Memproses…'
              ) : (
                <>
                  Bayar {rupiah(status.biaya)}
                  {pakaiMidtrans ? ' via Midtrans' : ' (simulasi)'} <ArrowRight size={18} />
                </>
              )}
            </button>
          </Tekan>
        </div>
        <p className="field-help text-center">
          Setelah lunas, formulir kampanye langsung terbuka.
        </p>
      </div>
    </motion.div>
  )
}
