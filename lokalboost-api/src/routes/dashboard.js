import { Router } from 'express'
import { db } from '../lib/db.js'
import { config } from '../config.js'
import { wajibPeran } from '../lib/auth.js'
import { bungkus } from '../lib/util.js'
import { ringkasanKreator, ringkasanUmkm } from '../services/laporan.js'
import { rekomendasiKampanye } from '../services/matchmaker.js'
import { bentukKampanye } from './kampanye.js'
import { daftarNotifikasi } from '../services/notifikasi.js'

export const rutaDashboard = Router()

/**
 * Satu panggilan untuk mengisi seluruh dashboard. Halaman dashboard UMKM
 * membutuhkan enam potong data sekaligus; menggabungkannya di sini menjaga
 * dasbor tetap di bawah target muat 3 detik (PRD §9) walau koneksi lambat.
 */
rutaDashboard.get(
  '/umkm',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const kampanye = db
      .prepare('SELECT * FROM kampanye WHERE umkm_id = ? ORDER BY dibuat_pada DESC')
      .all(req.pengguna.id)

    const perluTindakan = db
      .prepare(
        `SELECT COUNT(*) AS n FROM lamaran l
         JOIN kampanye k ON k.id = l.kampanye_id
         WHERE k.umkm_id = ? AND l.status = 'menunggu' AND l.jenis = 'undangan'`,
      )
      .get(req.pengguna.id).n

    res.json({
      ringkasan: ringkasanUmkm(req.pengguna.id),
      lamaranPerluDitinjau: perluTindakan,
      kampanye: kampanye.map((k) => bentukKampanye(k, { ringkas: true })),
      notifikasi: daftarNotifikasi(req.pengguna.id, { batas: 5 }),
    })
  }),
)

rutaDashboard.get(
  '/kreator',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const kampanyeSaya = db
      .prepare(`SELECT * FROM kampanye k WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui') ORDER BY k.dibuat_pada DESC`)
      .all(req.pengguna.id)

    const rekomendasi = rekomendasiKampanye(req.pengguna.id, { batas: 5 })

    res.json({
      ringkasan: ringkasanKreator(req.pengguna.id),
      kampanyeSaya: kampanyeSaya.map((k) => bentukKampanye(k, { ringkas: true })),
      rekomendasi: rekomendasi.map((k) => ({
        ...bentukKampanye(k, { ringkas: true }),
        kecocokan: k.kecocokan,
        alasan: k.alasan,
      })),
      notifikasi: daftarNotifikasi(req.pengguna.id, { batas: 5 }),
    })
  }),
)

/**
 * GET /api/dashboard/statistik-publik
 * Angka untuk landing page dan halaman testimoni. Semuanya dihitung
 * langsung dari basis data — tidak ada angka pemanis yang di-hardcode.
 */
/** Kampanye milik UMKM sungguhan (bukan akun contoh). */
const NYATA = 'JOIN pengguna pu ON pu.id = k.umkm_id WHERE pu.contoh = 0'

rutaDashboard.get(
  '/statistik-publik',
  bungkus((_req, res) => {
    const hitung = (sql, ...args) => db.prepare(sql).get(...args).n

    res.json({
      // Akun contoh (seed demo) tidak dihitung: angka di halaman depan harus
      // angka pengguna sungguhan, walau itu berarti nol.
      umkmTerdaftar: hitung("SELECT COUNT(*) AS n FROM pengguna WHERE peran = 'umkm' AND contoh = 0"),
      kreatorTerdaftar: hitung("SELECT COUNT(*) AS n FROM pengguna WHERE peran = 'kreator' AND contoh = 0"),
      kampanyeSelesai: hitung(`SELECT COUNT(*) AS n FROM kampanye k ${NYATA} AND k.status = 'selesai'`),
      kampanyeBerjalan: hitung(`SELECT COUNT(*) AS n FROM kampanye k ${NYATA} AND k.status = 'berjalan'`),
      totalTayanganAsli: hitung(
        `SELECT COUNT(*) AS n FROM tayangan t JOIN kampanye k ON k.id = t.kampanye_id ${NYATA} AND t.valid = 1`,
      ),
      totalTayanganDisaring: hitung(
        `SELECT COUNT(*) AS n FROM tayangan t JOIN kampanye k ON k.id = t.kampanye_id ${NYATA} AND t.valid = 0`,
      ),
      totalDanaTersalurkan: db.prepare(
        `SELECT COALESCE(SUM(t.nominal), 0) AS n FROM transaksi t
         JOIN pengguna p ON p.id = t.pengguna_id
         WHERE t.jenis = 'pencairan' AND p.contoh = 0`,
      ).get().n,
      rerataPenilaian: db.prepare(
        'SELECT AVG(u.bintang) AS n FROM ulasan u JOIN pengguna p ON p.id = u.penilai_id WHERE p.contoh = 0',
      ).get().n,
      // Persentase komisi adalah syarat layanan, bukan rahasia — halaman
      // Setor Dana harus bisa menyebutnya tanpa menebak.
      komisiPersen: config.komisiPersen,
    })
  }),
)
