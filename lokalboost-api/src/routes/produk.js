import fs from 'node:fs'
import { Router } from 'express'
import multer from 'multer'
import { db } from '../lib/db.js'
import { wajibPeran } from '../lib/auth.js'
import { bungkus, buatId, galat400, galat403, galat404, galat409, wajibAda } from '../lib/util.js'
import { pastikanTeks } from '../lib/validasi.js'
import { hapusFoto, simpanFoto } from '../lib/penyimpanan-video.js'
import { config } from '../config.js'
import { BATAS_FOTO_MB, isiBerkasFotoSah, unggahFoto } from './auth.js'

/**
 * Katalog produk UMKM, dipakai sebagai reward kampanye (services/reward.js).
 * Stok di sini = stok yang BELUM dialokasikan ke kampanye. Kuota reward
 * dipotong dari stok saat kampanye terbit dan sisanya kembali saat selesai.
 */
export const rutaProduk = Router()
rutaProduk.use(wajibPeran('umkm'))

const MAKS_PRODUK = 30

function bentukProduk(p) {
  const dipakai = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN kp.dialokasikan = 1 THEN kp.kuota - kp.terklaim ELSE 0 END), 0) AS dialokasikan
       FROM kampanye_produk kp WHERE kp.produk_id = ?`,
    )
    .get(p.id)
  return {
    id: p.id,
    nama: p.nama,
    foto: p.foto,
    nilai: p.nilai,
    stok: p.stok,
    dialokasikan: dipakai.dialokasikan,
    dibuatPada: p.dibuat_pada,
  }
}

function milikSaya(req) {
  const p = db.prepare('SELECT * FROM produk WHERE id = ?').get(req.params.id)
  if (!p) throw galat404('Produk tidak ditemukan.')
  if (p.umkm_id !== req.pengguna.id) throw galat403()
  return p
}

const angkaBulat = (n, label, maks) => {
  const v = Number(n)
  if (!Number.isInteger(v) || v < 0 || v > maks) {
    throw galat400(`${label} harus bilangan bulat 0 sampai ${maks.toLocaleString('id-ID')}.`)
  }
  return v
}

/** GET /api/produk — katalog milik UMKM yang login. */
rutaProduk.get(
  '/',
  bungkus((req, res) => {
    const daftar = db.prepare('SELECT * FROM produk WHERE umkm_id = ? ORDER BY dibuat_pada DESC').all(req.pengguna.id)
    res.json({ produk: daftar.map(bentukProduk) })
  }),
)

/** POST /api/produk  Body: { nama, nilai, stok } */
rutaProduk.post(
  '/',
  bungkus((req, res) => {
    const b = wajibAda(req.body, ['nama', 'nilai', 'stok'])
    const jumlah = db.prepare('SELECT COUNT(*) AS n FROM produk WHERE umkm_id = ?').get(req.pengguna.id).n
    if (jumlah >= MAKS_PRODUK) throw galat409(`Katalog maksimal ${MAKS_PRODUK} produk.`)
    const nama = pastikanTeks(b.nama, 'Nama produk', { min: 3, maks: 80 })
    const nilai = angkaBulat(b.nilai, 'Harga produk', 100_000_000)
    if (nilai < 1000) throw galat400('Harga produk minimal Rp 1.000.')
    const stok = angkaBulat(b.stok, 'Stok', 100_000)
    const id = buatId('prd')
    db.prepare('INSERT INTO produk (id, umkm_id, nama, nilai, stok) VALUES (?, ?, ?, ?, ?)').run(
      id,
      req.pengguna.id,
      nama,
      nilai,
      stok,
    )
    res.status(201).json({ pesan: 'Produk masuk katalog.', produk: bentukProduk(db.prepare('SELECT * FROM produk WHERE id = ?').get(id)) })
  }),
)

/** PATCH /api/produk/:id  Body: { nama?, nilai?, stok? } */
rutaProduk.patch(
  '/:id',
  bungkus((req, res) => {
    const p = milikSaya(req)
    const b = req.body || {}
    const nama = b.nama !== undefined ? pastikanTeks(b.nama, 'Nama produk', { min: 3, maks: 80 }) : p.nama
    const nilai = b.nilai !== undefined ? angkaBulat(b.nilai, 'Harga produk', 100_000_000) : p.nilai
    if (nilai < 1000) throw galat400('Harga produk minimal Rp 1.000.')
    const stok = b.stok !== undefined ? angkaBulat(b.stok, 'Stok', 100_000) : p.stok
    db.prepare('UPDATE produk SET nama = ?, nilai = ?, stok = ? WHERE id = ?').run(nama, nilai, stok, p.id)
    res.json({ pesan: 'Produk diperbarui.', produk: bentukProduk(db.prepare('SELECT * FROM produk WHERE id = ?').get(p.id)) })
  }),
)

/** POST /api/produk/:id/foto — multipart, kolom `foto`. */
rutaProduk.post(
  '/:id/foto',
  (req, res, next) => {
    try {
      milikSaya(req)
    } catch (e) {
      return next(e)
    }
    unggahFoto.single('foto')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(galat400(`Ukuran foto maksimal ${BATAS_FOTO_MB} MB.`))
      }
      next(err)
    })
  },
  bungkus(async (req, res) => {
    const p = milikSaya(req)
    const berkas = req.file
    if (!berkas) throw galat400('Pilih foto produk yang akan diunggah.')
    if (!isiBerkasFotoSah(berkas.path)) {
      fs.rmSync(berkas.path, { force: true })
      throw galat400('Berkas itu bukan foto JPG, PNG, atau WebP yang sah.')
    }
    const baru = await simpanFoto(berkas)
    db.prepare('UPDATE produk SET foto = ? WHERE id = ?').run(baru, p.id)
    if (p.foto && p.foto !== baru) {
      await hapusFoto(p.foto, config.folderUnggahan).catch((e) => console.warn(`[PRODUK] Foto lama gagal dihapus: ${e.message}`))
    }
    res.json({ pesan: 'Foto produk diperbarui.', produk: bentukProduk(db.prepare('SELECT * FROM produk WHERE id = ?').get(p.id)) })
  }),
)

/** DELETE /api/produk/:id — hanya produk yang belum pernah jadi reward. */
rutaProduk.delete(
  '/:id',
  bungkus(async (req, res) => {
    const p = milikSaya(req)
    const dipakai = db.prepare('SELECT 1 FROM kampanye_produk WHERE produk_id = ? LIMIT 1').get(p.id)
    if (dipakai) throw galat409('Produk ini sudah dipakai di kampanye. Ubah stoknya menjadi 0 bila tidak dijual lagi.')
    db.prepare('DELETE FROM produk WHERE id = ?').run(p.id)
    if (p.foto) await hapusFoto(p.foto, config.folderUnggahan).catch(() => {})
    res.json({ pesan: 'Produk dihapus dari katalog.' })
  }),
)
