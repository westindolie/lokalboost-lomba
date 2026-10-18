import { Router } from 'express'
import { db } from '../lib/db.js'
import { wajibLogin } from '../lib/auth.js'
import { bungkus } from '../lib/util.js'
import { daftarNotifikasi, tandaiTerbaca } from '../services/notifikasi.js'

export const rutaNotifikasi = Router()

/** GET /api/notifikasi?hanyaBaru=true */
rutaNotifikasi.get(
  '/',
  wajibLogin,
  bungkus((req, res) => {
    const daftar = daftarNotifikasi(req.pengguna.id, {
      hanyaBaru: req.query.hanyaBaru === 'true',
      batas: Number(req.query.batas) || 50,
    })
    const belumDibaca = db
      .prepare('SELECT COUNT(*) AS n FROM notifikasi WHERE pengguna_id = ? AND baru = 1')
      .get(req.pengguna.id).n

    res.json({
      belumDibaca,
      notifikasi: daftar.map((n) => ({
        id: n.id,
        jenis: n.jenis,
        judul: n.judul,
        isi: n.isi,
        tautan: n.tautan,
        baru: Boolean(n.baru),
        waktu: n.dibuat_pada,
      })),
    })
  }),
)

/** POST /api/notifikasi/baca — tandai semua terbaca. */
rutaNotifikasi.post(
  '/baca',
  wajibLogin,
  bungkus((req, res) => {
    tandaiTerbaca(req.pengguna.id)
    res.json({ pesan: 'Semua notifikasi ditandai terbaca.' })
  }),
)

/** POST /api/notifikasi/:id/baca */
rutaNotifikasi.post(
  '/:id/baca',
  wajibLogin,
  bungkus((req, res) => {
    tandaiTerbaca(req.pengguna.id, Number(req.params.id))
    res.json({ pesan: 'Notifikasi ditandai terbaca.' })
  }),
)
