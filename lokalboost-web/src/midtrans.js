import { api } from './api.js'

/**
 * Jembatan ke Midtrans Snap.
 *
 * snap.js dimuat saat dibutuhkan saja (bukan di index.html), karena hanya
 * UMKM yang sedang membayar yang memerlukannya, dan alamatnya berbeda antara
 * sandbox dan produksi. Server yang memberi tahu alamat + client key lewat
 * GET /api/pembayaran/konfigurasi.
 */
let janjiSkrip = null

export function muatSnap({ snapJs, clientKey }) {
  if (window.snap) return Promise.resolve(window.snap)
  if (!janjiSkrip) {
    janjiSkrip = new Promise((berhasil, gagal) => {
      const skrip = document.createElement('script')
      skrip.src = snapJs
      skrip.setAttribute('data-client-key', clientKey)
      skrip.onload = () =>
        window.snap ? berhasil(window.snap) : gagal(new Error('Midtrans termuat tapi tidak siap. Muat ulang halaman.'))
      skrip.onerror = () => {
        janjiSkrip = null
        skrip.remove()
        gagal(new Error('Gagal memuat halaman pembayaran Midtrans. Periksa koneksi lalu coba lagi.'))
      }
      document.head.appendChild(skrip)
    })
  }
  return janjiSkrip
}

/**
 * Buat (atau pakai ulang) tagihan, buka popup Snap, lalu TANYA SERVER apa
 * status sebenarnya. Callback popup (onSuccess dst.) hanya dipakai sebagai
 * tanda popup selesai; yang menentukan lunas tidaknya adalah backend, yang
 * menanyakannya langsung ke Midtrans.
 *
 * @returns {Promise<{popup: 'sukses'|'pending'|'galat'|'ditutup', tagihan: object, kampanye: object}>}
 */
export async function bayarDenganSnap({ konfigurasi, kampanyeId, metode }) {
  const [{ tagihan }, snap] = await Promise.all([
    api.buatTagihan({ kampanyeId, metode }),
    muatSnap(konfigurasi),
  ])

  const popup = await new Promise((selesai) => {
    snap.pay(tagihan.snapToken, {
      onSuccess: () => selesai('sukses'),
      onPending: () => selesai('pending'),
      onError: () => selesai('galat'),
      onClose: () => selesai('ditutup'),
    })
  })

  const terkini = await api.cekPembayaran(tagihan.orderId)
  return { popup, tagihan: terkini.tagihan, kampanye: terkini.kampanye }
}

/** Kalimat untuk UMKM sesuai status tagihan setelah popup ditutup. */
export function pesanStatus({ popup, tagihan }) {
  switch (tagihan.status) {
    case 'lunas':
      return null
    case 'menunggu':
      return popup === 'ditutup'
        ? 'Pembayaran belum diselesaikan. Tekan Bayar lagi untuk melanjutkan tagihan yang sama.'
        : 'Menunggu pembayaran. Selesaikan transfer sesuai instruksi Midtrans, lalu tekan Cek Status.'
    case 'kedaluwarsa':
      return 'Tagihan kedaluwarsa. Tekan Bayar untuk membuat tagihan baru.'
    case 'perlu_tinjau':
      return 'Pembayaran diterima tetapi perlu ditinjau tim LokalBoost. Cek notifikasi Anda.'
    default:
      return 'Pembayaran gagal atau dibatalkan. Silakan coba lagi.'
  }
}
