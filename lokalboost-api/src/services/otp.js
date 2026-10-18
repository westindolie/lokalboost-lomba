import { db } from '../lib/db.js'
import { buatKodeOtp } from '../lib/auth.js'
import { galat400, galat429, sekarang } from '../lib/util.js'
import { waitUntil } from '@vercel/functions'
import { kirimKodeOtp, surelAktif, tampakEmail } from './surel.js'

/**
 * Kode sekali pakai — satu tempat untuk semua jalur yang memakainya.
 * ------------------------------------------------------------------
 * Isi berkas ini dipindahkan apa adanya dari routes/auth.js. Alasannya bukan
 * kerapian: jalur penarikan dana dulu punya "2FA" sendiri yang cuma memeriksa
 * kodenya tidak kosong, karena seluruh pagar yang benar terkunci di dalam
 * berkas rute auth. Dengan modul ini, setiap jalur baru mewarisi semuanya
 * tanpa perlu menulis ulang — dan tidak ada lagi kesempatan menulis versi
 * yang lebih longgar tanpa sadar.
 *
 * Pagar yang berlaku (jangan dilonggarkan tanpa alasan yang ditulis):
 *   - jeda 60 detik antar kode dan maksimal 5 kode per identitas per jam,
 *     keduanya dihitung dari tabel `otp` supaya restart server tidak
 *     menghapusnya;
 *   - 5 tebakan salah menghanguskan kodenya;
 *   - baris dicari lewat identitas + tujuan saja, TIDAK pernah lewat kodenya.
 */

export const MENIT_OTP = 10
/** Jeda minimal antar permintaan kode untuk satu identitas yang sama. */
const JEDA_KIRIM_DETIK = 60
/** Berapa kode boleh terbit untuk satu identitas dalam satu jam. */
const MAKS_KODE_PER_JAM = 5
/** Tebakan salah sebelum kodenya dihanguskan. */
const MAKS_PERCOBAAN = 5

/**
 * Untuk apa kode itu diterbitkan. Tanpa pemisahan ini, kode yang diminta
 * seseorang untuk masuk bisa dipakai ulang untuk mencairkan uangnya —
 * dua tindakan dengan taruhan yang sama sekali berbeda.
 */
export const TUJUAN = {
  VERIFIKASI: 'verifikasi',
  PENARIKAN: 'penarikan',
  RESET: 'reset',
}

/**
 * Pagar penerbitan kode.
 *
 * Kuota dan jedanya sengaja dihitung lintas tujuan, bukan per tujuan: yang
 * dilindungi di sini adalah inbox seseorang, dan inbox tidak peduli kode itu
 * untuk masuk atau untuk menarik dana. Menghitungnya per tujuan berarti
 * kuotanya berlipat sebanyak jumlah tujuan yang kita punya.
 *
 * `paksa` melewati jeda 60 detik — dipakai jalur pendaftaran, di mana kode
 * pertama memang harus terbit saat itu juga. Kuota per jam tetap berlaku,
 * karena justru itu yang menahan seseorang membanjiri inbox orang lain.
 */
function pastikanBolehKirim(identitas, { paksa = false } = {}) {
  const jamLalu = new Date(Date.now() - 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
  const { jumlah, terakhir } = db
    .prepare(
      `SELECT COUNT(*) AS jumlah, MAX(dibuat_pada) AS terakhir
       FROM otp WHERE identitas = ? AND dibuat_pada > ?`,
    )
    .get(identitas, jamLalu)

  if (jumlah >= MAKS_KODE_PER_JAM) {
    throw galat429('Sudah terlalu banyak kode diminta untuk akun ini. Coba lagi satu jam lagi.')
  }
  if (paksa || !terakhir) return

  const lewat = Math.floor((Date.now() - new Date(`${terakhir.replace(' ', 'T')}Z`).getTime()) / 1000)
  if (lewat < JEDA_KIRIM_DETIK) {
    throw galat429(`Tunggu ${JEDA_KIRIM_DETIK - lewat} detik lagi sebelum meminta kode baru.`)
  }
}

/**
 * Terbitkan OTP baru dan batalkan yang lama untuk identitas + tujuan yang sama.
 *
 * Pembatalan sengaja dibatasi pada tujuan yang sama: meminta kode penarikan
 * tidak boleh diam-diam mematikan kode verifikasi yang sedang ditunggu
 * pengguna di layar sebelah.
 */
export function terbitkanOtp(identitas, { tujuan = TUJUAN.VERIFIKASI, paksa = false } = {}) {
  pastikanBolehKirim(identitas, { paksa })

  const kode = buatKodeOtp()
  const kedaluwarsa = new Date(Date.now() + MENIT_OTP * 60_000).toISOString().slice(0, 19).replace('T', ' ')

  db.prepare('UPDATE otp SET terpakai = 1 WHERE identitas = ? AND tujuan = ? AND terpakai = 0').run(
    identitas,
    tujuan,
  )
  db.prepare('INSERT INTO otp (identitas, kode, tujuan, kedaluwarsa_pada) VALUES (?, ?, ?, ?)').run(
    identitas,
    kode,
    tujuan,
    kedaluwarsa,
  )

  // Baris lama tidak berguna lagi setelah sehari, dan tabelnya tidak punya
  // pembersih lain — tanpa ini ia tumbuh selamanya.
  db.prepare("DELETE FROM otp WHERE dibuat_pada < datetime('now', '-1 day')").run()

  // Kalau SMTP diatur, kode benar-benar dikirim ke inbox. Pengiriman sengaja
  // tidak ditunggu supaya respons HTTP tidak menggantung selama SMTP bekerja —
  // kegagalannya sudah ditangani dan dicatat di dalam kirimKodeOtp().
  if (surelAktif() && tampakEmail(identitas)) {
    // waitUntil: di Vercel Function proses dibekukan begitu respons terkirim,
    // jadi email yang belum selesai terkirim ikut membeku. Di server biasa no-op.
    waitUntil(kirimKodeOtp(identitas, kode, MENIT_OTP, tujuan))
  } else {
    console.log(`[OTP] ${identitas} (${tujuan}) -> ${kode} (berlaku ${MENIT_OTP} menit)`)
  }
  return kode
}

/**
 * Cocokkan kode, lalu hanguskan kalau benar.
 *
 * Barisnya dicari lewat identitas + tujuan, bukan lewat pasangan
 * identitas+kode. Bedanya penting: dengan kueri yang menyertakan kodenya,
 * tebakan yang salah tidak cocok dengan baris mana pun, jadi tidak ada tempat
 * untuk menghitung percobaan — dan kode enam digit tanpa hitungan percobaan
 * bisa ditebak sampai habis dalam sepuluh menit yang tersedia.
 *
 * Melempar GalatHttp 400 bila gagal, sehingga pemanggil yang berjalan di dalam
 * transaksi ikut ter-rollback dan kodenya tidak hangus percuma.
 */
export function verifikasiOtp(identitas, kode, { tujuan = TUJUAN.VERIFIKASI } = {}) {
  const baris = db
    .prepare(
      'SELECT * FROM otp WHERE identitas = ? AND tujuan = ? AND terpakai = 0 ORDER BY id DESC LIMIT 1',
    )
    .get(identitas, tujuan)

  if (!baris) throw galat400('Tidak ada kode aktif untuk akun ini. Minta kode baru.')
  if (baris.kedaluwarsa_pada < sekarang()) {
    throw galat400('Kode sudah kedaluwarsa. Minta kode baru.')
  }

  if (baris.kode !== String(kode).trim()) {
    const percobaan = baris.percobaan + 1
    if (percobaan >= MAKS_PERCOBAAN) {
      db.prepare('UPDATE otp SET percobaan = ?, terpakai = 1 WHERE id = ?').run(percobaan, baris.id)
      throw galat400('Kode salah terlalu sering. Kode ini dihanguskan — minta kode baru.')
    }
    db.prepare('UPDATE otp SET percobaan = ? WHERE id = ?').run(percobaan, baris.id)
    throw galat400(`Kode salah. Sisa ${MAKS_PERCOBAAN - percobaan} percobaan.`)
  }

  db.prepare('UPDATE otp SET terpakai = 1 WHERE id = ?').run(baris.id)
  return baris
}
