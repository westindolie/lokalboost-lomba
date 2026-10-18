import crypto from 'node:crypto'
import { db, transaksional } from '../lib/db.js'
import { config } from '../config.js'
import { GalatHttp, galat400, galat403, galat404, galat409, galat503, rupiah, sekarang } from '../lib/util.js'
import { setorDanaInti } from './escrow.js'
import { kirimNotifikasi } from './notifikasi.js'
import { pastikanLolosModerasi } from './moderasi-kampanye.js'

/**
 * Midtrans Snap untuk setor dana Rekber.
 * ------------------------------------------------------------------
 * Midtrans hanya mengurus PINTU MASUK uang. Begitu pembayaran lunas, semua
 * pergerakan berikutnya tetap angka di dalam escrow LokalBoost
 * (services/escrow.js) persis seperti sebelumnya.
 *
 * Aturan yang dipegang berkas ini:
 *
 *  1. Escrow hanya diisi setelah status pembayaran DIAMBIL ULANG dari API
 *     Midtrans dengan server key kita. Redirect "sukses" di peramban dan isi
 *     badan notifikasi tidak pernah dipercaya sebagai bukti bayar: badan
 *     notifikasi hanya pemicu, setelah tanda tangannya lolos.
 *  2. Idempoten. Midtrans mengirim notifikasi berkali-kali, dan peramban
 *     ikut memanggil "cek status". Baris tagihan berpindah ke 'lunas' dan
 *     escrow terisi dalam SATU transaksi, dengan klaim `WHERE status != 'lunas'`,
 *     jadi pengulangan apa pun tidak bisa menyetor dua kali.
 *  3. Uang yang sudah diterima Midtrans tidak boleh hilang diam-diam. Bila
 *     escrow menolak (kampanye sudah didanai tagihan lain, nominal berbeda),
 *     tagihan ditandai 'perlu_tinjau' dan admin diberi tahu untuk refund.
 */

export const midtransAktif = () => Boolean(config.midtrans.serverKey)

const alamat = () =>
  config.midtrans.produksi
    ? { snap: 'https://app.midtrans.com', api: 'https://api.midtrans.com' }
    : { snap: 'https://app.sandbox.midtrans.com', api: 'https://api.sandbox.midtrans.com' }

/** Alamat snap.js untuk frontend, sesuai mode sandbox/produksi. */
export const alamatSnapJs = () => `${alamat().snap}/snap/snap.js`

const headerOtorisasi = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Authorization: `Basic ${Buffer.from(`${config.midtrans.serverKey}:`).toString('base64')}`,
})

/** Metode di layar LokalBoost -> kanal Snap yang ditawarkan. */
const KANAL = {
  va: ['bca_va', 'bni_va', 'bri_va', 'permata_va', 'echannel', 'other_va'],
  ewallet: ['gopay', 'shopeepay', 'other_qris'],
}

async function mintaMidtrans(url, { method = 'GET', body } = {}) {
  let respons
  try {
    respons = await fetch(url, {
      method,
      headers: headerOtorisasi(),
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    throw galat503(`Midtrans tidak bisa dihubungi (${e.name === 'TimeoutError' ? 'waktu habis' : e.message}).`)
  }
  const isi = await respons.json().catch(() => ({}))
  return { status: respons.status, isi }
}

const ambilTagihan = (orderId) => db.prepare('SELECT * FROM pembayaran WHERE order_id = ?').get(orderId)

const menitKeDepan = (menit) =>
  new Date(Date.now() + menit * 60_000).toISOString().slice(0, 19).replace('T', ' ')

export function bentukTagihan(p) {
  if (!p) return null
  return {
    orderId: p.order_id,
    kampanyeId: p.kampanye_id,
    jumlah: p.jumlah,
    status: p.status,
    metode: p.metode,
    jenisBayar: p.jenis_bayar,
    statusMidtrans: p.status_mentah,
    catatan: p.catatan,
    snapUrl: p.snap_url,
    kedaluwarsaPada: p.kedaluwarsa_pada,
    dibuatPada: p.dibuat_pada,
  }
}

// ---------------------------------------------------------------------
//  1. Membuat tagihan Snap
// ---------------------------------------------------------------------

/**
 * Tagihan baru untuk setor dana sebuah kampanye. Tagihan 'menunggu' yang
 * masih berlaku dengan metode dan nominal yang sama DIPAKAI ULANG, supaya
 * UMKM yang menutup popup lalu menekan Bayar lagi tidak menerima dua nomor
 * VA untuk satu kampanye. Tagihan lama yang berbeda dibatalkan di Midtrans
 * lebih dulu, untuk alasan yang sama.
 */
export async function buatTagihan({ kampanyeId, umkm, metode }) {
  if (!midtransAktif()) throw galat409('Pembayaran Midtrans belum diaktifkan di server ini.')

  const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
  if (!kampanye) throw galat404('Kampanye tidak ditemukan.')
  if (kampanye.umkm_id !== umkm.id) throw galat403('Kampanye ini bukan milik Anda.')
  if (kampanye.model_reward === 'produk') throw galat409('Kampanye reward produk tidak perlu pembayaran. Terbitkan langsung.')
  const escrow = db.prepare('SELECT jumlah_disetor FROM escrow WHERE kampanye_id = ?').get(kampanyeId)
  if (escrow?.jumlah_disetor > 0) throw galat409('Dana kampanye ini sudah disetor.')
  // Gerbang etika: kampanye yang menjelekkan usaha lain tidak boleh dibayar,
  // karena dana masuk Rekber = kampanye tayang di marketplace.
  await pastikanLolosModerasi(kampanye)

  const metodeSah = KANAL[metode] ? metode : null
  const jumlah = Math.round(kampanye.anggaran)
  if (!(jumlah > 0)) throw galat400('Anggaran kampanye belum diisi.')

  const masihBerlaku = db
    .prepare(
      `SELECT * FROM pembayaran
       WHERE kampanye_id = ? AND status = 'menunggu'
       ORDER BY dibuat_pada DESC`,
    )
    .all(kampanyeId)

  const batasPakaiUlang = menitKeDepan(5)
  const cocok = masihBerlaku.find(
    (p) => p.jumlah === jumlah && (p.metode || null) === metodeSah && p.kedaluwarsa_pada > batasPakaiUlang,
  )
  if (cocok) return { ...bentukTagihan(cocok), snapToken: cocok.snap_token, dipakaiUlang: true }

  for (const lama of masihBerlaku) await batalkanTagihan(lama)

  const orderId = `LB-${kampanyeId.slice(0, 20)}-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
  const profil = db.prepare('SELECT nama, email, telepon FROM pengguna WHERE id = ?').get(umkm.id) || {}

  const { status, isi } = await mintaMidtrans(`${alamat().snap}/snap/v1/transactions`, {
    method: 'POST',
    body: {
      transaction_details: { order_id: orderId, gross_amount: jumlah },
      item_details: [
        {
          id: kampanyeId.slice(0, 50),
          price: jumlah,
          quantity: 1,
          name: `Rekber: ${kampanye.nama}`.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: (profil.nama || 'UMKM').slice(0, 50),
        ...(profil.email && { email: profil.email }),
        ...(profil.telepon && { phone: profil.telepon }),
      },
      ...(metodeSah && { enabled_payments: KANAL[metodeSah] }),
      expiry: { unit: 'minutes', duration: config.midtrans.menitKedaluwarsa },
      callbacks: { finish: `${config.alamatSitus}/umkm/kampanye/${kampanyeId}/kreator` },
    },
  })

  if (status >= 300 || !isi.token) {
    const pesan = Array.isArray(isi.error_messages) ? isi.error_messages.join('; ') : `HTTP ${status}`
    console.warn(`[MIDTRANS] Gagal membuat tagihan ${orderId}: ${pesan}`)
    throw galat503(`Midtrans menolak membuat tagihan: ${pesan}`)
  }

  db.prepare(
    `INSERT INTO pembayaran (order_id, kampanye_id, umkm_id, jumlah, snap_token, snap_url, metode, kedaluwarsa_pada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(orderId, kampanyeId, umkm.id, jumlah, isi.token, isi.redirect_url, metodeSah, menitKeDepan(config.midtrans.menitKedaluwarsa))

  return { ...bentukTagihan(ambilTagihan(orderId)), snapToken: isi.token, dipakaiUlang: false }
}

/**
 * Batalkan tagihan lama di Midtrans. 404 berarti UMKM belum pernah memilih
 * kanal di popup, jadi belum ada transaksi yang bisa dibayar: aman ditandai
 * gagal. Kalau Midtrans menolak membatalkan (mis. ternyata sudah lunas),
 * baris dibiarkan supaya notifikasinya tetap diproses normal.
 */
export async function batalkanTagihan(p) {
  try {
    const { status, isi } = await mintaMidtrans(`${alamat().api}/v2/${encodeURIComponent(p.order_id)}/cancel`, {
      method: 'POST',
    })
    const kode = String(isi.status_code || status)
    if (kode === '200' || kode === '404' || kode === '412') {
      db.prepare(
        `UPDATE pembayaran SET status = 'gagal', catatan = ?, diperbarui_pada = ?
         WHERE order_id = ? AND status = 'menunggu'`,
      ).run('Dibatalkan, diganti tagihan baru.', sekarang(), p.order_id)
    }
  } catch (e) {
    console.warn(`[MIDTRANS] Gagal membatalkan ${p.order_id}: ${e.message}`)
  }
}

// ---------------------------------------------------------------------
//  2. Notifikasi & cek status
// ---------------------------------------------------------------------

/**
 * signature_key = SHA512(order_id + status_code + gross_amount + server_key).
 * Dibandingkan dengan timingSafeEqual supaya waktu jawab tidak membocorkan
 * berapa karakter awal yang sudah benar.
 */
export function tandaSah({ order_id, status_code, gross_amount, signature_key }) {
  if (!order_id || !status_code || !gross_amount || typeof signature_key !== 'string') return false
  const harapan = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${config.midtrans.serverKey}`)
    .digest('hex')
  const a = Buffer.from(harapan)
  const b = Buffer.from(signature_key)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Status asli dari API Midtrans, satu-satunya sumber kebenaran soal lunas. */
async function ambilStatusMidtrans(orderId) {
  const { status, isi } = await mintaMidtrans(`${alamat().api}/v2/${encodeURIComponent(orderId)}/status`)
  if (status >= 500) throw galat503('Midtrans sedang bermasalah, coba cek lagi sebentar.')
  return isi
}

/** Pelunasan: tandai tagihan lunas + isi escrow, keduanya atau tidak sama sekali. */
const lunasi = transaksional((p, jenisBayar, statusMentah) => {
  const klaim = db
    .prepare(
      `UPDATE pembayaran
       SET status = 'lunas', jenis_bayar = ?, status_mentah = ?, catatan = NULL, diperbarui_pada = ?
       WHERE order_id = ? AND status NOT IN ('lunas', 'perlu_tinjau')`,
    )
    .run(jenisBayar, statusMentah, sekarang(), p.order_id)
  if (klaim.changes === 0) return false // sudah diproses oleh pemanggil lain

  setorDanaInti({
    kampanyeId: p.kampanye_id,
    umkmId: p.umkm_id,
    jumlah: p.jumlah,
    metode: `midtrans_${jenisBayar || 'snap'}`,
  })
  return true
})

function tandaiPerluTinjau(p, sebab, { jenisBayar, statusMentah }) {
  const hasil = db
    .prepare(
      `UPDATE pembayaran SET status = 'perlu_tinjau', jenis_bayar = ?, status_mentah = ?, catatan = ?, diperbarui_pada = ?
       WHERE order_id = ? AND status NOT IN ('lunas', 'perlu_tinjau')`,
    )
    .run(jenisBayar, statusMentah, sebab, sekarang(), p.order_id)
  if (hasil.changes === 0) return

  console.warn(`[MIDTRANS] ${p.order_id} perlu ditinjau: ${sebab}`)
  kirimNotifikasi(p.umkm_id, {
    jenis: 'dana',
    judul: 'Pembayaran diterima, sedang ditinjau',
    isi: `Pembayaran ${rupiah(p.jumlah)} (${p.order_id}) sudah kami terima tetapi belum bisa masuk Rekber: ${sebab} Tim LokalBoost akan menghubungi Anda untuk pengembalian dana.`,
    tautan: '/umkm/dana',
  })
  for (const admin of db.prepare("SELECT id FROM pengguna WHERE peran = 'admin'").all()) {
    kirimNotifikasi(admin.id, {
      jenis: 'dana',
      judul: 'Pembayaran Midtrans perlu ditinjau',
      isi: `${p.order_id} · ${rupiah(p.jumlah)} · ${sebab} Lakukan refund lewat dashboard Midtrans.`,
      tautan: '/admin',
    })
  }
}

/**
 * Terapkan status Midtrans ke tagihan kita. Dipakai oleh notifikasi DAN oleh
 * tombol "cek status" (satu-satunya jalan di laptop, karena notifikasi
 * Midtrans tidak bisa menjangkau localhost).
 */
export async function sinkronkanTagihan(orderId) {
  const p = ambilTagihan(orderId)
  if (!p) throw galat404('Tagihan tidak ditemukan.')
  if (p.status === 'lunas' || p.status === 'perlu_tinjau') return bentukTagihan(p)

  const s = await ambilStatusMidtrans(orderId)
  // 404 = UMKM belum memilih kanal pembayaran di popup. Bukan kegagalan.
  if (String(s.status_code) === '404') return bentukTagihan(p)

  const ts = s.transaction_status
  const jenisBayar = s.payment_type || null
  const lunas = ts === 'settlement' || (ts === 'capture' && s.fraud_status === 'accept')

  if (lunas) {
    const diterima = Math.round(Number(s.gross_amount))
    if (diterima !== p.jumlah) {
      tandaiPerluTinjau(p, `Nominal dari Midtrans (${rupiah(diterima)}) berbeda dari tagihan (${rupiah(p.jumlah)}).`, {
        jenisBayar,
        statusMentah: ts,
      })
    } else {
      try {
        lunasi(p, jenisBayar, ts)
      } catch (e) {
        // Penolakan escrow yang disengaja (GalatHttp) berarti uang sudah
        // diterima tapi tidak bisa disetor. Galat lain (database sibuk)
        // dilempar ulang supaya Midtrans mengirim ulang notifikasinya.
        if (!(e instanceof GalatHttp)) throw e
        tandaiPerluTinjau(p, `${e.message}`, { jenisBayar, statusMentah: ts })
      }
    }
  } else {
    const statusBaru =
      ts === 'expire'
        ? 'kedaluwarsa'
        : ['deny', 'cancel', 'failure'].includes(ts)
          ? 'gagal'
          : 'menunggu' // pending, capture+challenge, authorize
    db.prepare(
      `UPDATE pembayaran SET status = ?, jenis_bayar = ?, status_mentah = ?, diperbarui_pada = ?
       WHERE order_id = ? AND status NOT IN ('lunas', 'perlu_tinjau')`,
    ).run(statusBaru, jenisBayar, ts || null, sekarang(), orderId)
  }

  return bentukTagihan(ambilTagihan(orderId))
}

/**
 * Badan notifikasi HTTP dari Midtrans. Tanda tangan dicek lebih dulu;
 * order_id yang bukan milik kita (mis. tombol "test notification" di
 * dashboard Midtrans) dijawab 200 dan diabaikan, supaya Midtrans tidak
 * mengulanginya terus.
 */
export async function tanganiNotifikasi(badan) {
  if (!midtransAktif()) throw galat409('Pembayaran Midtrans belum diaktifkan di server ini.')
  if (!tandaSah(badan || {})) throw galat403('Tanda tangan notifikasi Midtrans tidak sah.')
  if (!ambilTagihan(badan.order_id)) return { diabaikan: true, orderId: badan.order_id }
  return sinkronkanTagihan(badan.order_id)
}
