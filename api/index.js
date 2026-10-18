/**
 * LokalBoost API sebagai Vercel Function ("mode demo").
 *
 * Seluruh rute tetap dilayani oleh buatApp() yang sama dengan server biasa;
 * berkas ini hanya menyiapkan tempat tinggalnya di lingkungan serverless:
 *
 *   - Satu-satunya folder yang bisa ditulis adalah /tmp, dan isinya hilang
 *     saat instance tidur atau di-deploy ulang. Maka setiap cold start
 *     menyalin basis data demo hasil build (lokalboost-api/demo/) ke /tmp.
 *     Akun & kampanye baru bertahan selama instance hidup, lalu kembali ke
 *     data contoh. Itu batasan yang disadari untuk keperluan lomba.
 *   - Video unggahan juga tinggal di /tmp dengan umur yang sama.
 *
 * Untuk data permanen, jalankan lokalboost-api di server ber-disk (lihat
 * DEPLOY.md), bukan berkas ini.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const snapshot = path.join(akar, 'lokalboost-api', 'demo', 'lokalboost-demo.db')

// Diset di sini, bukan di panel Vercel: NODE_ENV=production pada tahap build
// membuat `npm ci` melewati devDependencies dan build Vite gagal.
process.env.NODE_ENV ||= 'production'
process.env.FOLDER_UNGGAHAN ||= '/tmp/unggahan'

const pakaiTurso =
  process.env.PAKAI_TURSO !== 'false' &&
  Boolean(process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL)

if (pakaiTurso) {
  // Data asli tinggal di Turso; berkas di /tmp hanya replika yang disinkron
  // di awal setiap permintaan (lihat lib/db.js dan app.js).
  process.env.DB_PATH ||= '/tmp/lokalboost-replika.db'
} else {
  // Tanpa Turso: tiap instance memakai salinan data contoh sendiri. Tulisan
  // bisa tidak terlihat oleh instance lain, jadi frontend memasang pita demo.
  process.env.DB_PATH ||= '/tmp/lokalboost.db'
  process.env.MODE_DEMO = 'true'
  if (!fs.existsSync(process.env.DB_PATH)) {
    fs.copyFileSync(snapshot, process.env.DB_PATH)
  }
}

// Diimpor SETELAH DB_PATH terpasang: lib/db.js membuka basis data saat diimpor.
const { periksaProduksi } = await import('../lokalboost-api/src/config.js')
const { buatApp } = await import('../lokalboost-api/src/app.js')

const { fatal, peringatan } = periksaProduksi()
for (const p of peringatan) console.warn(`[PERINGATAN] ${p}`)
// process.exit() di serverless hanya menghasilkan galat 500 tanpa sebab yang
// terbaca. Melempar galat membuat alasannya muncul di log fungsi Vercel.
if (fatal.length) throw new Error(fatal.join(' '))

export default buatApp()
