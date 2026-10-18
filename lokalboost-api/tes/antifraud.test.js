/**
 * Tes AI Anti-Fraud lapis 2 (deteksi lonjakan per jam).
 *
 * Versi awal menyaring SELURUH jam yang dianggap lonjakan. Di simulator,
 * 140 penonton asli ikut tersaring dan kreator dibayar Rp0: konten yang
 * benar-benar viral dihukum sebagai kecurangan. Yang dijaga di sini:
 * hanya kelebihan di atas batas wajar yang ditahan, bot yang sudah dibuang
 * lapis 1 tidak ikut menggelembungkan volume, dan menjalankannya berulang
 * tidak menahan lebih banyak.
 *
 * Jalankan: npm test
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

process.env.DB_PATH = path.join(os.tmpdir(), `lokalboost-af-${Date.now()}.db`)
process.env.NODE_ENV = 'test'
process.env.TURSO_DATABASE_URL = ''
// Setor dana simulasi. Midtrans diuji terpisah di midtrans.test.js.
process.env.MIDTRANS_SERVER_KEY = ''
process.env.AF_AMBANG_Z = '3'

const { db } = await import('../src/lib/db.js')
const { deteksiAnomali, ALASAN_ANTIFRAUD } = await import('../src/services/antifraud.js')

const K = 'kmp-af'
const V = 'vid-af'

db.prepare(
  "INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi) VALUES ('umkm_af','umkm','U','u@af.id','x',1)",
).run()
db.prepare(
  "INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi) VALUES ('krtr_af','kreator','K','k@af.id','x',1)",
).run()
db.prepare(
  `INSERT INTO kampanye (id, umkm_id, nama, kategori, lokasi, target_views, tarif_per_view,
                         anggaran, batas_maks_biaya, status, kreator_id)
   VALUES (?, 'umkm_af', 'Uji AF', 'Kuliner', 'Bandung', 100000, 10, 1000000, 1000000, 'berjalan', 'krtr_af')`,
).run(K)
db.prepare(
  "INSERT INTO lamaran (kampanye_id, kreator_id, jenis, status) VALUES (?, ?, 'undangan', 'disetujui') ON CONFLICT(kampanye_id, kreator_id) DO UPDATE SET status = 'disetujui'",
).run(K, 'krtr_af')
db.prepare(
  "INSERT INTO video (id, kampanye_id, kreator_id, judul, durasi_detik, status) VALUES (?, ?, 'krtr_af', 'V', 30, 'tayang')",
).run(V, K)

const sisip = db.prepare(
  `INSERT INTO tayangan (video_id, kampanye_id, ip_hash, durasi_tonton, waktu, valid, alasan, dibayar)
   VALUES (?, ?, ?, 20, ?, ?, ?, ?)`,
)

/** `jam` = jam ke berapa hari ini; tiap tayangan diberi menit berbeda. */
function isi(jam, jumlah, { valid = 1, alasan = null, dibayar = 0 } = {}) {
  for (let i = 0; i < jumlah; i++) {
    const waktu = `2026-09-01 ${String(jam).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`
    sisip.run(V, K, `ip-${jam}-${i}-${Math.random()}`, waktu, valid, alasan, dibayar)
  }
}

const hitung = (sql) => db.prepare(sql).get(K).n
const ditahan = () =>
  hitung(`SELECT COUNT(*) AS n FROM tayangan WHERE kampanye_id = ? AND valid = 0 AND alasan = '${ALASAN_ANTIFRAUD.LONJAKAN}'`)
const validJam = (jam) =>
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM tayangan WHERE kampanye_id = ? AND valid = 1 AND strftime('%H', waktu) = ?",
    )
    .get(K, String(jam).padStart(2, '0')).n

describe('AI Anti-Fraud lapis 2', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM tayangan WHERE kampanye_id = ?').run(K)
  })

  it('menahan hanya kelebihan lonjakan, bukan seluruh jam', () => {
    // Enam jam normal ~20 tayangan (sudah dibayar), lalu satu jam 200.
    for (const [jam, n] of [[1, 18], [2, 22], [3, 20], [4, 19], [5, 21], [6, 20]]) isi(jam, n, { dibayar: 1 })
    isi(7, 200)

    const hasil = deteksiAnomali(K, { terapkan: true })
    assert.equal(hasil.jamAnomali.length, 1)
    const { batasWajar } = hasil.jamAnomali[0]
    assert.ok(batasWajar > 20 && batasWajar < 200, `batas wajar harus di antara normal dan lonjakan, dapat ${batasWajar}`)

    assert.equal(hasil.tayanganDisaring, 200 - batasWajar)
    assert.equal(validJam(7), batasWajar, 'volume wajar di jam lonjakan tetap dibayar')
  })

  it('tidak menahan lebih banyak saat dijalankan berulang', () => {
    for (const [jam, n] of [[1, 18], [2, 22], [3, 20], [4, 19], [5, 21], [6, 20]]) isi(jam, n, { dibayar: 1 })
    isi(7, 200)

    const pertama = deteksiAnomali(K, { terapkan: true }).tayanganDisaring
    const kedua = deteksiAnomali(K, { terapkan: true }).tayanganDisaring
    assert.ok(pertama > 0)
    assert.equal(kedua, 0)
    assert.equal(ditahan(), pertama)
  })

  it('tidak menghitung bot yang sudah dibuang lapis 1 sebagai volume', () => {
    for (const [jam, n] of [[1, 18], [2, 22], [3, 20], [4, 19], [5, 21], [6, 20]]) isi(jam, n, { dibayar: 1 })
    // Jam 7: volume asli wajar, ditambah 300 bot yang sudah disaring lapis 1.
    isi(7, 21)
    isi(7, 300, { valid: 0, alasan: ALASAN_ANTIFRAUD.BOT })

    const hasil = deteksiAnomali(K, { terapkan: true })
    assert.equal(hasil.jamAnomali.length, 0, JSON.stringify(hasil.jamAnomali))
    assert.equal(validJam(7), 21)
  })

  it('tidak menahan ulang tayangan yang sudah dipulihkan admin', () => {
    for (const [jam, n] of [[1, 18], [2, 22], [3, 20], [4, 19], [5, 21], [6, 20]]) isi(jam, n, { dibayar: 1 })
    isi(7, 200)
    deteksiAnomali(K, { terapkan: true })

    // Banding dimenangkan kreator: semua yang ditahan dipulihkan.
    db.prepare(
      'UPDATE tayangan SET valid = 1, dipulihkan = 1 WHERE kampanye_id = ? AND valid = 0 AND alasan = ?',
    ).run(K, ALASAN_ANTIFRAUD.LONJAKAN)

    assert.equal(deteksiAnomali(K, { terapkan: true }).tayanganDisaring, 0)
    assert.equal(validJam(7), 200, 'keputusan manusia menang atas skor z')
  })
})
