import { Router } from 'express'
import { db } from '../lib/db.js'
import { wajibLogin, wajibPeran } from '../lib/auth.js'
import { bungkus, galat403, galat404, galat409, sekarang, wajibAda } from '../lib/util.js'
import { batalkanPenyaringan, laporanAntiFraud } from '../services/antifraud.js'
import { bayarPemulihan } from '../services/escrow.js'
import { statistikKampanye } from '../services/laporan.js'
import { kirimNotifikasi } from '../services/notifikasi.js'
import { pesertaKampanye, terlibatKampanye } from '../services/reward.js'

/** UMKM + semua kreator peserta: pihak yang perlu tahu tentang sengketa kampanye. */
const pihakKampanye = (k) => [k.umkm_id, ...pesertaKampanye(k.id).map((p) => p.kreator_id)]

export const rutaSengketa = Router()

/**
 * Manajemen Dispute (PRD §8.1) + mekanisme banding atas penyaringan AI
 * (PRD §15). Mitigasi risiko di PRD §12 menyebutkan "bukti otomatis dari
 * sistem tracking views sebagai dasar keputusan" — karena itu setiap
 * sengketa yang dibuat langsung membawa cuplikan data tayangan saat itu,
 * supaya keputusan tidak bergantung pada ingatan siapa pun.
 */

const KATEGORI = [
  'video_tidak_sesuai_brief',
  'kreator_tidak_menyelesaikan',
  'penyaringan_anti_fraud_keliru',
  'pembayaran_tidak_sesuai',
  'lainnya',
]

/** Sengketa yang masih menunggu keputusan admin. */
const STATUS_BERJALAN = ['terbuka', 'ditinjau']

/** POST /api/sengketa */
rutaSengketa.post(
  '/',
  wajibLogin,
  bungkus((req, res) => {
    const b = wajibAda(req.body, ['kampanyeId', 'kategori', 'alasan'])
    const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(b.kampanyeId)
    if (!k) throw galat404('Kampanye tidak ditemukan.')

    const terlibat = terlibatKampanye(k, req.pengguna.id)
    if (!terlibat) throw galat403('Hanya pihak yang terlibat kampanye yang bisa mengajukan sengketa.')

    // Satu pihak hanya boleh punya satu sengketa berjalan per kampanye.
    // Tanpa ini, satu klik ganda atau kreator yang tidak sabar bisa membuat
    // antrean admin penuh duplikat untuk perkara yang sama.
    const berjalan = db
      .prepare(
        `SELECT id, status FROM sengketa
         WHERE kampanye_id = ? AND pengaju_id = ? AND status IN (${STATUS_BERJALAN.map(() => '?').join(',')})
         ORDER BY dibuat_pada DESC LIMIT 1`,
      )
      .get(k.id, req.pengguna.id, ...STATUS_BERJALAN)
    if (berjalan) {
      throw galat409(
        `Sengketa Anda untuk kampanye ini masih ${berjalan.status === 'ditinjau' ? 'ditinjau' : 'terbuka'} (#${berjalan.id}). Tunggu keputusannya sebelum mengajukan lagi.`,
      )
    }

    const kategori = KATEGORI.includes(b.kategori) ? b.kategori : 'lainnya'

    // Bukti otomatis: potret angka anti-fraud pada saat sengketa diajukan.
    const bukti = JSON.stringify({
      dipotretPada: sekarang(),
      antiFraud: laporanAntiFraud(k.id),
      statusKampanye: k.status,
    })

    const hasil = db
      .prepare(
        `INSERT INTO sengketa (kampanye_id, pengaju_id, kategori, alasan, bukti)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(k.id, req.pengguna.id, kategori, b.alasan, bukti)

    // UMKM yang mengajukan: semua kreator peserta diberi tahu, karena
    // sengketa terbuka menahan pencairan reward seluruh kampanye.
    for (const pihak of pihakKampanye(k).filter((id) => id !== req.pengguna.id)) {
      kirimNotifikasi(pihak, {
        jenis: 'sengketa',
        judul: 'Ada sengketa pada kampanye Anda',
        isi: `${req.pengguna.nama} mengajukan sengketa untuk "${k.nama}". Tim LokalBoost akan meninjau.`,
        tautan: '/dispute',
      })
    }

    res.status(201).json({
      pesan: 'Sengketa tercatat. Admin LokalBoost akan meninjaunya dengan bukti data tayangan.',
      sengketaId: hasil.lastInsertRowid,
    })
  }),
)

/** GET /api/sengketa — milik saya; admin melihat semuanya. */
rutaSengketa.get(
  '/',
  wajibLogin,
  bungkus((req, res) => {
    const admin = req.pengguna.peran === 'admin'
    const daftar = admin
      ? db
          .prepare(
            `SELECT s.*, k.nama AS nama_kampanye, p.nama AS nama_pengaju
             FROM sengketa s
             JOIN kampanye k ON k.id = s.kampanye_id
             JOIN pengguna p ON p.id = s.pengaju_id
             ORDER BY s.dibuat_pada DESC`,
          )
          .all()
      : db
          .prepare(
            `SELECT s.*, k.nama AS nama_kampanye, p.nama AS nama_pengaju
             FROM sengketa s
             JOIN kampanye k ON k.id = s.kampanye_id
             JOIN pengguna p ON p.id = s.pengaju_id
             WHERE k.umkm_id = ? OR EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui')
             ORDER BY s.dibuat_pada DESC`,
          )
          .all(req.pengguna.id, req.pengguna.id)

    res.json({
      sengketa: daftar.map((s) => ({
        id: s.id,
        kampanyeId: s.kampanye_id,
        namaKampanye: s.nama_kampanye,
        pengaju: s.nama_pengaju,
        kategori: s.kategori,
        alasan: s.alasan,
        status: s.status,
        keputusan: s.keputusan,
        bukti: s.bukti ? JSON.parse(s.bukti) : null,
        dibuatPada: s.dibuat_pada,
        diputusPada: s.diputus_pada,
      })),
    })
  }),
)

/** GET /api/sengketa/:id — rincian lengkap plus data tayangan terkini. */
rutaSengketa.get(
  '/:id',
  wajibLogin,
  bungkus((req, res) => {
    const s = db.prepare('SELECT * FROM sengketa WHERE id = ?').get(req.params.id)
    if (!s) throw galat404('Sengketa tidak ditemukan.')

    const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(s.kampanye_id)
    const boleh =
      req.pengguna.peran === 'admin' || terlibatKampanye(k, req.pengguna.id)
    if (!boleh) throw galat403()

    const disaring = db
      .prepare(
        `SELECT alasan, COUNT(*) AS jumlah FROM tayangan
         WHERE kampanye_id = ? AND valid = 0 GROUP BY alasan`,
      )
      .all(s.kampanye_id)

    res.json({
      sengketa: {
        id: s.id,
        kampanyeId: s.kampanye_id,
        kategori: s.kategori,
        alasan: s.alasan,
        status: s.status,
        keputusan: s.keputusan,
        buktiSaatDiajukan: s.bukti ? JSON.parse(s.bukti) : null,
        dibuatPada: s.dibuat_pada,
      },
      dataTerkini: statistikKampanye(s.kampanye_id),
      rincianPenyaringan: disaring,
    })
  }),
)

/**
 * POST /api/sengketa/:id/putuskan
 * Keputusan admin. Bila memihak kreator pada kasus penyaringan keliru,
 * tayangan yang tersaring dengan alasan tertentu dipulihkan dan langsung
 * ikut diperhitungkan pada pencairan berikutnya.
 */
rutaSengketa.post(
  '/:id/putuskan',
  wajibPeran('admin'),
  bungkus((req, res) => {
    const s = db.prepare('SELECT * FROM sengketa WHERE id = ?').get(req.params.id)
    if (!s) throw galat404('Sengketa tidak ditemukan.')

    const b = wajibAda(req.body, ['status', 'keputusan'])
    db.prepare('UPDATE sengketa SET status = ?, keputusan = ?, diputus_pada = ? WHERE id = ?').run(
      b.status,
      b.keputusan,
      sekarang(),
      s.id,
    )

    // Banding yang dimenangkan kreator harus langsung berbunyi di dompetnya.
    // Memulihkan tayangan tanpa mencairkannya berarti keputusan ini baru
    // terasa saat kampanye ditutup — kadang berminggu-minggu kemudian.
    let pemulihan = null
    if (b.pulihkanAlasan) {
      pemulihan = batalkanPenyaringan(s.kampanye_id, b.pulihkanAlasan)
      if (pemulihan.dipulihkan > 0) {
        pemulihan.pencairan = bayarPemulihan(s.kampanye_id)
      }
    }

    const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(s.kampanye_id)
    for (const pihak of pihakKampanye(k)) {
      kirimNotifikasi(pihak, {
        jenis: 'sengketa',
        judul: 'Sengketa sudah diputuskan',
        isi: `Keputusan untuk kampanye "${k.nama}": ${b.keputusan}`,
        tautan: '/dispute',
        email: true,
      })
    }

    res.json({ pesan: 'Keputusan tersimpan.', ...(pemulihan ? { pemulihan } : {}) })
  }),
)

/** GET /api/sengketa/meta/kategori — daftar kategori untuk form di klien. */
rutaSengketa.get('/meta/kategori', (_req, res) => res.json({ kategori: KATEGORI }))
