import { Router } from 'express'
import { db } from '../lib/db.js'
import { wajibLogin } from '../lib/auth.js'
import { bungkus, galat400, galat403, galat404, galat409, wajibAda } from '../lib/util.js'
import { kirimNotifikasi } from '../services/notifikasi.js'
import { periksaTeksPublik } from '../services/moderasi-kampanye.js'
import { adalahPeserta, pesertaKampanye } from '../services/reward.js'

export const rutaUlasan = Router()

/**
 * Sistem Rating & Review dua arah (PRD §8.1).
 * Ulasan hanya bisa ditulis oleh dua pihak yang benar-benar terlibat dalam
 * satu kampanye yang sudah selesai — ini yang membuat rating di LokalBoost
 * tidak bisa diisi akun palsu, dan karenanya layak dipakai AI Matchmaker
 * sebagai komponen skor.
 */
rutaUlasan.post(
  '/',
  wajibLogin,
  bungkus(async (req, res) => {
    const b = wajibAda(req.body, ['kampanyeId', 'bintang'])
    const bintang = Number(b.bintang)
    if (!Number.isInteger(bintang) || bintang < 1 || bintang > 5) {
      throw galat400('Penilaian harus berupa bintang 1 sampai 5.')
    }

    const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(b.kampanyeId)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.status !== 'selesai') throw galat409('Ulasan baru bisa ditulis setelah kampanye selesai.')

    const sayaUmkm = k.umkm_id === req.pengguna.id
    const sayaKreator = adalahPeserta(k.id, req.pengguna.id)
    if (!sayaUmkm && !sayaKreator) throw galat403('Anda tidak terlibat dalam kampanye ini.')

    // Satu kampanye bisa banyak kreator: UMKM menilai masing-masing, jadi
    // kreator yang dinilai disebut. Bila hanya satu, boleh tidak disebut.
    let dinilaiId = k.umkm_id
    if (sayaUmkm) {
      const peserta = pesertaKampanye(k.id).map((p) => p.kreator_id)
      dinilaiId = b.dinilaiId || (peserta.length === 1 ? peserta[0] : null)
      if (!dinilaiId) {
        throw galat400(peserta.length ? 'Pilih kreator yang ingin Anda nilai.' : 'Tidak ada kreator untuk dinilai pada kampanye ini.')
      }
      if (!peserta.includes(dinilaiId)) throw galat400('Kreator itu bukan peserta kampanye ini.')
    }

    const sudah = db
      .prepare('SELECT id FROM ulasan WHERE kampanye_id = ? AND penilai_id = ? AND dinilai_id = ?')
      .get(k.id, req.pengguna.id, dinilaiId)
    if (sudah) throw galat409('Anda sudah memberi ulasan untuk kampanye ini.')

    const komentar = String(b.komentar ?? '').trim().slice(0, 1000) || null
    // Ulasan boleh keras kepada mitra kampanye, tapi tidak boleh dipakai
    // menyerang pihak ketiga. Yang jelas menyerang ditolak; yang samar masuk
    // antrean admin setelah tersimpan.
    const periksa = komentar ? await periksaTeksPublik({ jenis: 'ulasan', penggunaId: req.pengguna.id, teks: komentar }) : null

    const simpan = db
      .prepare(
        `INSERT INTO ulasan (kampanye_id, penilai_id, dinilai_id, peran_penilai, bintang, komentar)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(k.id, req.pengguna.id, dinilaiId, sayaUmkm ? 'umkm' : 'kreator', bintang, komentar)
    periksa?.tandai(simpan.lastInsertRowid)

    kirimNotifikasi(dinilaiId, {
      jenis: 'ulasan',
      judul: 'Anda menerima ulasan baru',
      isi: `${req.pengguna.nama} memberi Anda ${bintang} bintang untuk kampanye "${k.nama}".`,
      tautan: `/kampanye/${k.id}/ulasan`,
    })

    res.status(201).json({ pesan: 'Terima kasih, ulasan Anda tersimpan.' })
  }),
)

/** GET /api/ulasan?penggunaId=... atau ?kampanyeId=... */
rutaUlasan.get(
  '/',
  bungkus((req, res) => {
    const { penggunaId, kampanyeId } = req.query
    const syarat = []
    const nilai = []
    if (penggunaId) {
      syarat.push('u.dinilai_id = ?')
      nilai.push(penggunaId)
    }
    if (kampanyeId) {
      syarat.push('u.kampanye_id = ?')
      nilai.push(kampanyeId)
    }
    const where = syarat.length ? `WHERE ${syarat.join(' AND ')}` : ''

    const daftar = db
      .prepare(
        `SELECT u.*, p.nama AS penilai, k.nama AS kampanye
         FROM ulasan u
         JOIN pengguna p ON p.id = u.penilai_id
         JOIN kampanye k ON k.id = u.kampanye_id
         ${where}
         ORDER BY u.dibuat_pada DESC LIMIT 100`,
      )
      .all(...nilai)

    const rerata = daftar.length ? daftar.reduce((a, u) => a + u.bintang, 0) / daftar.length : null

    res.json({
      jumlah: daftar.length,
      rerata: rerata === null ? null : Number(rerata.toFixed(2)),
      ulasan: daftar.map((u) => ({
        id: u.id,
        kampanyeId: u.kampanye_id,
        kampanye: u.kampanye,
        penilai: u.penilai,
        peranPenilai: u.peran_penilai,
        bintang: u.bintang,
        komentar: u.komentar,
        dibuatPada: u.dibuat_pada,
      })),
    })
  }),
)

/** GET /api/ulasan/tertunda — kampanye selesai yang belum saya ulas. */
rutaUlasan.get(
  '/tertunda',
  wajibLogin,
  bungkus((req, res) => {
    const daftar = db
      .prepare(
        `SELECT k.* FROM kampanye k
         WHERE k.status = 'selesai'
           AND (k.umkm_id = ? OR EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui'))`,
      )
      .all(req.pengguna.id, req.pengguna.id)

    // Satu baris per pihak yang belum dinilai: UMKM bisa punya banyak kreator.
    const tertunda = []
    for (const k of daftar) {
      const pihak = k.umkm_id === req.pengguna.id ? pesertaKampanye(k.id).map((p) => p.kreator_id) : [k.umkm_id]
      for (const pihakLain of pihak) {
        const sudah = db
          .prepare('SELECT 1 FROM ulasan WHERE kampanye_id = ? AND penilai_id = ? AND dinilai_id = ?')
          .get(k.id, req.pengguna.id, pihakLain)
        if (!sudah) tertunda.push({ kampanyeId: k.id, nama: k.nama, selesaiPada: k.selesai_pada, pihakLain })
      }
    }
    res.json({ tertunda })
  }),
)
