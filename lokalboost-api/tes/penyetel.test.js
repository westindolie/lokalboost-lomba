/**
 * Tes penyetel AI.
 *
 * Yang diuji bukan "apakah usulannya bagus" — itu penilaian manusia. Yang
 * diuji adalah bahwa alatnya membaca bukti dengan benar: mengusulkan ketika
 * ada cukup penyaringan yang dinyatakan keliru, dan DIAM ketika sampelnya
 * kecil atau tingkat salahnya rendah. Alat penyetel yang mengusulkan dari
 * derau lebih berbahaya daripada tidak punya alat sama sekali.
 *
 * Jalankan: npm test
 */
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-penyetel-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
// Tes membaca kode OTP dari respons. Dikunci di sini karena .env laptop
// sengaja memakai BOCORKAN_OTP=false, dan dotenv tidak menimpa nilai yang sudah ada.
process.env.BOCORKAN_OTP = 'true'
// Tes selalu memakai berkas sementara, tidak pernah basis data Turso sungguhan.
process.env.TURSO_DATABASE_URL = ''
// Setor dana simulasi. Midtrans diuji terpisah di midtrans.test.js.
process.env.MIDTRANS_SERVER_KEY = ''
// Ambang dipatok eksplisit supaya usulannya bisa diprediksi tanpa bergantung
// pada isi .env mesin yang menjalankan tes.
process.env.AF_MAKS_VIEW_IP = '3'
process.env.AF_DURASI_MIN = '3'

const { db } = await import('../src/lib/db.js')
const { usulanPenyetelan } = await import('../src/services/penyetel.js')
const { ALASAN_ANTIFRAUD } = await import('../src/services/antifraud.js')

/** Rangka minimal supaya baris tayangan punya induk yang sah. */
function siapkanKampanye() {
  db.prepare(
    `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi)
     VALUES ('umkm_uji', 'umkm', 'UMKM Uji', 'umkm@uji.id', 'x:y', 1)`,
  ).run()
  db.prepare(
    `INSERT INTO kampanye (id, umkm_id, nama, kategori, lokasi, target_views, tarif_per_view, anggaran, batas_maks_biaya, status)
     VALUES ('kmp-uji', 'umkm_uji', 'Kampanye Uji', 'Kuliner', 'Bandung', 1000, 500, 500000, 500000, 'berjalan')`,
  ).run()
  db.prepare(
    `INSERT INTO video (id, kampanye_id, kreator_id, judul, berkas, durasi_detik, status)
     VALUES ('vid_uji', 'kmp-uji', 'umkm_uji', 'Video Uji', 'uji.mp4', 30, 'tayang')`,
  ).run()
}

/** Sisipkan n tayangan tersaring dengan satu alasan, m di antaranya dipulihkan. */
function sisipkanTersaring({ alasan, jumlah, dipulihkan }) {
  const sisip = db.prepare(
    `INSERT INTO tayangan (video_id, kampanye_id, ip_hash, user_agent, durasi_tonton, valid, alasan, dipulihkan)
     VALUES ('vid_uji', 'kmp-uji', ?, 'Mozilla/5.0', 20, ?, ?, ?)`,
  )
  for (let i = 0; i < jumlah; i += 1) {
    const pulih = i < dipulihkan ? 1 : 0
    // Baris yang dipulihkan kembali valid = 1; alasannya sengaja tetap
    // disimpan, karena itulah satu-satunya label yang dimiliki sistem.
    sisip.run(`ip${i}`, pulih, alasan, pulih)
  }
}

const cariUsulan = (hasil, env) => hasil.antiFraud.usulan.find((u) => u.env === env)

describe('Penyetel AI', () => {
  before(() => {
    siapkanKampanye()
  })

  beforeEach(() => {
    db.prepare('DELETE FROM tayangan').run()
    db.prepare('DELETE FROM umpan_matchmaker').run()
  })

  after(() => {
    db.close()
    for (const berkas of [dbSementara, `${dbSementara}-wal`, `${dbSementara}-shm`]) {
      try {
        if (fs.existsSync(berkas)) fs.unlinkSync(berkas)
      } catch {
        // Berkas sementara di %TEMP%; biarkan OS yang membersihkan.
      }
    }
  })

  it('tidak mengusulkan apa pun ketika belum ada tayangan tersaring', () => {
    const hasil = usulanPenyetelan()
    assert.equal(hasil.adaUsulan, false)
    assert.deepEqual(hasil.barisEnv, [])
  })

  it('mengusulkan pelonggaran saat satu aturan sering dinyatakan keliru', () => {
    // 100 tersaring, 32 dipulihkan admin = 32% salah — persis pola yang
    // ditemukan di lapangan pada aturan IP berulang.
    sisipkanTersaring({ alasan: ALASAN_ANTIFRAUD.IP_BERULANG, jumlah: 100, dipulihkan: 32 })

    const hasil = usulanPenyetelan()
    const usulan = cariUsulan(hasil, 'AF_MAKS_VIEW_IP')

    assert.ok(usulan, 'aturan IP berulang seharusnya diusulkan dilonggarkan')
    assert.equal(usulan.sekarang, 3)
    assert.equal(usulan.disarankan, 5)
    assert.equal(usulan.bukti.totalDisaring, 100)
    assert.equal(usulan.bukti.dipulihkan, 32)
    assert.equal(usulan.bukti.persenSalah, 32)
    assert.ok(hasil.barisEnv.includes('AF_MAKS_VIEW_IP=5'))
  })

  it('diam ketika sampelnya masih terlalu kecil untuk disebut bukti', () => {
    // Tingkat salahnya 50% — tinggi — tapi hanya dari 10 tayangan.
    sisipkanTersaring({ alasan: ALASAN_ANTIFRAUD.IP_BERULANG, jumlah: 10, dipulihkan: 5 })

    const hasil = usulanPenyetelan()
    assert.equal(cariUsulan(hasil, 'AF_MAKS_VIEW_IP'), undefined)

    const dilewati = hasil.antiFraud.diabaikan.find((d) => d.alasan === ALASAN_ANTIFRAUD.IP_BERULANG)
    assert.ok(dilewati, 'alasannya harus dijelaskan, bukan hilang diam-diam')
    assert.match(dilewati.sebab, /minimal 20/i)
  })

  it('diam ketika aturannya jarang salah', () => {
    // 100 tersaring, 5 dipulihkan = 5%, di bawah ambang perhatian 10%.
    sisipkanTersaring({ alasan: ALASAN_ANTIFRAUD.SINGKAT, jumlah: 100, dipulihkan: 5 })

    const hasil = usulanPenyetelan()
    assert.equal(cariUsulan(hasil, 'AF_DURASI_MIN'), undefined)
    assert.equal(hasil.adaUsulan, false)
  })

  it('melonggarkan durasi minimal ke arah yang benar', () => {
    sisipkanTersaring({ alasan: ALASAN_ANTIFRAUD.SINGKAT, jumlah: 60, dipulihkan: 20 })

    const usulan = cariUsulan(usulanPenyetelan(), 'AF_DURASI_MIN')
    assert.ok(usulan)
    assert.ok(usulan.disarankan < usulan.sekarang, 'durasi minimal harus TURUN agar menyaring lebih sedikit')
  })

  it('menandai aturan tanpa ambang angka alih-alih diam', () => {
    // BOT dikendalikan daftar pola user-agent, bukan angka di config.
    sisipkanTersaring({ alasan: ALASAN_ANTIFRAUD.BOT, jumlah: 40, dipulihkan: 20 })

    const hasil = usulanPenyetelan()
    assert.equal(hasil.antiFraud.usulan.length, 0)

    const dilewati = hasil.antiFraud.diabaikan.find((d) => d.alasan === ALASAN_ANTIFRAUD.BOT)
    assert.ok(dilewati)
    assert.match(dilewati.sebab, /daftar pola/i)
  })

  it('tidak pernah mengusulkan pengetatan, walau tak ada satu pun yang dipulihkan', () => {
    // Nol salah-saring bukan bukti aturannya terlalu longgar — kecurangan
    // yang lolos tidak pernah ditandai siapa pun.
    sisipkanTersaring({ alasan: ALASAN_ANTIFRAUD.IP_BERULANG, jumlah: 200, dipulihkan: 0 })

    const hasil = usulanPenyetelan()
    assert.equal(hasil.antiFraud.usulan.length, 0)
    assert.equal(hasil.antiFraud.persenSalahKeseluruhan, 0)
  })

  it('menahan usulan bobot matchmaker sampai keputusannya cukup banyak', () => {
    const hasil = usulanPenyetelan()
    assert.deepEqual(hasil.matchmaker.usulan, [])
    assert.match(hasil.matchmaker.catatanUsulan, /minimal 20|Baru 0/i)
  })
})
