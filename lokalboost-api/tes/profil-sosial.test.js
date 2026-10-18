/**
 * Tes Cek Profil Kreator (services/profil-sosial.js).
 *
 * Janji yang dijaga: angka dari profil orang lain tidak pernah masuk
 * portofolio. Hasil ukur baru tersimpan setelah kode verifikasi ada di bio,
 * dan satu akun tidak bisa diklaim dua kreator.
 *
 * Penyedia (ScrapeCreators) dipalsukan dengan menyadap `fetch`, jadi tes ini
 * tidak memakai kredit berbayar dan tidak bergantung pada jaringan.
 *
 * Jalankan: npm test
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

process.env.DB_PATH = path.join(os.tmpdir(), `lokalboost-profil-${Date.now()}.db`)
process.env.NODE_ENV = 'test'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.MIDTRANS_SERVER_KEY = ''
process.env.SCRAPECREATORS_API_KEY = 'kunci-tes'
process.env.SCRAPECREATORS_BASE_URL = 'http://penyedia.palsu'

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { config } = await import('../src/config.js')
const { uraiTautanProfil, hitungMetrik, nilaiProfil, bioMemuatKode, kodeVerifikasi } = await import(
  '../src/services/profil-sosial.js'
)

// ------------------------------------------------------------ penyedia palsu
const HARI = 24 * 3600
const kiniDetik = Math.floor(Date.now() / 1000)

/** Bio akun palsu bisa diubah di tengah tes, meniru kreator mengedit bio. */
const akunPalsu = {
  warungrafi: { bio: 'Kuliner Bandung', pengikut: 20_000 },
}
const akunYoutube = { bio: 'Channel kuliner Bandung', sembunyikanLike: false }
let statusPaksa = null
let jumlahPanggilan = 0

const fetchAsli = globalThis.fetch
globalThis.fetch = async (url, opsi) => {
  const u = new URL(String(url))
  if (u.host !== 'penyedia.palsu') return fetchAsli(url, opsi)
  jumlahPanggilan += 1
  assert.equal(opsi.headers['x-api-key'], 'kunci-tes')
  if (statusPaksa) return Response.json({ message: 'ditolak' }, { status: statusPaksa })

  const lewatYt = u.pathname.startsWith('/v1/youtube')
  if (lewatYt) {
    const ada =
      (u.searchParams.get('handle') || '') === 'rafichannel' ||
      u.searchParams.get('channelId') === 'UCabcdefghijklmnopqrstuv'
    if (!ada) return Response.json({ success: false }, { status: 404 })
  }
  const akun = lewatYt ? {} : akunPalsu[u.searchParams.get('handle')]
  if (!akun) return Response.json({ success: false, message: 'not found' }, { status: 404 })

  if (u.pathname === '/v1/tiktok/profile') {
    return Response.json({
      success: true,
      user: { uniqueId: 'WarungRafi', nickname: 'Rafi', signature: akun.bio, verified: false },
      stats: { followerCount: akun.pengikut },
    })
  }
  if (u.pathname === '/v3/tiktok/profile/videos') {
    return Response.json({
      aweme_list: [
        // Video sematan viral: harus diabaikan.
        { is_top: 1, create_time: kiniDetik - 300 * HARI, statistics: { play_count: 5_000_000, digg_count: 900_000 } },
        ...[8000, 10_000, 12_000, 6000].map((views, i) => ({
          create_time: kiniDetik - (i + 1) * 3 * HARI,
          statistics: { play_count: views, digg_count: views * 0.05, comment_count: 10, share_count: 5 },
        })),
      ],
    })
  }
  if (u.pathname === '/v1/youtube/channel') {
    return Response.json({
      channelId: 'UCabcdefghijklmnopqrstuv',
      name: 'Rafi Channel',
      channel: 'http://www.youtube.com/@rafichannel',
      description: akunYoutube.bio,
      subscriberCount: 12_000,
    })
  }
  if (u.pathname === '/v1/youtube/channel-videos') {
    const tanggalVideo = (hari) => new Date((kiniDetik - hari * HARI) * 1000).toISOString()
    return Response.json({
      // Bentuk asli penyedia: tanggal di `publishDate`, `publishedTime` null.
      videos: [1500, 1200, 900, 2100].map((v, i) => ({
        viewCountInt: v,
        likeCountInt: akunYoutube.sembunyikanLike ? null : Math.round(v * 0.05),
        commentCountInt: akunYoutube.sembunyikanLike ? null : 10,
        publishDate: tanggalVideo((i + 1) * 5),
        publishedTime: null,
      })),
    })
  }
  return Response.json({}, { status: 500 })
}

// ------------------------------------------------------------ pembantu HTTP
let server
let basis

async function panggil(metode, jalur, { token, body } = {}) {
  const res = await fetchAsli(`${basis}${jalur}`, {
    method: metode,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

async function daftarkanKreator(nama, email) {
  const daftar = await panggil('POST', '/api/auth/daftar', {
    body: { peran: 'kreator', nama, email, kataSandi: 'rahasia123' },
  })
  assert.equal(daftar.status, 201, JSON.stringify(daftar.data))
  const verif = await panggil('POST', '/api/auth/otp/verifikasi', {
    body: { identitas: email, kode: daftar.data.kodeOtp },
  })
  assert.equal(verif.status, 200, JSON.stringify(verif.data))
  return { token: verif.data.token, id: verif.data.pengguna.id }
}

describe('Cek Profil Kreator: fungsi murni', () => {
  it('membaca nama akun dari berbagai bentuk tautan profil', () => {
    assert.deepEqual(uraiTautanProfil('https://www.tiktok.com/@Warung.Rafi?lang=id'), {
      platform: 'tiktok',
      akun: 'warung.rafi',
    })
    assert.deepEqual(uraiTautanProfil('tiktok.com/@rafi_01/video/123'), { platform: 'tiktok', akun: 'rafi_01' })
    assert.deepEqual(uraiTautanProfil('https://www.youtube.com/@Warung-Rafi/videos'), {
      platform: 'youtube',
      akun: 'warung-rafi',
    })
    assert.deepEqual(uraiTautanProfil('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'), {
      platform: 'youtube',
      akun: 'UCabcdefghijklmnopqrstuv',
    })
    assert.deepEqual(uraiTautanProfil('https://instagram.com/sari.kuliner/'), {
      platform: 'instagram',
      akun: 'sari.kuliner',
    })
  })

  it('menolak tautan yang bukan profil dengan pesan yang bisa ditindaklanjuti', () => {
    assert.throws(() => uraiTautanProfil('https://vt.tiktok.com/ZSabc/'), /tautan lengkap/)
    assert.throws(() => uraiTautanProfil('https://www.instagram.com/reel/Cxyz/'), /bukan profil/)
    assert.throws(() => uraiTautanProfil('https://www.tiktok.com/foryou'), /nama akun/)
    assert.throws(() => uraiTautanProfil('https://facebook.com/a'), /TikTok, Instagram, dan YouTube/)
    assert.throws(() => uraiTautanProfil('https://www.youtube.com/watch?v=abc'), /tautan channel/)
    assert.throws(() => uraiTautanProfil('https://youtu.be/abc'), /tautan video/i)
    assert.throws(() => uraiTautanProfil('javascript:alert(1)'))
  })

  it('kode bio unik per kreator dan toleran terhadap spasi atau huruf kecil', () => {
    const kode = kodeVerifikasi('krtr_a')
    assert.match(kode, /^LB-[0-9A-F]{6}$/)
    assert.notEqual(kode, kodeVerifikasi('krtr_b'))
    assert.ok(bioMemuatKode(`Kuliner Bandung ${kode.toLowerCase()}`, kode))
    assert.ok(bioMemuatKode(`kode: ${kode.replace('-', ' ')}`, kode))
    assert.ok(!bioMemuatKode('Kuliner Bandung', kode))
  })

  it('metrik TikTok: engagement terhadap views, median tahan satu video viral', () => {
    const m = hitungMetrik({
      platform: 'tiktok',
      pengikut: 20_000,
      konten: [
        { views: 1000, suka: 100, komentar: 0, bagikan: 0, waktu: kiniDetik - HARI },
        { views: 3000, suka: 100, komentar: 0, bagikan: 0, waktu: kiniDetik - 2 * HARI },
        { views: 96_000, suka: 3800, komentar: 0, bagikan: 0, waktu: kiniDetik - 40 * HARI },
      ],
    })
    assert.equal(m.medianViews, 3000)
    assert.equal(m.rerataViews, 33_333)
    assert.equal(m.engagement, 4) // 4000 interaksi / 100.000 views
    assert.equal(m.konten30Hari, 2)
  })

  it('metrik Instagram: foto tidak menyeret rata-rata views, engagement terhadap pengikut', () => {
    const m = hitungMetrik({
      platform: 'instagram',
      pengikut: 10_000,
      konten: [
        { views: 4000, suka: 300, komentar: 20, bagikan: 0, waktu: kiniDetik - HARI },
        { views: null, suka: 180, komentar: 0, bagikan: 0, waktu: kiniDetik - 2 * HARI },
      ],
    })
    assert.equal(m.rerataViews, 4000)
    assert.equal(m.engagement, 2.5) // rata-rata 250 interaksi / 10.000 pengikut
    assert.equal(m.dasarEngagement, 'pengikut')
  })

  it('pengikut besar dengan tayangan kecil diberi peringatan, bukan skor tinggi', () => {
    const m = { pengikut: 500_000, medianViews: 800, rerataViews: 900, engagement: 0.4, kontenDiukur: 12, konten30Hari: 10 }
    const n = nilaiProfil('tiktok', m)
    assert.ok(n.peringatan.some((p) => /tidak aktif/.test(p)))
    assert.ok(n.peringatan.some((p) => /sangat rendah/.test(p)))
    assert.ok(n.skor < 55, `skor ${n.skor} seharusnya di bawah "Baik"`)
  })
})

describe('Cek Profil Kreator: alur API', () => {
  let rafi
  let penyerobot

  before(async () => {
    const app = buatApp()
    await new Promise((r) => {
      server = app.listen(0, r)
    })
    basis = `http://127.0.0.1:${server.address().port}`
    rafi = await daftarkanKreator('Rafi', 'rafi.profil@tes.id')
    penyerobot = await daftarkanKreator('Penyerobot', 'serobot.profil@tes.id')
  })

  after(() => server?.close())

  it('GET memberi kode bio milik kreator sendiri', async () => {
    const r = await panggil('GET', '/api/kreator/saya/portofolio/profil', { token: rafi.token })
    assert.equal(r.status, 200)
    assert.equal(r.data.aktif, true)
    assert.equal(r.data.kode, kodeVerifikasi(rafi.id))
    assert.deepEqual(r.data.profil, [])
  })

  it('tanpa kode di bio: angka dipratinjau, TIDAK disimpan', async () => {
    const r = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: rafi.token,
      body: { url: 'https://www.tiktok.com/@warungrafi' },
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.terbukti, false)
    assert.match(r.data.keterangan, new RegExp(r.data.kode))
    // Sematan 5 juta views diabaikan: median 4 video = (8000 + 10000) / 2.
    assert.equal(r.data.hasil.medianViews, 9000)
    assert.equal(r.data.hasil.kontenDiukur, 4)
    const n = db.prepare('SELECT COUNT(*) AS n FROM statistik_terukur').get().n
    assert.equal(n, 0)
  })

  it('dengan kode di bio: tersimpan dan muncul di portofolio publik', async () => {
    akunPalsu.warungrafi.bio = `Kuliner Bandung · ${kodeVerifikasi(rafi.id)}`
    const r = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: rafi.token,
      body: { url: 'https://www.tiktok.com/@warungrafi' },
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.terbukti, true)

    const publik = await panggil('GET', `/api/kreator/${rafi.id}/portofolio`)
    const terukur = publik.data.lapis.terukur
    assert.equal(terukur.label, 'Diukur dari profil')
    assert.equal(terukur.profil.length, 1)
    assert.equal(terukur.profil[0].akun, 'warungrafi')
    assert.equal(terukur.profil[0].pengikut, 20_000)
    assert.ok(terukur.profil[0].predikat)
  })

  it('akun yang sudah terhubung tidak bisa diklaim kreator lain', async () => {
    const r = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: penyerobot.token,
      body: { url: 'https://www.tiktok.com/@warungrafi' },
    })
    assert.equal(r.status, 409)
  })

  it('matchmaker memakai median tayangan terukur, bukan tebakan dari pengikut', async () => {
    const { skorKecocokan } = await import('../src/services/matchmaker.js')
    const hasil = skorKecocokan(
      { kategori: 'Kuliner', lokasi: 'Bandung', target_views: 5000 },
      { id: rafi.id, niche: 'Kuliner', lokasi: 'Bandung', pengikut: 0 },
    )
    assert.ok(hasil.alasan.some((a) => /diukur dari profil/.test(a)), hasil.alasan.join(' | '))
  })

  it('akun tidak ada = 404, kunci ditolak penyedia = 503', async () => {
    const tidakAda = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: penyerobot.token,
      body: { url: 'https://www.tiktok.com/@akuntidakada' },
    })
    assert.equal(tidakAda.status, 404)

    statusPaksa = 401
    const ditolak = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: penyerobot.token,
      body: { url: 'https://www.instagram.com/siapasaja' },
    })
    statusPaksa = null
    assert.equal(ditolak.status, 503)
  })

  it('tanpa kunci API fiturnya mati dengan jujur dan tidak memanggil penyedia', async () => {
    const kunci = config.scrapeCreators.apiKey
    config.scrapeCreators.apiKey = ''
    const sebelum = jumlahPanggilan
    const r = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: penyerobot.token,
      body: { url: 'https://www.tiktok.com/@warungrafi2' },
    })
    config.scrapeCreators.apiKey = kunci
    assert.equal(r.status, 503)
    assert.match(r.data.pesan || r.data.galat || JSON.stringify(r.data), /belum diaktifkan/)
    assert.equal(jumlahPanggilan, sebelum)
  })

  it('metrik: akun yang menyembunyikan like tidak dihukum 0%', () => {
    const m = hitungMetrik({
      platform: 'instagram',
      tanpaInteraksi: true,
      pengikut: 500_000,
      konten: [{ views: 90_000, suka: 0, komentar: 40, bagikan: 0, waktu: kiniDetik - HARI }],
    })
    assert.equal(m.engagement, null)
    assert.equal(m.dasarEngagement, null)
    const n = nilaiProfil('instagram', m)
    assert.ok(!n.komponen.some((k) => k.nama === 'Interaksi penonton'))
    assert.equal(n.komponen.reduce((a, k) => a + k.maks, 0), 100)
    assert.ok(!n.peringatan.some((w) => /Interaksi/.test(w)))
  })

  it('YouTube: ukur channel dan hitung interaksi dari like + komentar', async () => {
    akunYoutube.bio = `Channel kuliner ${kodeVerifikasi(rafi.id)}`
    const r = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: rafi.token,
      body: { url: 'https://www.youtube.com/@rafichannel' },
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.terbukti, true)
    const h = r.data.hasil
    assert.equal(h.platform, 'youtube')
    assert.equal(h.akun, 'rafichannel')
    assert.equal(h.pengikut, 12_000)
    assert.equal(h.medianViews, 1350) // (1200 + 1500) / 2
    // 4 video: like 5% views (75+60+45+105=285) + 10 komentar x 4 = 325 interaksi / 5700 views
    assert.equal(h.engagement, 5.7)
    assert.equal(h.dasarEngagement, 'views')
    assert.equal(h.konten30Hari, 4)
    assert.ok(h.komponen.some((k) => k.nama === 'Interaksi penonton'))
  })

  it('YouTube dengan like disembunyikan: interaksi kosong dan skor dibobot ulang', async () => {
    akunYoutube.sembunyikanLike = true
    const r = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: rafi.token,
      body: { url: 'https://www.youtube.com/@rafichannel' },
    })
    akunYoutube.sembunyikanLike = false
    assert.equal(r.status, 200, JSON.stringify(r.data))
    const h = r.data.hasil
    assert.equal(h.engagement, null)
    assert.equal(h.dasarEngagement, null)
    assert.ok(!h.komponen.some((k) => k.nama === 'Interaksi penonton'))
    assert.equal(h.komponen.reduce((a, k) => a + k.maks, 0), 100)
  })

  it('channel YouTube yang sama tidak bisa diklaim lewat bentuk tautan lain', async () => {
    const r = await panggil('POST', '/api/kreator/saya/portofolio/profil', {
      token: penyerobot.token,
      body: { url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv' },
    })
    assert.equal(r.status, 409, JSON.stringify(r.data))
  })

  it('statistik ketikan sendiri tidak diterima lagi', async () => {
    const r = await panggil('PUT', '/api/kreator/saya/portofolio/statistik', {
      token: rafi.token,
      body: { platform: 'tiktok', pengikut: 9_999_999, rerataViews: 9_999_999, engagement: 50 },
    })
    assert.equal(r.status, 404)
  })

  it('kreator bisa melepas akun terukurnya', async () => {
    const r = await panggil('DELETE', '/api/kreator/saya/portofolio/profil/tiktok', { token: rafi.token })
    assert.equal(r.status, 200)
    assert.deepEqual(r.data.portofolio.lapis.terukur.profil.map((p) => p.platform), ['youtube'])
  })
})
