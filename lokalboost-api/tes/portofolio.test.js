/**
 * Tes AI Portfolio Auto-builder.
 *
 * Yang dijaga di sini bukan "apakah kodenya jalan", melainkan janji yang
 * dibuat ke pengguna: tiga lapis portofolio tidak boleh tercampur, dan
 * status "dikonfirmasi" tidak boleh bisa diklaim sendiri oleh kreator.
 *
 * Tes ini TIDAK menyentuh jaringan. Jalur oEmbed sungguhan diuji terpisah
 * lewat npm run asap, karena tes unit yang bergantung pada TikTok akan
 * gagal setiap kali jaringan kantor sedang buruk.
 *
 * Jalankan: npm test
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

process.env.DB_PATH = path.join(os.tmpdir(), `lokalboost-porto-${Date.now()}.db`)
process.env.NODE_ENV = 'test'
process.env.TURSO_DATABASE_URL = ''
// Setor dana simulasi. Midtrans diuji terpisah di midtrans.test.js.
process.env.MIDTRANS_SERVER_KEY = ''

const { db } = await import('../src/lib/db.js')
const { bangunPortofolio, tebakPlatform, ringkasanPortofolio } = await import(
  '../src/services/portofolio.js'
)

const VETERAN = 'krtr_porto_veteran'
const PEMULA = 'krtr_porto_pemula'

function buatKreator(id, nama) {
  db.prepare(
    "INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi) VALUES (?,'kreator',?,?,'x',1)",
  ).run(id, nama, `${id}@tes.id`)
  db.prepare(
    'INSERT INTO profil_kreator (pengguna_id, niche, lokasi, pengikut) VALUES (?, ?, ?, ?)',
  ).run(id, 'Kuliner', 'Bandung', 10_000)
}

function buatKampanyeSelesai(id, kategori, kreatorId, views) {
  db.prepare(
    `INSERT INTO kampanye (id, umkm_id, nama, kategori, lokasi, target_views, tarif_per_view,
                           anggaran, batas_maks_biaya, status, kreator_id, selesai_pada)
     VALUES (?, 'umkm_porto', ?, ?, 'Bandung', 5000, 100, 500000, 500000, 'selesai', ?, datetime('now'))`,
  ).run(id, `Kampanye ${id}`, kategori, kreatorId)
  db.prepare(
    "INSERT INTO lamaran (kampanye_id, kreator_id, jenis, status) VALUES (?, ?, 'undangan', 'disetujui') ON CONFLICT(kampanye_id, kreator_id) DO UPDATE SET status = 'disetujui'",
  ).run(id, kreatorId)

  // tayangan.video_id NOT NULL, jadi setiap kampanye butuh satu baris video.
  const videoId = `vid-${id}`
  db.prepare(
    `INSERT INTO video (id, kampanye_id, kreator_id, judul, durasi_detik, status)
     VALUES (?, ?, ?, ?, 30, 'tayang')`,
  ).run(videoId, id, kreatorId, `Video ${id}`)

  // Satu tayangan tidak valid ikut dimasukkan: lapis "terverifikasi" harus
  // menghitung tayangan yang lolos anti-fraud saja, bukan tayangan mentah.
  const tayang = db.prepare(
    `INSERT INTO tayangan (video_id, kampanye_id, ip_hash, durasi_tonton, valid)
     VALUES (?, ?, ?, 10, ?)`,
  )
  for (let i = 0; i < views; i++) tayang.run(videoId, id, `ip${i}`, 1)
  tayang.run(videoId, id, 'ip-curang', 0)
}

describe('AI Portfolio Auto-builder', () => {
  before(() => {
    db.prepare(
      "INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi) VALUES ('umkm_porto','umkm','UMKM Porto','umkmporto@tes.id','x',1)",
    ).run()
    buatKreator(VETERAN, 'Kreator Veteran')
    buatKreator(PEMULA, 'Kreator Pemula')

    buatKampanyeSelesai('porto-kuliner-1', 'Kuliner', VETERAN, 100)
    buatKampanyeSelesai('porto-kuliner-2', 'Kuliner', VETERAN, 50)
    buatKampanyeSelesai('porto-fashion-1', 'Fashion', VETERAN, 30)

    db.prepare(
      `INSERT INTO portofolio_tautan (kreator_id, platform, url, judul, penulis, penulis_akun, terkonfirmasi)
       VALUES (?, 'tiktok', 'https://www.tiktok.com/@v/video/1', 'Karya satu', 'Veteran', 'veteran', 1)`,
    ).run(VETERAN)
    db.prepare(
      `INSERT INTO portofolio_tautan (kreator_id, platform, url, terkonfirmasi)
       VALUES (?, 'instagram', 'https://www.instagram.com/reel/x/', 0)`,
    ).run(VETERAN)

  })

  it('lapis terverifikasi hanya menghitung tayangan yang lolos anti-fraud', () => {
    const p = bangunPortofolio(VETERAN)
    // 100 + 50 + 30 valid, tiga tayangan curang diabaikan.
    assert.equal(p.lapis.terverifikasi.totalViews, 180)
    assert.equal(p.lapis.terverifikasi.kampanyeSelesai, 3)
    assert.equal(p.lapis.terverifikasi.rerataViews, 60)
  })

  it('spesialisasi diurutkan dari kategori yang paling sering dikerjakan', () => {
    const { spesialisasi } = bangunPortofolio(VETERAN).lapis.terverifikasi
    assert.deepEqual(spesialisasi, [
      { kategori: 'Kuliner', jumlah: 2 },
      { kategori: 'Fashion', jumlah: 1 },
    ])
  })

  it('lapis tidak tercampur dan masing-masing membawa labelnya sendiri', () => {
    const { lapis } = bangunPortofolio(VETERAN)
    assert.equal(lapis.terverifikasi.label, 'Terverifikasi LokalBoost')
    assert.equal(lapis.terukur.label, 'Diukur dari profil')
    assert.equal(lapis.dikonfirmasi.label, 'Dikonfirmasi TikTok')
    // Angka ketikan kreator tidak punya tempat lagi: penipuan views/pengikut.
    assert.ok(!('dilaporkan' in lapis))

    // Angka ketikan kreator tidak boleh bocor ke lapis terverifikasi.
    assert.equal(lapis.terverifikasi.pengikut, undefined)
    assert.ok(!('rerataViews' in lapis.dikonfirmasi))
  })

  it('tautan non-TikTok tersimpan tapi tidak ikut dihitung terkonfirmasi', () => {
    const { dikonfirmasi } = bangunPortofolio(VETERAN).lapis
    assert.equal(dikonfirmasi.tautan.length, 2)
    assert.equal(dikonfirmasi.jumlahTerkonfirmasi, 1)
    const ig = dikonfirmasi.tautan.find((t) => t.platform === 'instagram')
    assert.equal(ig.terkonfirmasi, false)
  })

  it('kreator tanpa rekam jejak tidak menghasilkan angka mengambang', () => {
    const p = bangunPortofolio(PEMULA)
    assert.equal(p.lapis.terverifikasi.kampanyeSelesai, 0)
    assert.equal(p.lapis.terverifikasi.rerataViews, 0)
    assert.equal(p.lapis.terverifikasi.rating, null)
    assert.deepEqual(p.lapis.dikonfirmasi.tautan, [])
    assert.deepEqual(p.lapis.terukur.profil, [])
  })

  it('ringkasan dirakit template, bukan model bahasa', () => {
    const p = bangunPortofolio(VETERAN)
    assert.equal(p.sumberRingkasan, 'template')
    assert.match(p.ringkasan, /3 kampanye selesai/)
    assert.match(p.ringkasan, /Kuliner/)
  })

  it('ringkasan tetap menyebut ulasan walau belum ada kampanye selesai', () => {
    // Regresi: versi pertama membuang rating di cabang ini, sehingga ringkasan
    // berbunyi "belum menyelesaikan kampanye" di sebelah kartu bintang 5.
    const teks = ringkasanPortofolio('Rafi', {
      kampanyeSelesai: 0,
      kampanyeBerjalan: 3,
      rating: 5,
      jumlahUlasan: 1,
      spesialisasi: [],
    })
    assert.match(teks, /1 ulasan/)
    assert.match(teks, /5 dari 5/)
  })

  it('kreator yang tidak ada mengembalikan null, bukan portofolio kosong', () => {
    assert.equal(bangunPortofolio('krtr_tidak_ada'), null)
  })

  it('platform ditebak dari host, dan subdomain palsu tidak lolos', () => {
    assert.equal(tebakPlatform('https://www.tiktok.com/@a/video/1'), 'tiktok')
    assert.equal(tebakPlatform('https://vt.tiktok.com/ZSabc/'), 'tiktok')
    // Host yang cuma MENGANDUNG kata tiktok tidak boleh dianggap TikTok.
    assert.equal(tebakPlatform('https://tiktok.com.penipu.id/video/1'), 'lainnya')
    assert.equal(tebakPlatform('bukan-url'), null)
  })

  it('hanya http dan https yang boleh disimpan', () => {
    /*
     * Regresi atas lubang XSS tersimpan yang nyata, ditemukan 21 Sep 2026.
     * `new URL('javascript:...')` berhasil dan hostname-nya kosong, sehingga
     * versi pertama meloloskannya sebagai platform "lainnya". Tautan itu
     * berakhir sebagai href di profil kreator yang bisa dibuka tanpa login,
     * dan token sesi ada di localStorage. Sudah dibuktikan tersaji ke publik
     * lewat GET /api/kreator/:id/portofolio sebelum diperbaiki.
     */
    for (const jahat of [
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///C:/Windows/win.ini',
    ]) {
      assert.equal(tebakPlatform(jahat), null, `${jahat} seharusnya ditolak`)
    }
    assert.equal(tebakPlatform('http://blog.saya.id/karya'), 'lainnya')
  })
})
