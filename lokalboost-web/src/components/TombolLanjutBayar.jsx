import { useState } from 'react'
import { api, useApi } from '../api.js'
import { bayarDenganSnap, pesanStatus } from '../midtrans.js'
import { Wallet } from './icons.jsx'

/**
 * Tombol untuk kampanye berstatus menunggu_dana di dasbor UMKM: popup
 * Midtrans ditutup, VA belum ditransfer, atau tab tertutup di tengah jalan.
 *
 * Urutannya: cek dulu tagihan terakhir (VA yang sudah ditransfer cukup
 * disinkronkan, tanpa popup baru), baru membuka Snap dengan metode yang
 * sama supaya backend memakai ulang tagihan itu, bukan membuat nomor VA baru.
 */
export default function TombolLanjutBayar({ kampanye, onLunas }) {
  const { data: konfig } = useApi(() => api.konfigurasiPembayaran(), [])
  const [sibuk, setSibuk] = useState(false)
  const [pesan, setPesan] = useState('')

  const jalankan = async () => {
    setPesan('')
    setSibuk(true)
    try {
      if (!konfig?.aktif) {
        await api.setorDana(kampanye.id, { jumlah: kampanye.anggaran })
        return onLunas?.()
      }

      const { tagihan: daftar } = await api.tagihanKampanye(kampanye.id)
      const terakhir = daftar.find((t) => t.status === 'menunggu')
      if (terakhir) {
        const cek = await api.cekPembayaran(terakhir.orderId)
        if (cek.tagihan.status === 'lunas') return onLunas?.()
      }

      const hasil = await bayarDenganSnap({ konfigurasi: konfig, kampanyeId: kampanye.id, metode: terakhir?.metode })
      if (hasil.tagihan.status === 'lunas') return onLunas?.()
      setPesan(pesanStatus(hasil))
    } catch (err) {
      setPesan(err.message)
    } finally {
      setSibuk(false)
    }
  }

  // Kampanye yang menunggu tinjauan etika belum boleh dibayar; server pun
  // menolaknya, tapi tombol aktif yang pasti gagal hanya membingungkan.
  if (kampanye.moderasiStatus === 'tinjau') {
    return <span className="chip-warning px-3 py-2 text-xs">Sedang ditinjau tim LokalBoost</span>
  }

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        onClick={jalankan}
        disabled={sibuk || !konfig}
        className="btn-primary w-full px-4 py-2.5 disabled:opacity-60 sm:w-auto"
      >
        <Wallet size={16} /> {sibuk ? 'Memproses…' : konfig?.aktif ? 'Lanjutkan Pembayaran' : 'Setor Dana'}
      </button>
      {pesan && (
        <p role="status" className="max-w-xs text-xs text-ink-soft sm:text-right">
          {pesan}
        </p>
      )}
    </div>
  )
}
