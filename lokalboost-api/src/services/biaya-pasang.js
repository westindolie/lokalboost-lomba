import crypto from 'node:crypto'
import { db, transaksional } from '../lib/db.js'
import { config } from '../config.js'
import { GalatHttp, galat409, rupiah, sekarang } from '../lib/util.js'
import { bentukTagihan, midtransAktif } from './midtrans.js'
import { kirimNotifikasi } from './notifikasi.js'

/**
 * Biaya pasang kampanye: pendapatan pengembang LokalBoost.
 * ------------------------------------------------------------------
 * UMKM membayar `config.biayaPasang` (bawaan Rp 10.000) SEBELUM formulir
 * kampanye terbuka. Satu pembayaran = satu kampanye.
 *
 * Bentuknya "tiket": baris `pembayaran` berjenis 'biaya_pasang' yang lunas
 * dan belum punya kampanye_id. POST /api/kampanye memakai satu tiket di
 * transaksi yang sama dengan INSERT kampanye, jadi dua permintaan bersamaan
 * dengan satu tiket tidak bisa sama-sama berhasil.
 *
 * Uangnya bukan bagian Rekber: tidak masuk escrow, tidak dibayarkan ke
 * kreator, tidak ikut dikembalikan saat kampanye selesai.
 *
 * Pintu masuk uangnya sama dengan setor Rekber: Midtrans Snap bila aktif
 * (services/midtrans.js, lunas hanya setelah status diambil ulang dari
 * Midtrans), simulasi bila Midtrans mati. Begitu Midtrans aktif, jalur
 * simulasi ditutup.
 */

export const biayaPasangAktif = () => !config.modeDemo && config.biayaPasang > 0

const KUERI_TIKET = `SELECT * FROM pembayaran
  WHERE umkm_id = ? AND jenis = 'biaya_pasang' AND status = 'lunas' AND kampanye_id IS NULL
  ORDER BY dibuat_pada, order_id LIMIT 1`

/** Tiket lunas yang belum dipakai, atau null. */
export const tiketTersedia = (umkmId) => db.prepare(KUERI_TIKET).get(umkmId) || null

/** Ringkasan untuk layar Buat Kampanye dan Riwayat Dana. */
export function statusBiayaPasang(umkmId) {
  const tiket = tiketTersedia(umkmId)
  const menunggu = db
    .prepare(
      `SELECT * FROM pembayaran
       WHERE umkm_id = ? AND jenis = 'biaya_pasang' AND status = 'menunggu' AND kedaluwarsa_pada > ?
       ORDER BY dibuat_pada DESC LIMIT 1`,
    )
    .get(umkmId, sekarang())
  const riwayat = db
    .prepare(
      `SELECT p.*, k.nama AS nama_kampanye FROM pembayaran p
       LEFT JOIN kampanye k ON k.id = p.kampanye_id
       WHERE p.umkm_id = ? AND p.jenis = 'biaya_pasang' AND p.status IN ('lunas', 'perlu_tinjau')
       ORDER BY p.dibuat_pada DESC LIMIT 20`,
    )
    .all(umkmId)

  return {
    aktif: biayaPasangAktif(),
    biaya: config.biayaPasang,
    midtrans: midtransAktif(),
    sudahBayar: !biayaPasangAktif() || Boolean(tiket),
    tiket: bentukTagihan(tiket),
    menunggu: bentukTagihan(menunggu),
    riwayat: riwayat.map((p) => ({ ...bentukTagihan(p), namaKampanye: p.nama_kampanye || null })),
  }
}

/**
 * Pastikan UMKM punya tiket sebelum validasi berat kampanye. Pengecekan
 * awal saja; yang mengikat adalah `pakaiTiket` di dalam transaksi.
 */
export function pastikanAdaTiket(umkmId) {
  if (!biayaPasangAktif()) return
  if (!tiketTersedia(umkmId)) throw galatBelumBayar()
}

/**
 * Pakai satu tiket untuk kampanye yang baru di-INSERT. WAJIB dipanggil di
 * dalam `transaksional` yang sama dengan INSERT kampanye: gagal di sini
 * membatalkan kampanyenya juga.
 */
export function pakaiTiket(umkmId, kampanyeId) {
  if (!biayaPasangAktif()) return null
  const tiket = tiketTersedia(umkmId)
  if (!tiket) throw galatBelumBayar()
  const hasil = db
    .prepare(
      `UPDATE pembayaran SET kampanye_id = ?, diperbarui_pada = ?
       WHERE order_id = ? AND kampanye_id IS NULL AND status = 'lunas'`,
    )
    .run(kampanyeId, sekarang(), tiket.order_id)
  if (hasil.changes === 0) throw galatBelumBayar()
  return tiket.order_id
}

function galatBelumBayar() {
  return new GalatHttp(
    402,
    `Bayar biaya pasang kampanye ${rupiah(config.biayaPasang)} terlebih dahulu, lalu isi kampanye Anda.`,
    { biayaPasang: config.biayaPasang },
  )
}

/**
 * Bayar biaya pasang tanpa Midtrans (laptop, demo tanpa kunci). Ditutup
 * begitu Midtrans aktif: tanpa penutupan itu siapa pun bisa memanggil
 * endpoint ini langsung dan memasang kampanye tanpa membayar.
 */
export const bayarSimulasi = transaksional((umkmId) => {
  if (!biayaPasangAktif()) throw galat409('Biaya pasang kampanye sedang tidak berlaku.')
  if (midtransAktif()) {
    throw galat409('Biaya pasang dibayar lewat Midtrans. Buat tagihan lewat POST /api/pembayaran/biaya-pasang/tagihan.')
  }
  if (tiketTersedia(umkmId)) throw galat409('Biaya pasang sudah lunas. Lanjutkan mengisi kampanye Anda.')

  const orderId = `SIM-LBP-${umkmId.slice(0, 20)}-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
  const kini = sekarang()
  db.prepare(
    `INSERT INTO pembayaran
       (order_id, jenis, umkm_id, jumlah, status, metode, jenis_bayar, status_mentah, kedaluwarsa_pada)
     VALUES (?, 'biaya_pasang', ?, ?, 'lunas', 'simulasi', 'simulasi', 'settlement', ?)`,
  ).run(orderId, umkmId, config.biayaPasang, kini)
  kirimNotifikasi(umkmId, {
    jenis: 'dana',
    judul: 'Biaya pasang kampanye lunas',
    isi: `Pembayaran ${rupiah(config.biayaPasang)} (simulasi) diterima. Anda sekarang bisa mengisi dan menerbitkan satu kampanye.`,
    tautan: '/umkm/kampanye/baru',
  })
  return bentukTagihan(db.prepare('SELECT * FROM pembayaran WHERE order_id = ?').get(orderId))
})
