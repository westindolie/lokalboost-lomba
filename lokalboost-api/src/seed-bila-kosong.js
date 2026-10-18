/**
 * Seed yang aman dijalankan setiap kali server produksi menyala.
 *
 * `seed.js` mengosongkan seluruh tabel lebih dulu — itu benar untuk
 * pengembangan, tapi di server ia akan menghapus akun sungguhan setiap
 * kali kontainer di-restart. Jadi di sini isinya diperiksa dulu: seed hanya
 * berjalan kalau basis datanya memang masih kosong.
 *
 * Jalankan: npm run seed:bila-kosong
 */
import { db } from './lib/db.js'

const { n } = db.prepare('SELECT COUNT(*) AS n FROM pengguna').get()

if (n > 0) {
  console.log(`[SEED] Dilewati — basis data sudah berisi ${n} pengguna.`)
} else {
  console.log('[SEED] Basis data kosong — mengisi data awal.')
  await import('./seed.js')
}
