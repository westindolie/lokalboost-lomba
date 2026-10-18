/**
 * Bangun basis data demo siap salin untuk Vercel Function.
 *
 * Vercel tidak punya disk permanen: hanya /tmp yang bisa ditulis, dan isinya
 * hilang saat instance tidur. Jadi saat build kita isi satu berkas SQLite
 * dengan data seed, lalu api/index.js menyalinnya ke /tmp setiap cold start.
 * Menyalin satu berkas jauh lebih cepat daripada menjalankan seed (~28 ribu
 * tayangan) di tengah permintaan pertama pengguna.
 *
 * Jalankan: npm run snapshot-demo   (dipanggil otomatis oleh build Vercel)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tujuan = path.join(akar, 'demo', 'lokalboost-demo.db')

fs.mkdirSync(path.dirname(tujuan), { recursive: true })
for (const akhiran of ['', '-wal', '-shm']) fs.rmSync(tujuan + akhiran, { force: true })

// db.js membuka DB_PATH saat diimpor, jadi env harus terpasang lebih dulu.
process.env.DB_PATH = tujuan
// Snapshot selalu berkas lokal murni. Saat build Vercel env Turso ikut terbaca,
// dan tanpa baris ini db.js masuk mode replika: seed menulis puluhan ribu
// baris satu per satu lewat jaringan ke Turso (build tertahan belasan menit).
for (const k of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'LIBSQL_URL', 'LIBSQL_AUTH_TOKEN']) delete process.env[k]
const mulai = Date.now()
await import('./seed.js')
const { db } = await import('./lib/db.js')

// Satu berkas utuh tanpa pendamping -wal, supaya cukup disalin satu kali.
db.pragma('wal_checkpoint(TRUNCATE)')
db.pragma('journal_mode = DELETE')
db.exec('VACUUM')
db.close()

const mb = (fs.statSync(tujuan).size / 1024 / 1024).toFixed(1)
console.log(`[SNAPSHOT] ${tujuan} (${mb} MB) selesai dalam ${Date.now() - mulai} ms`)
