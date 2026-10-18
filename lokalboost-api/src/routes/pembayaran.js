import { Router } from 'express'
import { db } from '../lib/db.js'
import { config } from '../config.js'
import { wajibLogin, wajibPeran } from '../lib/auth.js'
import { batasLaju } from '../lib/batas.js'
import { bungkus, galat403, galat404, wajibAda } from '../lib/util.js'
import {
  alamatSnapJs,
  bentukTagihan,
  buatTagihan,
  midtransAktif,
  sinkronkanTagihan,
  tanganiNotifikasi,
} from '../services/midtrans.js'

export const rutaPembayaran = Router()

/**
 * GET /api/pembayaran/konfigurasi
 * Publik: frontend perlu tahu apakah setor dana lewat Midtrans atau
 * simulasi, dan memuat snap.js dengan client key (client key memang
 * dirancang Midtrans untuk tampil di peramban; server key tidak pernah).
 */
rutaPembayaran.get('/konfigurasi', (_req, res) => {
  res.json({
    aktif: midtransAktif(),
    produksi: config.midtrans.produksi,
    clientKey: midtransAktif() ? config.midtrans.clientKey : null,
    snapJs: midtransAktif() ? alamatSnapJs() : null,
  })
})

/**
 * POST /api/pembayaran/notifikasi
 * Payment Notification URL di dashboard Midtrans. Tanpa login: yang
 * membuktikan pengirimnya adalah signature_key, dan status lunas tetap
 * diambil ulang dari API Midtrans.
 */
rutaPembayaran.post(
  '/notifikasi',
  // Per IP, bukan satu kunci global: kunci global membuat siapa pun bisa
  // menghabiskan jatah dan memblokir notifikasi Midtrans yang asli.
  batasLaju({ maks: 120, detik: 60, kunci: (req) => `notif-midtrans:${req.ip}` }),
  bungkus(async (req, res) => {
    const hasil = await tanganiNotifikasi(req.body)
    res.json({ ok: true, status: hasil.status || 'diabaikan' })
  }),
)

/** POST /api/pembayaran/tagihan — buat (atau pakai ulang) tagihan Snap. */
rutaPembayaran.post(
  '/tagihan',
  wajibPeran('umkm'),
  batasLaju({
    maks: 10,
    detik: 60,
    kunci: (req) => req.pengguna?.id && `tagihan:${req.pengguna.id}`,
    pesan: 'Terlalu banyak permintaan tagihan. Tunggu sebentar lalu coba lagi.',
  }),
  bungkus(async (req, res) => {
    const { kampanyeId } = wajibAda(req.body, ['kampanyeId'])
    const tagihan = await buatTagihan({ kampanyeId, umkm: req.pengguna, metode: req.body?.metode })
    res.status(tagihan.dipakaiUlang ? 200 : 201).json({ tagihan })
  }),
)

/**
 * POST /api/pembayaran/:orderId/cek
 * Tanyakan status ke Midtrans sekarang juga. Dipanggil frontend setelah
 * popup Snap ditutup, dan dari tombol "Cek status" untuk VA yang dibayar
 * belakangan. Hanya pemilik tagihan (atau admin) yang boleh.
 */
rutaPembayaran.post(
  '/:orderId/cek',
  wajibLogin,
  batasLaju({
    maks: 30,
    detik: 60,
    kunci: (req) => req.pengguna?.id && `cek-bayar:${req.pengguna.id}`,
  }),
  bungkus(async (req, res) => {
    const p = db.prepare('SELECT umkm_id, kampanye_id FROM pembayaran WHERE order_id = ?').get(req.params.orderId)
    if (!p) throw galat404('Tagihan tidak ditemukan.')
    if (p.umkm_id !== req.pengguna.id && req.pengguna.peran !== 'admin') throw galat403()

    const tagihan = await sinkronkanTagihan(req.params.orderId)
    const kampanye = db.prepare('SELECT id, status FROM kampanye WHERE id = ?').get(p.kampanye_id)
    res.json({ tagihan, kampanye })
  }),
)

/** GET /api/pembayaran/kampanye/:id — riwayat tagihan satu kampanye milik sendiri. */
rutaPembayaran.get(
  '/kampanye/:id',
  wajibLogin,
  bungkus((req, res) => {
    const k = db.prepare('SELECT umkm_id FROM kampanye WHERE id = ?').get(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id && req.pengguna.peran !== 'admin') throw galat403()
    const daftar = db
      .prepare('SELECT * FROM pembayaran WHERE kampanye_id = ? ORDER BY dibuat_pada DESC')
      .all(req.params.id)
    res.json({ tagihan: daftar.map(bentukTagihan) })
  }),
)
