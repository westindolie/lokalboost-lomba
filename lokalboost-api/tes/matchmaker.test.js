/**
 * Tes komponen "histori" pada Smart Matchmaker.
 *
 * Yang diuji: skor kecocokan ikut memperhitungkan kategori yang BENAR-BENAR
 * pernah diambil kreator, bukan hanya niche yang ia tulis di profil.
 *
 * Jalankan: npm test
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

process.env.DB_PATH = path.join(os.tmpdir(), `lokalboost-match-${Date.now()}.db`)
process.env.NODE_ENV = 'test'
process.env.TURSO_DATABASE_URL = ''
// Setor dana simulasi. Midtrans diuji terpisah di midtrans.test.js.
process.env.MIDTRANS_SERVER_KEY = ''

const { db } = await import('../src/lib/db.js')
const { skorKecocokan, BOBOT_MATCHMAKER } = await import('../src/services/matchmaker.js')

const KREATOR = 'krtr_uji_histori'

function buatKampanye(id, kategori, status, kreatorId) {
  db.prepare(
    `INSERT INTO kampanye (id, umkm_id, nama, kategori, lokasi, target_views, tarif_per_view, anggaran, batas_maks_biaya, status, kreator_id)
     VALUES (?, 'umkm_uji', ?, ?, 'Bandung', 5000, 100, 500000, 500000, ?, ?)`,
  ).run(id, `Kampanye ${id}`, kategori, status, kreatorId)
  // Peserta kampanye = lamaran 'disetujui' (satu kampanye boleh banyak kreator).
  if (kreatorId) {
    db.prepare(
    "INSERT INTO lamaran (kampanye_id, kreator_id, jenis, status) VALUES (?, ?, 'undangan', 'disetujui') ON CONFLICT(kampanye_id, kreator_id) DO UPDATE SET status = 'disetujui'",
  ).run(id, kreatorId)
  }
}

describe('Smart Matchmaker: histori penerimaan kreator', () => {
  before(() => {
    db.prepare("INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi) VALUES ('umkm_uji','umkm','UMKM Uji','umkmuji@tes.id','x',1)").run()
    db.prepare("INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi) VALUES (?,'kreator','Kreator Uji','kreatoruji@tes.id','x',1)").run(KREATOR)
    db.prepare('INSERT INTO profil_kreator (pengguna_id, niche, lokasi, pengikut) VALUES (?, ?, ?, ?)').run(KREATOR, 'Kuliner', 'Bandung', 10000)
  })

  it('total bobot tetap 100 setelah komponen histori ditambahkan', () => {
    const total = Object.values(BOBOT_MATCHMAKER).reduce((a, b) => a + b, 0)
    assert.equal(total, 100)
    assert.ok(BOBOT_MATCHMAKER.histori > 0, 'komponen histori harus ada')
  })

  it('kreator tanpa histori tidak dihukum nol, dapat nilai dasar netral', () => {
    const kampanye = { id: 'k0', kategori: 'Fashion', lokasi: 'Bandung', target_views: 5000 }
    const profil = db.prepare('SELECT * FROM profil_kreator WHERE pengguna_id = ?').get(KREATOR)
    const hasil = skorKecocokan(kampanye, profil)
    assert.equal(hasil.rincian.histori, BOBOT_MATCHMAKER.histori * 0.5)
  })

  it('kategori yang pernah diambil menaikkan skor dibanding yang belum pernah', () => {
    // Kreator mengambil 3 kampanye Fashion, meski niche profilnya Kuliner.
    buatKampanye('k1', 'Fashion', 'selesai', KREATOR)
    buatKampanye('k2', 'Fashion', 'selesai', KREATOR)
    buatKampanye('k3', 'Fashion', 'berjalan', KREATOR)

    const profil = db.prepare('SELECT * FROM profil_kreator WHERE pengguna_id = ?').get(KREATOR)
    const fashion = skorKecocokan({ id: 'x', kategori: 'Fashion', lokasi: 'Bandung', target_views: 5000 }, profil)
    const gadget = skorKecocokan({ id: 'y', kategori: 'Hobi & Gadget', lokasi: 'Bandung', target_views: 5000 }, profil)

    assert.equal(fashion.rincian.histori, BOBOT_MATCHMAKER.histori, '3 kali = nilai penuh')
    assert.equal(gadget.rincian.histori, 0, 'kategori yang belum pernah diambil = 0')
    assert.ok(fashion.skor > gadget.skor, 'kategori berpengalaman harus unggul')
    assert.ok(
      fashion.alasan.some((a) => /3 kali mengambil kampanye Fashion/i.test(a)),
      'alasannya harus menyebut historinya',
    )
  })

  it('histori mengalahkan niche profil yang sudah tidak mencerminkan perilaku', () => {
    // Profil bilang Kuliner, perilakunya Fashion. Kampanye Fashion harus
    // tetap bisa bersaing, itu inti dari komponen ini.
    const profil = db.prepare('SELECT * FROM profil_kreator WHERE pengguna_id = ?').get(KREATOR)
    const fashion = skorKecocokan({ id: 'x', kategori: 'Fashion', lokasi: 'Bandung', target_views: 5000 }, profil)
    assert.ok(fashion.rincian.niche < BOBOT_MATCHMAKER.niche, 'niche profil memang tidak cocok')
    assert.ok(fashion.rincian.histori > fashion.rincian.niche, 'bukti perilaku harus lebih berat')
  })
})
