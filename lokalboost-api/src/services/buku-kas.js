import { db } from '../lib/db.js'
import { buatId } from '../lib/util.js'

/**
 * Dua tulisan dasar setiap pergerakan uang: baris riwayat dan saldo dompet.
 * Dipisah dari escrow.js supaya services/reward.js bisa memakainya tanpa
 * impor melingkar. Keduanya TIDAK membuka transaksi sendiri; pemanggil yang
 * membungkusnya dengan `transaksional`.
 */
export function catatTransaksi({ penggunaId, kampanyeId, jenis, arah, nominal, label }) {
  const id = buatId('trx')
  db.prepare(
    `INSERT INTO transaksi (id, pengguna_id, kampanye_id, jenis, arah, nominal, label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, penggunaId, kampanyeId, jenis, arah, nominal, label)
  return id
}

export function ubahSaldo(penggunaId, { saldo = 0, tertahan = 0 }) {
  db.prepare(
    `UPDATE dompet SET saldo = saldo + ?, saldo_tertahan = saldo_tertahan + ? WHERE pengguna_id = ?`,
  ).run(saldo, tertahan, penggunaId)
}
