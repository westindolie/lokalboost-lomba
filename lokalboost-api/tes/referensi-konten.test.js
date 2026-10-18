/**
 * Tes referensi konten kampanye (services/referensi-konten.js + POST
 * /api/ai/brief-referensi + kolom `referensi` di POST/PATCH /api/kampanye).
 *
 * Janji yang dijaga: tautan profil atau situs lain ditolak sebelum kredit
 * terpakai, satu tautan yang gagal dibaca tidak menggagalkan yang lain, dan
 * brief tetap terbit (template) walau model bahasa mati.
 *
 * ScrapeCreators dan oEmbed dipalsukan dengan menyadap `fetch`. Bentuk data
 * palsu disalin dari respons asli yang diuji 17 Okt 2026.
 *
 * Jalankan: npm test
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

process.env.DB_PATH = path.join(os.tmpdir(), `lokalboost-referensi-${Date.now()}.db`)
process.env.NODE_ENV = 'test'
// Gerbang biaya pasang kampanye diuji sendiri di biaya-pasang.test.js.
process.env.BIAYA_PASANG_KAMPANYE = '0'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.MIDTRANS_SERVER_KEY = ''
process.env.SCRAPECREATORS_API_KEY = 'kunci-tes'
process.env.SCRAPECREATORS_BASE_URL = 'http://penyedia.palsu'
// Model bahasa dimatikan: brief harus jatuh ke template, tanpa jaringan.
process.env.GEMINI_API_KEY = ''
process.env.NARA_API_KEY = ''
process.env.OPENROUTER_API_KEY = ''
process.env.ANTHROPIC_API_KEY = ''

const { buatApp } = await import('../src/app.js')
const { uraiTautanKonten, ambilReferensi, rapikanReferensiSimpan } = await import(
  '../src/services/referensi-konten.js'
)
const { config } = await import('../src/config.js')

// ------------------------------------------------------------ penyedia palsu
const panggilan = []
let scrapeMati = false

const fetchAsli = globalThis.fetch
globalThis.fetch = async (url, opsi) => {
  const u = new URL(String(url))
  if (u.host === 'penyedia.palsu') {
    panggilan.push(u.pathname)
    if (scrapeMati) return Response.json({ message: 'kredit habis' }, { status: 402 })
    if (u.pathname === '/v2/tiktok/video') {
      return Response.json({
        success: true,
        transcript: 'WEBVTT\n\nhalo guys hari ini aku coba bakso paling pedas',
        aweme_detail: {
          desc: 'Bakso level 10 bikin nangis #kulinerbandung #bakso',
          author: { unique_id: 'jajanbandung', nickname: 'Jajan Bandung' },
          statistics: { play_count: 120_000, digg_count: 9000, comment_count: 300 },
          video: { duration: 28_500 },
          text_extra: [{ hashtag_name: 'kulinerbandung' }, { hashtag_name: 'bakso' }],
        },
      })
    }
    if (u.pathname === '/v1/instagram/post') {
      return Response.json({
        success: true,
        data: {
          xdt_shortcode_media: {
            is_video: true,
            video_play_count: 50_000,
            video_duration: 15.2,
            owner: { username: 'kopisore' },
            edge_media_to_caption: { edges: [{ node: { text: 'Pagi tenang ditemani kopi susu #kopi' } }] },
            edge_media_preview_like: { count: 0 },
            like_and_view_counts_disabled: true,
            edge_media_to_parent_comment: { count: 12 },
          },
        },
      })
    }
    if (u.pathname === '/v1/youtube/video') {
      return Response.json({ success: true, message: 'not found' }, { status: 404 })
    }
    return Response.json({}, { status: 500 })
  }
  if (u.host === 'www.youtube.com' && u.pathname === '/oembed') {
    panggilan.push('oembed-youtube')
    return Response.json({ title: 'Review keripik pedas #shorts', author_name: 'Dapur Mama' })
  }
  if (u.host === 'www.tiktok.com' && u.pathname === '/oembed') {
    panggilan.push('oembed-tiktok')
    return Response.json({ title: 'Cara bikin sambal #resep', author_name: 'Bu Sari' })
  }
  return fetchAsli(url, opsi)
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

async function daftarkan(peran, nama, email) {
  const daftar = await panggil('POST', '/api/auth/daftar', {
    body: { peran, nama, email, kataSandi: 'rahasia123' },
  })
  assert.equal(daftar.status, 201, JSON.stringify(daftar.data))
  const verif = await panggil('POST', '/api/auth/otp/verifikasi', {
    body: { identitas: email, kode: daftar.data.kodeOtp },
  })
  assert.equal(verif.status, 200, JSON.stringify(verif.data))
  return verif.data.token
}

describe('Referensi konten: urai tautan', () => {
  it('membaca tautan video dari ketiga platform ke bentuk kanonik', () => {
    assert.deepEqual(uraiTautanKonten('https://www.tiktok.com/@jajan.bdg/video/7301234567890123456?lang=id'), {
      platform: 'tiktok',
      url: 'https://www.tiktok.com/@jajan.bdg/video/7301234567890123456',
    })
    assert.deepEqual(uraiTautanKonten('https://vt.tiktok.com/ZSabc123/'), {
      platform: 'tiktok',
      url: 'https://vt.tiktok.com/ZSabc123/',
    })
    assert.deepEqual(uraiTautanKonten('instagram.com/reels/DeewiSPpCrm?igsh=x'), {
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/DeewiSPpCrm/',
    })
    assert.deepEqual(uraiTautanKonten('https://youtu.be/dQw4w9WgXcQ?si=abc'), {
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    assert.deepEqual(uraiTautanKonten('https://m.youtube.com/shorts/dQw4w9WgXcQ'), {
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
  })

  it('menolak tautan profil dan situs lain', () => {
    assert.throws(() => uraiTautanKonten('https://www.tiktok.com/@jajan.bdg'), /bukan tautan profil/)
    assert.throws(() => uraiTautanKonten('https://www.instagram.com/kopisore/'), /bukan tautan profil/)
    assert.throws(() => uraiTautanKonten('https://www.youtube.com/@DapurMama'), /bukan tautan profil/)
    assert.throws(() => uraiTautanKonten('https://facebook.com/watch?v=1'), /TikTok, Instagram, dan YouTube/)
    assert.throws(() => uraiTautanKonten('javascript:alert(1)'))
  })

  it('rapikanReferensiSimpan membuang duplikat dan field berlebih', () => {
    const hasil = rapikanReferensiSimpan([
      { url: 'https://youtu.be/dQw4w9WgXcQ', judul: 'A', penulis: 'B', views: 999, gambar: 'https://x' },
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ])
    assert.equal(hasil.length, 1)
    assert.deepEqual(Object.keys(hasil[0]).sort(), ['judul', 'penulis', 'platform', 'url'])
    assert.throws(() => rapikanReferensiSimpan(['a', 'b', 'c', 'd']), /Maksimal 3/)
  })
})

describe('Referensi konten: membaca isi', () => {
  it('TikTok lewat ScrapeCreators: durasi milidetik jadi detik, transkrip tanpa WEBVTT', async () => {
    const r = await ambilReferensi('https://www.tiktok.com/@jajanbandung/video/7301234567890123456')
    assert.equal(r.terbaca, true)
    assert.equal(r.sumberData, 'scrapecreators')
    assert.equal(r.penulis, '@jajanbandung')
    assert.equal(r.durasiDetik, 29)
    assert.equal(r.views, 120_000)
    assert.deepEqual(r.tagar, ['kulinerbandung', 'bakso'])
    assert.match(r.transkrip, /^halo guys/)
  })

  it('Instagram yang menyembunyikan like: suka null, bukan 0', async () => {
    const r = await ambilReferensi('https://www.instagram.com/reel/DeewiSPpCrm/')
    assert.equal(r.terbaca, true)
    assert.equal(r.suka, null)
    assert.equal(r.views, 50_000)
    assert.equal(r.penulis, '@kopisore')
  })

  it('YouTube gagal di ScrapeCreators jatuh ke oEmbed', async () => {
    const r = await ambilReferensi('https://youtu.be/dQw4w9WgXcQ')
    assert.equal(r.terbaca, true)
    assert.equal(r.sumberData, 'oembed')
    assert.equal(r.judul, 'Review keripik pedas #shorts')
    assert.deepEqual(r.tagar, ['shorts'])
  })

  it('Instagram tanpa ScrapeCreators: tautan tetap dikembalikan dengan catatan', async () => {
    const kunci = config.scrapeCreators.apiKey
    config.scrapeCreators.apiKey = ''
    try {
      const r = await ambilReferensi('https://www.instagram.com/p/DeewiSPpCrm/')
      assert.equal(r.terbaca, false)
      assert.equal(r.url, 'https://www.instagram.com/p/DeewiSPpCrm/')
      assert.match(r.catatan, /Instagram belum bisa dibaca/)
    } finally {
      config.scrapeCreators.apiKey = kunci
    }
  })
})

describe('Referensi konten: API', () => {
  let tokenUmkm
  let tokenKreator

  before(async () => {
    server = buatApp().listen(0)
    await new Promise((r) => server.once('listening', r))
    basis = `http://127.0.0.1:${server.address().port}`
    tokenUmkm = await daftarkan('umkm', 'Bu Sari', `sari-ref-${Date.now()}@contoh.id`)
    tokenKreator = await daftarkan('kreator', 'Rafi', `rafi-ref-${Date.now()}@contoh.id`)
  })

  after(() => server?.close())

  it('menyusun brief dari referensi dengan AI lokal yang aktif', async () => {
    const { status, data } = await panggil('POST', '/api/ai/brief-referensi', {
      token: tokenUmkm,
      body: {
        tautan: [
          'https://www.tiktok.com/@jajanbandung/video/7301234567890123456',
          'https://www.instagram.com/reel/DeewiSPpCrm/',
        ],
        nama: 'Bakso Aci Bu Sari',
        kategori: 'Kuliner',
        lokasi: 'Bogor',
      },
    })
    assert.equal(status, 200, JSON.stringify(data))
    assert.equal(data.referensi.length, 2)
    assert.ok(['llm', 'template'].includes(data.brief.sumber))
    assert.ok(data.brief.poin.length >= 4)
    assert.ok(data.brief.poin.some((p) => p.includes('Bogor')))
    assert.ok(data.brief.poin.some((p) => p.includes('Bakso Aci Bu Sari')))
    assert.ok(data.brief.gaya.length > 0)
  })

  it('tautan profil ditolak 400 sebelum penyedia dipanggil', async () => {
    const sebelum = panggilan.length
    const { status, data } = await panggil('POST', '/api/ai/brief-referensi', {
      token: tokenUmkm,
      body: { tautan: ['https://www.tiktok.com/@jajanbandung/video/7301234567890123456', 'https://www.tiktok.com/@jajanbandung'] },
    })
    assert.equal(status, 400)
    assert.match(data.pesan || data.galat || JSON.stringify(data), /profil/)
    assert.equal(panggilan.length, sebelum)
  })

  it('hanya UMKM yang boleh memakai brief-referensi', async () => {
    const { status } = await panggil('POST', '/api/ai/brief-referensi', {
      token: tokenKreator,
      body: { tautan: ['https://youtu.be/dQw4w9WgXcQ'] },
    })
    assert.equal(status, 403)
  })

  it('referensi tersimpan bersama kampanye dan bisa diganti lewat PATCH', async () => {
    const buat = await panggil('POST', '/api/kampanye', {
      token: tokenUmkm,
      body: {
        nama: 'Bakso Aci Referensi',
        kategori: 'Kuliner',
        lokasi: 'Bogor',
        targetViews: 1000,
        tarifPerView: 100,
        brief: ['Tunjukkan kuah panas'],
        referensi: [
          { url: 'https://youtu.be/dQw4w9WgXcQ', platform: 'youtube', judul: 'Review keripik', penulis: 'Dapur Mama' },
        ],
      },
    })
    assert.equal(buat.status, 201, JSON.stringify(buat.data))
    const id = buat.data.kampanye.id
    assert.deepEqual(buat.data.kampanye.referensi, [
      { platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', judul: 'Review keripik', penulis: 'Dapur Mama' },
    ])

    const ubah = await panggil('PATCH', `/api/kampanye/${id}`, {
      token: tokenUmkm,
      body: { referensi: ['https://www.instagram.com/reel/DeewiSPpCrm/'] },
    })
    assert.equal(ubah.status, 200, JSON.stringify(ubah.data))
    assert.equal(ubah.data.kampanye.referensi.length, 1)
    assert.equal(ubah.data.kampanye.referensi[0].platform, 'instagram')

    // PATCH tanpa field referensi tidak menghapusnya.
    const lagi = await panggil('PATCH', `/api/kampanye/${id}`, { token: tokenUmkm, body: { lokasi: 'Bogor Kota' } })
    assert.equal(lagi.data.kampanye.referensi.length, 1)
  })

  it('kampanye dengan tautan referensi rusak ditolak utuh', async () => {
    const { status } = await panggil('POST', '/api/kampanye', {
      token: tokenUmkm,
      body: {
        nama: 'Kampanye Rusak',
        kategori: 'Kuliner',
        lokasi: 'Bogor',
        targetViews: 1000,
        tarifPerView: 100,
        referensi: ['https://contoh.com/video'],
      },
    })
    assert.equal(status, 400)
    const daftar = await panggil('GET', '/api/kampanye?umkmId=x&q=Kampanye%20Rusak', { token: tokenUmkm })
    assert.equal(daftar.data.jumlah, 0)
  })
})
