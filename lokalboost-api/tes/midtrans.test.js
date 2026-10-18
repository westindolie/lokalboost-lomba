/**
 * Tes setor dana lewat Midtrans Snap.
 *
 * Midtrans sungguhan TIDAK dipanggil: `fetch` global dibungkus sehingga
 * setiap permintaan ke *.midtrans.com dijawab Midtrans tiruan di bawah,
 * sedangkan permintaan ke server tes tetap lewat jaringan biasa. Yang diuji
 * adalah janji uangnya:
 *   - escrow hanya terisi setelah status DIAMBIL ULANG dari Midtrans,
 *   - notifikasi berulang tidak pernah menyetor dua kali,
 *   - uang yang diterima tapi tidak bisa disetor ditandai, bukan hilang.
 *
 * Jalankan: npm test
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-tes-midtrans-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.KOMISI_PERSEN = '5'
const KUNCI_SERVER = 'SB-Mid-server-TES-rahasia'
process.env.MIDTRANS_SERVER_KEY = KUNCI_SERVER
process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-TES'
process.env.MIDTRANS_PRODUKSI = ''

// ---------------------------------------------------------------------
//  Midtrans tiruan
// ---------------------------------------------------------------------

const palsu = {
  transaksi: new Map(), // order_id -> status yang akan dijawab API status
  permintaanSnap: [],
  dibatalkan: [],
  jawabanBatal: '404', // 404 = belum ada transaksi, aman dibatalkan
}

const fetchAsli = globalThis.fetch
globalThis.fetch = async (url, opsi = {}) => {
  const u = String(url)
  if (!u.includes('midtrans.com')) return fetchAsli(url, opsi)

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

  if (u.endsWith('/snap/v1/transactions')) {
    const badan = JSON.parse(opsi.body)
    palsu.permintaanSnap.push({ badan, otorisasi: opsi.headers?.Authorization })
    const n = palsu.permintaanSnap.length
    return json({ token: `token-${n}`, redirect_url: `https://app.sandbox.midtrans.com/snap/v4/redirection/token-${n}` }, 201)
  }

  const cocok = u.match(/\/v2\/([^/]+)\/(status|cancel)$/)
  if (cocok) {
    const orderId = decodeURIComponent(cocok[1])
    if (cocok[2] === 'cancel') {
      palsu.dibatalkan.push(orderId)
      return json({ status_code: palsu.jawabanBatal })
    }
    const t = palsu.transaksi.get(orderId)
    if (!t) return json({ status_code: '404', status_message: "Transaction doesn't exist." }, 404)
    return json({ status_code: '200', order_id: orderId, ...t })
  }

  throw new Error(`Midtrans tiruan tidak mengenal ${u}`)
}

/** Isi notifikasi yang ditandatangani dengan kunci server yang benar. */
function notifikasi(orderId, { status = 'settlement', jumlah, kode = '200' } = {}) {
  const gross = `${jumlah}.00`
  const signature_key = crypto
    .createHash('sha512')
    .update(`${orderId}${kode}${gross}${KUNCI_SERVER}`)
    .digest('hex')
  return { order_id: orderId, status_code: kode, gross_amount: gross, transaction_status: status, signature_key }
}

const lunaskan = (orderId, jumlah, payment_type = 'qris') =>
  palsu.transaksi.set(orderId, { transaction_status: 'settlement', gross_amount: `${jumlah}.00`, payment_type, fraud_status: 'accept' })

// ---------------------------------------------------------------------

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { hashSandi } = await import('../src/lib/auth.js')

let server
let basis

async function panggil(metode, jalur, { token, body } = {}) {
  const res = await fetch(`${basis}${jalur}`, {
    method: metode,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function daftarkan({ peran, nama, email }) {
  const daftar = await panggil('POST', '/api/auth/daftar', { body: { peran, nama, email, kataSandi: 'rahasia123' } })
  assert.equal(daftar.status, 201, JSON.stringify(daftar.data))
  const verif = await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: email, kode: daftar.data.kodeOtp } })
  assert.equal(verif.status, 200, JSON.stringify(verif.data))
  return { token: verif.data.token, id: verif.data.pengguna.id }
}

async function kampanyeBaru(token, nama, anggaran = 50_000) {
  const buat = await panggil('POST', '/api/kampanye', {
    token,
    body: { nama, kategori: 'Kuliner', lokasi: 'Bogor', targetViews: anggaran / 100, tarifPerView: 100, anggaran },
  })
  assert.equal(buat.status, 201, JSON.stringify(buat.data))
  return buat.data.kampanye.id
}

const escrowDari = (id) => db.prepare('SELECT * FROM escrow WHERE kampanye_id = ?').get(id)
const statusKampanye = (id) => db.prepare('SELECT status FROM kampanye WHERE id = ?').get(id).status
const jumlahSetor = (id) =>
  db.prepare("SELECT COUNT(*) AS n FROM transaksi WHERE kampanye_id = ? AND jenis = 'setor'").get(id).n

describe('Setor dana Rekber lewat Midtrans Snap', () => {
  const k = {}

  before(async () => {
    const app = buatApp()
    await new Promise((r) => {
      server = app.listen(0, r)
    })
    basis = `http://127.0.0.1:${server.address().port}`

    db.prepare(
      `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi)
       VALUES ('admin_mt', 'admin', 'Admin', 'admin-mt@tes.id', ?, 1)`,
    ).run(hashSandi('rahasia123'))
    db.prepare("INSERT INTO dompet (pengguna_id) VALUES ('admin_mt')").run()

    k.umkm = await daftarkan({ peran: 'umkm', nama: 'Bu Sari', email: 'umkm-mt@tes.id' })
    k.lain = await daftarkan({ peran: 'umkm', nama: 'Pak Lain', email: 'lain-mt@tes.id' })
  })

  after(async () => {
    globalThis.fetch = fetchAsli
    await new Promise((r) => server.close(r))
    db.close()
    for (const berkas of [dbSementara, `${dbSementara}-wal`, `${dbSementara}-shm`]) {
      try {
        if (fs.existsSync(berkas)) fs.unlinkSync(berkas)
      } catch {
        // Berkas sementara di %TEMP%; biarkan OS yang membersihkan bila terkunci.
      }
    }
  })

  it('membuka client key ke frontend tanpa pernah membocorkan server key', async () => {
    const res = await panggil('GET', '/api/pembayaran/konfigurasi')
    assert.equal(res.status, 200)
    assert.equal(res.data.aktif, true)
    assert.equal(res.data.produksi, false, 'bawaannya harus sandbox')
    assert.equal(res.data.clientKey, 'SB-Mid-client-TES')
    assert.match(res.data.snapJs, /app\.sandbox\.midtrans\.com\/snap\/snap\.js$/)
    assert.ok(!JSON.stringify(res.data).includes(KUNCI_SERVER))
  })

  it('menutup setor dana simulasi selama Midtrans aktif', async () => {
    k.kampanyeA = await kampanyeBaru(k.umkm.token, 'Bakso Aci Midtrans')
    const res = await panggil('POST', `/api/kampanye/${k.kampanyeA}/setor`, { token: k.umkm.token, body: { jumlah: 50_000 } })
    assert.equal(res.status, 409)
    assert.equal(escrowDari(k.kampanyeA)?.jumlah_disetor || 0, 0)
    assert.equal(statusKampanye(k.kampanyeA), 'menunggu_dana')
  })

  it('membuat tagihan sebesar anggaran, dan memakai ulang tagihan yang masih berlaku', async () => {
    const res = await panggil('POST', '/api/pembayaran/tagihan', {
      token: k.umkm.token,
      body: { kampanyeId: k.kampanyeA, metode: 'ewallet' },
    })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    k.orderA = res.data.tagihan.orderId
    assert.equal(res.data.tagihan.jumlah, 50_000)
    assert.equal(res.data.tagihan.snapToken, 'token-1')

    const kiriman = palsu.permintaanSnap[0]
    assert.equal(kiriman.badan.transaction_details.gross_amount, 50_000)
    assert.deepEqual(kiriman.badan.enabled_payments, ['gopay', 'shopeepay', 'other_qris'])
    assert.equal(kiriman.otorisasi, `Basic ${Buffer.from(`${KUNCI_SERVER}:`).toString('base64')}`)

    const lagi = await panggil('POST', '/api/pembayaran/tagihan', {
      token: k.umkm.token,
      body: { kampanyeId: k.kampanyeA, metode: 'ewallet' },
    })
    assert.equal(lagi.status, 200)
    assert.equal(lagi.data.tagihan.orderId, k.orderA, 'tagihan yang sama dipakai ulang')
    assert.equal(palsu.permintaanSnap.length, 1, 'tidak membuat tagihan kedua di Midtrans')
  })

  it('menolak tagihan untuk kampanye milik UMKM lain', async () => {
    const res = await panggil('POST', '/api/pembayaran/tagihan', { token: k.lain.token, body: { kampanyeId: k.kampanyeA } })
    assert.equal(res.status, 403)
    const cek = await panggil('POST', `/api/pembayaran/${k.orderA}/cek`, { token: k.lain.token })
    assert.equal(cek.status, 403)
  })

  it('menolak notifikasi dengan tanda tangan palsu', async () => {
    const isi = { ...notifikasi(k.orderA, { jumlah: 50_000 }), signature_key: 'a'.repeat(128) }
    const res = await panggil('POST', '/api/pembayaran/notifikasi', { body: isi })
    assert.equal(res.status, 403)
    assert.equal(statusKampanye(k.kampanyeA), 'menunggu_dana')
  })

  it('tidak percaya isi notifikasi: status tetap diambil dari API Midtrans', async () => {
    // Badan notifikasi mengaku settlement, tapi Midtrans masih bilang pending.
    palsu.transaksi.set(k.orderA, { transaction_status: 'pending', gross_amount: '50000.00', payment_type: 'qris' })
    const res = await panggil('POST', '/api/pembayaran/notifikasi', { body: notifikasi(k.orderA, { jumlah: 50_000 }) })
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'menunggu')
    assert.equal(statusKampanye(k.kampanyeA), 'menunggu_dana')
    assert.equal(escrowDari(k.kampanyeA)?.jumlah_disetor || 0, 0)
  })

  it('mengisi escrow sekali saja meski notifikasi dan cek status datang beruntun', async () => {
    lunaskan(k.orderA, 50_000)
    const semua = await Promise.all([
      panggil('POST', '/api/pembayaran/notifikasi', { body: notifikasi(k.orderA, { jumlah: 50_000 }) }),
      panggil('POST', '/api/pembayaran/notifikasi', { body: notifikasi(k.orderA, { jumlah: 50_000 }) }),
      panggil('POST', `/api/pembayaran/${k.orderA}/cek`, { token: k.umkm.token }),
      panggil('POST', `/api/pembayaran/${k.orderA}/cek`, { token: k.umkm.token }),
      panggil('POST', '/api/pembayaran/notifikasi', { body: notifikasi(k.orderA, { jumlah: 50_000 }) }),
    ])
    for (const r of semua) assert.equal(r.status, 200, JSON.stringify(r.data))

    assert.equal(escrowDari(k.kampanyeA).jumlah_disetor, 50_000)
    assert.equal(jumlahSetor(k.kampanyeA), 1, 'transaksi setor hanya satu')
    assert.equal(statusKampanye(k.kampanyeA), 'berjalan', 'kampanye tayang di marketplace')

    const cek = await panggil('POST', `/api/pembayaran/${k.orderA}/cek`, { token: k.umkm.token })
    assert.equal(cek.data.tagihan.status, 'lunas')
    assert.equal(cek.data.tagihan.jenisBayar, 'qris')
    assert.equal(cek.data.kampanye.status, 'berjalan')
  })

  it('tidak membuat tagihan baru untuk kampanye yang sudah didanai', async () => {
    const res = await panggil('POST', '/api/pembayaran/tagihan', { token: k.umkm.token, body: { kampanyeId: k.kampanyeA } })
    assert.equal(res.status, 409)
  })

  it('mengabaikan notifikasi untuk order yang bukan milik LokalBoost', async () => {
    const res = await panggil('POST', '/api/pembayaran/notifikasi', { body: notifikasi('order-uji-dashboard', { jumlah: 10_000 }) })
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'diabaikan')
  })

  it('menandai perlu_tinjau bila nominal dari Midtrans berbeda, dan memberi tahu admin', async () => {
    k.kampanyeB = await kampanyeBaru(k.umkm.token, 'Keripik Midtrans', 30_000)
    const t = await panggil('POST', '/api/pembayaran/tagihan', { token: k.umkm.token, body: { kampanyeId: k.kampanyeB } })
    const orderB = t.data.tagihan.orderId
    lunaskan(orderB, 1_000)

    const cek = await panggil('POST', `/api/pembayaran/${orderB}/cek`, { token: k.umkm.token })
    assert.equal(cek.data.tagihan.status, 'perlu_tinjau')
    assert.equal(statusKampanye(k.kampanyeB), 'menunggu_dana')
    assert.equal(escrowDari(k.kampanyeB)?.jumlah_disetor || 0, 0)
    const notifAdmin = db
      .prepare("SELECT COUNT(*) AS n FROM notifikasi WHERE pengguna_id = 'admin_mt' AND isi LIKE ?")
      .get(`%${orderB}%`).n
    assert.equal(notifAdmin, 1)
  })

  it('pembayaran ganda: tagihan kedua yang ikut lunas ditandai untuk refund, escrow tetap satu kali', async () => {
    k.kampanyeC = await kampanyeBaru(k.umkm.token, 'Kopi Midtrans', 40_000)
    const va = await panggil('POST', '/api/pembayaran/tagihan', { token: k.umkm.token, body: { kampanyeId: k.kampanyeC, metode: 'va' } })
    // Midtrans menolak membatalkan VA lama (412), jadi dua tagihan hidup bersamaan.
    palsu.jawabanBatal = '412'
    const qris = await panggil('POST', '/api/pembayaran/tagihan', {
      token: k.umkm.token,
      body: { kampanyeId: k.kampanyeC, metode: 'ewallet' },
    })
    palsu.jawabanBatal = '404'
    assert.notEqual(va.data.tagihan.orderId, qris.data.tagihan.orderId)
    assert.ok(palsu.dibatalkan.includes(va.data.tagihan.orderId), 'tagihan lama dicoba dibatalkan')

    lunaskan(qris.data.tagihan.orderId, 40_000, 'qris')
    lunaskan(va.data.tagihan.orderId, 40_000, 'bank_transfer')
    const pertama = await panggil('POST', `/api/pembayaran/${qris.data.tagihan.orderId}/cek`, { token: k.umkm.token })
    const kedua = await panggil('POST', `/api/pembayaran/${va.data.tagihan.orderId}/cek`, { token: k.umkm.token })

    assert.equal(pertama.data.tagihan.status, 'lunas')
    assert.equal(kedua.data.tagihan.status, 'perlu_tinjau')
    assert.match(kedua.data.tagihan.catatan, /sudah disetor/i)
    assert.equal(escrowDari(k.kampanyeC).jumlah_disetor, 40_000)
    assert.equal(jumlahSetor(k.kampanyeC), 1)
  })

  it('tagihan lama yang belum dipakai dibatalkan saat metode diganti', async () => {
    k.kampanyeD = await kampanyeBaru(k.umkm.token, 'Sambal Midtrans', 20_000)
    const satu = await panggil('POST', '/api/pembayaran/tagihan', { token: k.umkm.token, body: { kampanyeId: k.kampanyeD, metode: 'va' } })
    await panggil('POST', '/api/pembayaran/tagihan', { token: k.umkm.token, body: { kampanyeId: k.kampanyeD, metode: 'ewallet' } })
    const riwayat = await panggil('GET', `/api/pembayaran/kampanye/${k.kampanyeD}`, { token: k.umkm.token })
    const lama = riwayat.data.tagihan.find((t) => t.orderId === satu.data.tagihan.orderId)
    assert.equal(lama.status, 'gagal')
    assert.equal(riwayat.data.tagihan.filter((t) => t.status === 'menunggu').length, 1)
  })

  it('tagihan kedaluwarsa tidak mengisi escrow', async () => {
    const riwayat = await panggil('GET', `/api/pembayaran/kampanye/${k.kampanyeD}`, { token: k.umkm.token })
    const aktif = riwayat.data.tagihan.find((t) => t.status === 'menunggu')
    palsu.transaksi.set(aktif.orderId, { transaction_status: 'expire', gross_amount: '20000.00', payment_type: 'bank_transfer' })
    const cek = await panggil('POST', `/api/pembayaran/${aktif.orderId}/cek`, { token: k.umkm.token })
    assert.equal(cek.data.tagihan.status, 'kedaluwarsa')
    assert.equal(statusKampanye(k.kampanyeD), 'menunggu_dana')
  })
})
