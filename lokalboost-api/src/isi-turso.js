/**
 * Isi basis data Turso dengan data contoh, sekali saja.
 *
 * Menjalankan seed.js langsung ke Turso berarti ~40 ribu INSERT yang masing-
 * masing menempuh jaringan. Jadi seed dibangun di laptop dulu (snapshot-demo),
 * lalu barisnya dikirim ke Turso dalam batch.
 *
 * Build Vercel memanggilnya otomatis dengan --lewati-tanpa-turso: variabel
 * Turso dari integrasi bertanda Sensitive, jadi `vercel env pull` hanya
 * memberi "[SENSITIVE]" dan nilai aslinya cuma terbaca saat build.
 *
 * DI VERCEL, PEMERIKSAAN "SUDAH TERISI" DI BAWAH TIDAK PERNAH TERPICU.
 * Integrasi Turso memberi satu cabang database per deployment (host berawalan
 * `dpl-<id deployment>`), jadi tiap build memulai dari database kosong dan
 * selalu mengisi penuh. Artinya ISI_ULANG_TURSO tidak diperlukan untuk
 * "mereset produksi": deploy biasa sudah melakukannya. Yang perlu diingat
 * justru sebaliknya, data produksi tidak bertahan melewati deploy.
 *
 * Pemeriksaan itu tetap berguna saat skrip dijalankan manual dari laptop ke
 * satu database Turso yang tetap.
 *
 * Jalankan manual (butuh URL & token asli dari dasbor Turso):
 *   node src/snapshot-demo.js
 *   node --env-file=../.env.turso src/isi-turso.js          # tolak bila Turso sudah berisi
 *   node --env-file=../.env.turso src/isi-turso.js --timpa  # kosongkan Turso lebih dulu
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'libsql'
import { createClient } from '@libsql/client'

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const berkasLokal = path.join(akar, 'demo', 'lokalboost-demo.db')
const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL
const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN
// ISI_ULANG_TURSO=ya = --timpa lewat env. Praktis tidak berguna di Vercel
// (lihat catatan di atas: tiap deployment sudah dapat database kosong
// sendiri), tapi dipertahankan untuk pemakaian manual ke database tetap.
const timpa = process.argv.includes('--timpa') || process.env.ISI_ULANG_TURSO === 'ya'
const UKURAN_BATCH = 400

if (process.env.PAKAI_TURSO === 'false' && process.argv.includes('--lewati-tanpa-turso')) {
  console.log('[TURSO] PAKAI_TURSO=false, pengisian dilewati (mode demo).')
  process.exit(0)
}
if (!url && process.argv.includes('--lewati-tanpa-turso')) {
  console.log('[TURSO] TURSO_DATABASE_URL kosong, pengisian dilewati (mode demo).')
  process.exit(0)
}
if (!url) throw new Error('TURSO_DATABASE_URL belum diisi.')
if (!fs.existsSync(berkasLokal)) throw new Error(`Snapshot belum ada: jalankan dulu node src/snapshot-demo.js`)

const lokal = new Database(berkasLokal)
const turso = createClient({ url, authToken })

// Urutan pembuatan tabel di snapshot = urutan di schema.sql = urutan aman
// untuk kunci asing (induk selalu dibuat sebelum anak).
const tabel = lokal
  .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' ORDER BY rowid")
  .all()
const indeks = lokal
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL")
  .all()

// Penanda ditulis PALING AKHIR. Tabel pengguna berisi tapi penanda tidak ada
// berarti pengisian sebelumnya terputus di tengah: isinya tidak bisa dipercaya.
const PENANDA = 'isi_turso_selesai'
const ada = async (nama) =>
  Number((await turso.execute({ sql: "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?", args: [nama] })).rows[0].n) > 0

/**
 * Jejak kondisi awal, dicetak setiap build. Ini yang akhirnya menjelaskan
 * kenapa pengisian selalu berjalan penuh dan tidak pernah terlewat:
 * integrasi Turso di Vercel memberi SATU CABANG DATABASE PER DEPLOYMENT.
 * Host-nya berawalan `dpl-<id deployment>`, jadi setiap deployment memulai
 * dari database kosong dan pemeriksaan penanda di bawah tidak akan pernah
 * menemukan apa pun.
 *
 * Akibatnya: data yang dibuat di produksi hanya hidup selama deployment itu
 * masih yang aktif. Deploy berikutnya = database baru = kembali ke data
 * contoh. Untuk lomba ini justru diinginkan (juri selalu dapat data bersih),
 * tapi jangan sampai dikira bug data hilang.
 *
 * Hanya host yang dicetak, tidak pernah token.
 */
{
  const host = (() => {
    try {
      return new URL(url.replace(/^libsql:/, 'https:')).host
    } catch {
      return '(url tidak bisa diurai)'
    }
  })()
  const semua = await turso.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' ORDER BY name",
  )
  console.log(`[TURSO] host=${host}`)
  console.log(`[TURSO] tabel terlihat=${semua.rows.length}: ${semua.rows.map((r) => r.name).join(', ') || '(kosong)'}`)
  console.log(`[TURSO] ISI_ULANG_TURSO=${process.env.ISI_ULANG_TURSO || '(tidak diset)'} timpa=${timpa}`)
}

let bersihkan = timpa
if (await ada('pengguna')) {
  const isi = await turso.execute('SELECT COUNT(*) AS n FROM pengguna')
  if (await ada(PENANDA) && !timpa) {
    console.log(`[TURSO] Sudah berisi ${isi.rows[0].n} pengguna. Tambahkan --timpa untuk mengosongkan & mengisi ulang.`)
    process.exit(0)
  }
  if (!(await ada(PENANDA))) {
    console.log(`[TURSO] Ada tabel tapi penanda selesai tidak ada (${isi.rows[0].n} pengguna): pengisian lama terputus, diisi ulang.`)
    bersihkan = true
  }
}

if (bersihkan) {
  console.log('[TURSO] Menghapus tabel lama…')
  await turso.batch(
    [
      'PRAGMA foreign_keys = OFF',
      `DROP TABLE IF EXISTS ${PENANDA}`,
      ...[...tabel].reverse().map((t) => `DROP TABLE IF EXISTS ${t.name}`),
    ],
    'write',
  )
}

console.log(`[TURSO] Membuat ${tabel.length} tabel & ${indeks.length} indeks…`)
await turso.batch([...tabel.map((t) => t.sql), ...indeks.map((i) => i.sql)], 'write')

let total = 0
for (const { name } of tabel) {
  const baris = lokal.prepare(`SELECT * FROM ${name}`).all()
  if (!baris.length) continue
  const kolom = Object.keys(baris[0])
  const sql = `INSERT INTO ${name} (${kolom.join(', ')}) VALUES (${kolom.map(() => '?').join(', ')})`
  for (let i = 0; i < baris.length; i += UKURAN_BATCH) {
    const potong = baris.slice(i, i + UKURAN_BATCH)
    await turso.batch(
      potong.map((b) => ({ sql, args: kolom.map((k) => b[k]) })),
      'write',
    )
  }
  total += baris.length
  console.log(`[TURSO] ${name}: ${baris.length} baris`)
}

await turso.execute(`CREATE TABLE ${PENANDA} (waktu TEXT NOT NULL)`)
await turso.execute({ sql: `INSERT INTO ${PENANDA} (waktu) VALUES (?)`, args: [new Date().toISOString()] })

const cek = await turso.execute('SELECT COUNT(*) AS n FROM pengguna')
console.log(`[TURSO] Selesai: ${total} baris, ${cek.rows[0].n} pengguna di Turso.`)
lokal.close()
turso.close()
