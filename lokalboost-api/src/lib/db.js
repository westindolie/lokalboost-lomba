import Database from 'libsql'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { galat503 } from './util.js'

const dirIni = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.join(dirIni, '..', 'schema.sql')

/**
 * Satu koneksi untuk seluruh proses. Driver `libsql` memakai API sinkron yang
 * sama dengan better-sqlite3, jadi tidak ada pool koneksi yang perlu diurus
 * dan seluruh kelas bug async pada transaksi keuangan tetap tidak ada.
 *
 * Dua mode:
 *   - Lokal (bawaan): satu berkas SQLite di DB_PATH, persis seperti dulu.
 *   - Turso (TURSO_DATABASE_URL terisi): berkas lokal menjadi *replika* dari
 *     basis data di Turso. Tulis diteruskan ke Turso, baca dari replika.
 *     Dipakai di Vercel, tempat beberapa instance fungsi hidup bersamaan dan
 *     masing-masing dulu punya salinan SQLite sendiri — kampanye yang dibuat
 *     di satu instance "hilang" saat permintaan berikutnya jatuh ke instance
 *     lain. Dengan satu sumber di Turso, semua instance melihat data yang sama.
 */
export const pakaiTurso = process.env.PAKAI_TURSO !== 'false' && Boolean(config.turso.url)

export const db = pakaiTurso
  ? new Database(config.dbPath, { syncUrl: config.turso.url, authToken: config.turso.token })
  : new Database(config.dbPath)

if (pakaiTurso) {
  db.sync()
} else {
  db.pragma('journal_mode = WAL')
}
db.pragma('foreign_keys = ON')

/**
 * Tarik perubahan terbaru dari Turso sebelum melayani permintaan, supaya
 * instance ini melihat tulisan yang dibuat instance lain. No-op di mode lokal.
 */
export function segarkanReplika() {
  if (pakaiTurso) db.sync()
}

// Migrasi = jalankan schema.sql yang seluruhnya "CREATE TABLE IF NOT EXISTS".
db.exec(fs.readFileSync(schemaPath, 'utf8'))

/**
 * Kolom yang ditambahkan setelah basis data pengembangan terlanjur dibuat.
 * "CREATE TABLE IF NOT EXISTS" tidak menyentuh tabel yang sudah ada, jadi
 * kolom baru harus ditambahkan sendiri — kalau tidak, basis data lama akan
 * gagal di kueri yang menyebut kolomnya.
 */
function tambahKolomBila(tabel, kolom, definisi) {
  const ada = db.prepare(`PRAGMA table_info(${tabel})`).all().some((k) => k.name === kolom)
  if (!ada) db.exec(`ALTER TABLE ${tabel} ADD COLUMN ${kolom} ${definisi}`)
  return !ada
}

/**
 * `statistik_terukur` dibuat dengan CHECK platform yang hanya menerima TikTok
 * dan Instagram. SQLite tidak bisa mengubah CHECK, jadi tabel lama dibangun
 * ulang dan barisnya disalin. Basis data baru (Vercel/Turso) sudah benar dari
 * schema.sql dan tidak masuk ke sini.
 */
const sqlTerukur = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='statistik_terukur'").get()?.sql
if (sqlTerukur && !sqlTerukur.includes("'youtube'")) {
  db.exec('ALTER TABLE statistik_terukur RENAME TO statistik_terukur_lama')
  db.exec(fs.readFileSync(schemaPath, 'utf8'))
  db.exec('INSERT INTO statistik_terukur SELECT * FROM statistik_terukur_lama')
  db.exec('DROP TABLE statistik_terukur_lama')
}

tambahKolomBila('video', 'moderasi', "TEXT NOT NULL DEFAULT 'menunggu'")
tambahKolomBila('video', 'catatan_moderasi', 'TEXT')
tambahKolomBila('otp', 'percobaan', 'INTEGER NOT NULL DEFAULT 0')
tambahKolomBila('otp', 'tujuan', "TEXT NOT NULL DEFAULT 'verifikasi'")
tambahKolomBila('tayangan', 'dipulihkan', 'INTEGER NOT NULL DEFAULT 0')
tambahKolomBila('profil_kreator', 'foto', 'TEXT')
tambahKolomBila('profil_umkm', 'foto', 'TEXT')
tambahKolomBila('kampanye', 'gambar', 'TEXT')
tambahKolomBila('kampanye', 'gambar_kredit', 'TEXT')
tambahKolomBila('kampanye', 'moderasi_status', "TEXT NOT NULL DEFAULT 'belum'")
tambahKolomBila('kampanye', 'moderasi_hasil', 'TEXT')
tambahKolomBila('kampanye', 'moderasi_pada', 'TEXT')
tambahKolomBila('kampanye', 'diterbitkan_pada', 'TEXT')
tambahKolomBila('video', 'etika_hasil', 'TEXT')
tambahKolomBila('pengguna', 'contoh', 'INTEGER NOT NULL DEFAULT 0')

// Reward fleksibel + banyak kreator per kampanye (18 Okt 2026).
tambahKolomBila('kampanye', 'model_reward', "TEXT NOT NULL DEFAULT 'tunai'")
tambahKolomBila('kampanye', 'skema_tarif', "TEXT NOT NULL DEFAULT 'per_view'")
tambahKolomBila('kampanye', 'tarif_cpm', 'INTEGER')
tambahKolomBila('kampanye', 'ambang_views_tunai', 'INTEGER NOT NULL DEFAULT 0')
tambahKolomBila('kampanye', 'ambang_views_produk', 'INTEGER NOT NULL DEFAULT 0')
tambahKolomBila('kampanye', 'mode_pencairan', "TEXT NOT NULL DEFAULT 'per_milestone'")
tambahKolomBila('kampanye', 'kategori_lain', 'TEXT')
// Migrasi ini hanya menulis bila ada kampanye lama yang perlu diperbarui.
const perluWaktuTerbit = db.prepare(
  `SELECT 1 FROM kampanye WHERE diterbitkan_pada IS NULL
   AND status IN ('terbuka','mencari_kreator','berjalan','selesai') LIMIT 1`,
).get()
if (perluWaktuTerbit) {
  db.prepare(
    `UPDATE kampanye SET diterbitkan_pada = dibuat_pada
     WHERE diterbitkan_pada IS NULL AND status IN ('terbuka','mencari_kreator','berjalan','selesai')`,
  ).run()
}
const adaStatusLama = db.prepare("SELECT 1 FROM kampanye WHERE status IN ('terbuka','mencari_kreator') LIMIT 1").get()
if (adaStatusLama) db.prepare("UPDATE kampanye SET status = 'berjalan' WHERE status IN ('terbuka','mencari_kreator')").run()
for (const [kolom, def] of [
  ['sumber', "TEXT NOT NULL DEFAULT 'unggah'"],
  ['url', 'TEXT'],
  ['platform', 'TEXT'],
  ['platform_id', 'TEXT'],
  ['akun_penulis', 'TEXT'],
  ['views_awal', 'INTEGER'],
  ['views_platform', 'INTEGER'],
  ['views_diakui', 'INTEGER NOT NULL DEFAULT 0'],
  ['views_tertahan', 'INTEGER NOT NULL DEFAULT 0'],
  ['views_batas', 'INTEGER'],
  ['views_diukur_pada', 'TEXT'],
  ['kecocokan', 'TEXT'],
  ['kecocokan_hasil', 'TEXT'],
]) {
  tambahKolomBila('video', kolom, def)
}
// Biaya pasang kampanye memakai tabel pembayaran yang sama dengan setor Rekber.
// Indeksnya dibuat di sini, bukan di schema.sql: di basis data lama kolomnya
// baru ada setelah baris tambahKolomBila ini.
tambahKolomBila('pembayaran', 'jenis', "TEXT NOT NULL DEFAULT 'rekber'")
db.exec('CREATE INDEX IF NOT EXISTS idx_pembayaran_jenis ON pembayaran (umkm_id, jenis, status)')

let bukuBesarBaru = false
for (const kolom of ['views_terhitung', 'bruto_akrual', 'komisi_akrual', 'bersih_dicairkan', 'milestone_dicairkan', 'hangus']) {
  bukuBesarBaru = tambahKolomBila('lamaran', kolom, 'INTEGER NOT NULL DEFAULT 0') || bukuBesarBaru
}

/*
 * Peserta kampanye sekarang = lamaran 'disetujui'. Kampanye lama hanya
 * menyimpan kreatornya di kampanye.kreator_id, dan uangnya di escrow tanpa
 * rincian per kreator. Sekali saja (saat kolom buku besar baru dibuat), salin
 * keduanya ke baris lamaran supaya akrual dan pencairan lama tidak terulang.
 */
// Dicek dulu dengan SELECT: di Turso setiap tulisan adalah perjalanan jaringan,
// dan blok ini jalan di setiap cold start.
const pesertaHilang = db
  .prepare(
    `SELECT 1 FROM kampanye k WHERE k.kreator_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM lamaran l WHERE l.kampanye_id = k.id AND l.kreator_id = k.kreator_id AND l.status = 'disetujui')
     LIMIT 1`,
  )
  .get()
if (pesertaHilang) {
  db.exec(
    `INSERT OR IGNORE INTO lamaran (kampanye_id, kreator_id, jenis, status)
     SELECT id, kreator_id, 'undangan', 'disetujui' FROM kampanye WHERE kreator_id IS NOT NULL`,
  )
  db.exec(
    `UPDATE lamaran SET status = 'disetujui'
     WHERE status != 'disetujui'
       AND EXISTS (SELECT 1 FROM kampanye k WHERE k.id = lamaran.kampanye_id AND k.kreator_id = lamaran.kreator_id)`,
  )
}
if (bukuBesarBaru) {
  db.exec(
    `UPDATE lamaran SET
       bruto_akrual = (SELECT e.jumlah_dicairkan FROM escrow e WHERE e.kampanye_id = lamaran.kampanye_id),
       komisi_akrual = (SELECT e.komisi_platform FROM escrow e WHERE e.kampanye_id = lamaran.kampanye_id),
       views_terhitung = (SELECT COUNT(*) FROM tayangan t WHERE t.kampanye_id = lamaran.kampanye_id AND t.valid = 1 AND t.dibayar = 1)
     WHERE status = 'disetujui'
       AND EXISTS (SELECT 1 FROM kampanye k JOIN escrow e ON e.kampanye_id = k.id
                   WHERE k.id = lamaran.kampanye_id AND k.kreator_id = lamaran.kreator_id)`,
  )
  db.exec(
    `UPDATE lamaran SET bersih_dicairkan = bruto_akrual - komisi_akrual
     WHERE status = 'disetujui'
       AND EXISTS (SELECT 1 FROM kampanye k WHERE k.id = lamaran.kampanye_id AND k.status = 'selesai')`,
  )
}

/*
 * Ulasan dulu unik per (kampanye, penilai): satu kampanye satu kreator. Dengan
 * banyak kreator, UMKM perlu menilai masing-masing, jadi kuncinya ditambah
 * pihak yang dinilai. SQLite tidak bisa mengubah UNIQUE, tabel dibangun ulang.
 */
const sqlUlasan = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ulasan'").get()?.sql
if (sqlUlasan && !/UNIQUE\s*\(\s*kampanye_id\s*,\s*penilai_id\s*,\s*dinilai_id\s*\)/.test(sqlUlasan)) {
  db.exec('ALTER TABLE ulasan RENAME TO ulasan_lama')
  db.exec(fs.readFileSync(schemaPath, 'utf8'))
  db.exec(
    `INSERT INTO ulasan (id, kampanye_id, penilai_id, dinilai_id, peran_penilai, bintang, komentar, dibuat_pada)
     SELECT id, kampanye_id, penilai_id, dinilai_id, peran_penilai, bintang, komentar, dibuat_pada FROM ulasan_lama`,
  )
  db.exec('DROP TABLE ulasan_lama')
}

const SIBUK = /SQLITE_BUSY|database is locked/i
const jeda = new Int32Array(new SharedArrayBuffer(4))

/**
 * Jalankan `kerja` ulang bila Turso menolak karena ada penulis lain.
 *
 * Turso hanya menerima satu transaksi tulis pada satu waktu. Dua setoran
 * Rekber yang tiba bersamaan dari instance berbeda membuat yang kalah dibalas
 * SQLITE_BUSY (terukur: 2 dari 3 setoran paralel jadi galat 500). Transaksi
 * yang ditolak sudah dibatalkan, jadi aman diulang dari awal. Jedanya sinkron
 * karena seluruh jalur transaksi memang sinkron.
 *
 * Ada anggaran waktu total: lebih baik pengguna menerima "coba lagi" yang
 * jelas daripada fungsi Vercel diputus timeout 30 detik tanpa pesan.
 */
export function ulangiBilaSibuk(kerja, { percobaan = 8, anggaranMs = 8000, tidur, catat = () => {} } = {}) {
  const tidurMs = tidur || ((ms) => Atomics.wait(jeda, 0, 0, ms))
  const mulai = Date.now()
  for (let ke = 1; ; ke++) {
    try {
      return kerja()
    } catch (err) {
      if (!SIBUK.test(String(err?.message || err))) throw err
      const tunggu = Math.min(1000, 50 * 2 ** (ke - 1)) + Math.floor(Math.random() * 50)
      if (ke >= percobaan || Date.now() - mulai + tunggu > anggaranMs) {
        catat(`menyerah setelah ${ke} percobaan (${Date.now() - mulai} ms)`)
        throw galat503('Server sedang memproses transaksi lain. Coba lagi beberapa detik lagi.')
      }
      catat(`percobaan ke-${ke} ditolak, ulang dalam ${tunggu} ms`)
      tidurMs(tunggu)
    }
  }
}

/**
 * Bungkus fungsi dalam transaksi SQLite (atomik untuk operasi uang).
 *
 * BEGIN IMMEDIATE mengambil kunci tulis di awal. Bila Turso sedang dipakai
 * penulis lain, yang ditolak adalah BEGIN itu sendiri, sebelum satu baris pun
 * ditulis, sehingga mengulang selalu aman.
 *
 * Tidak memakai db.transaction(): pada driver libsql, ROLLBACK di sana ikut
 * melempar galat bila Turso sudah membatalkan transaksinya sendiri, dan galat
 * itu menutupi SQLITE_BUSY yang asli sehingga tidak bisa dikenali untuk diulang.
 * Replika juga TIDAK disinkron di tengah percobaan ulang: pada percobaan
 * sebelumnya itu membuat permintaan menggantung sampai timeout Vercel.
 */
export const transaksional = (fn) => (...args) =>
  ulangiBilaSibuk(
    () => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const hasil = fn(...args)
        db.exec('COMMIT')
        return hasil
      } catch (err) {
        try {
          db.exec('ROLLBACK')
        } catch (galatRollback) {
          console.warn(`[SIBUK] ROLLBACK gagal (inTransaction=${db.inTransaction}): ${galatRollback.message}`)
        }
        throw err
      }
    },
    { catat: (pesan) => console.warn(`[SIBUK] ${pesan}`) },
  )

/** Kosongkan seluruh isi tabel — dipakai seed.js dan berkas tes. */
export function kosongkanSemua() {
  const tabel = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
  db.pragma('foreign_keys = OFF')
  for (const { name } of tabel) db.prepare(`DELETE FROM ${name}`).run()
  db.pragma('foreign_keys = ON')
}
