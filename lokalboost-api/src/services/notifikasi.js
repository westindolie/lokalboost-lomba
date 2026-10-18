import { db } from '../lib/db.js'
import { waitUntil } from '@vercel/functions'
import { kirimSurelNotifikasi } from './surel.js'

/**
 * Satu-satunya jalan masuk untuk membuat notifikasi. Dipakai modul escrow,
 * lamaran, anti-fraud, dan sengketa supaya format pesannya konsisten dan
 * mudah diganti nanti bila ada kanal lain (email/WhatsApp).
 *
 * Opsi `email: true` mengirimkannya juga ke inbox. Nyalakan hanya untuk
 * kejadian yang pantas mengganggu orang — lamaran diputuskan, dana cair,
 * sengketa selesai. Notifikasi rutin cukup menunggu di dalam lonceng; inbox
 * yang penuh membuat semua email dari kita ikut diabaikan.
 */
export function kirimNotifikasi(penggunaId, { jenis, judul, isi, tautan = null, email = false }) {
  if (!penggunaId) return null
  const hasil = db
    .prepare(
      `INSERT INTO notifikasi (pengguna_id, jenis, judul, isi, tautan)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(penggunaId, jenis, judul, isi, tautan)

  if (email) {
    const tujuan = db.prepare('SELECT email FROM pengguna WHERE id = ?').get(penggunaId)?.email
    // Tembak dan lupakan, persis seperti kode OTP: notifikasinya sudah tercatat
    // di basis data, jadi SMTP yang rewel tidak boleh menggagalkan apa pun.
    if (tujuan) waitUntil(kirimSurelNotifikasi({ tujuan, judul, isi, tautan }))
  }

  return hasil.lastInsertRowid
}

export function daftarNotifikasi(penggunaId, { hanyaBaru = false, batas = 50 } = {}) {
  const filter = hanyaBaru ? 'AND baru = 1' : ''
  return db
    .prepare(
      `SELECT * FROM notifikasi
       WHERE pengguna_id = ? ${filter}
       ORDER BY dibuat_pada DESC, id DESC
       LIMIT ?`,
    )
    .all(penggunaId, batas)
}

export function tandaiTerbaca(penggunaId, id = null) {
  if (id) {
    return db.prepare('UPDATE notifikasi SET baru = 0 WHERE id = ? AND pengguna_id = ?').run(id, penggunaId)
  }
  return db.prepare('UPDATE notifikasi SET baru = 0 WHERE pengguna_id = ?').run(penggunaId)
}
