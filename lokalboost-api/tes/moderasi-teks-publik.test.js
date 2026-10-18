/**
 * Pemeriksaan etika untuk teks publik di luar kampanye: bio/deskripsi profil,
 * komentar ulasan, dan video referensi.
 *
 * Yang dijaga: kritik jujur kepada mitra kampanye tetap boleh, tapi menyerang
 * pihak ketiga ditolak; yang samar tetap tersimpan lalu masuk antrean admin
 * dan bisa dihapus; referensi yang menyerang pihak lain tidak dipakai.
 *
 * AI dimatikan: yang teruji adalah lapis aturan dan jalur penyambungannya.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-teks-publik-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.MIDTRANS_SERVER_KEY = ''
process.env.SCRAPECREATORS_API_KEY = ''
for (const k of ['GEMINI', 'WAY', 'NARA', 'NVIDIA', 'OPENROUTER', 'ANTHROPIC']) process.env[`${k}_API_KEY`] = ''
process.env.SMTP_HOST = ''

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { hashSandi } = await import('../src/lib/auth.js')

// oEmbed TikTok palsu: judul tergantung nomor video pada tautannya.
const fetchAsli = globalThis.fetch
globalThis.fetch = async (url, opsi) => {
  const u = new URL(String(url))
  if (u.host === 'www.tiktok.com' && u.pathname === '/oembed') {
    const judul = u.searchParams.get('url').includes('7001')
      ? 'Jangan beli di warung sebelah, mereka pakai boraks! #spill'
      : 'Cara bikin sambal matah #resep'
    return Response.json({ title: judul, author_name: 'Akun Uji' })
  }
  return fetchAsli(url, opsi)
}

let server
let basis

async function panggil(metode, jalur, { token, body } = {}) {
  const res = await fetchAsli(`${basis}${jalur}`, {
    method: metode,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

async function daftarkan(peran, email) {
  const d = await panggil('POST', '/api/auth/daftar', { body: { peran, nama: 'Uji Teks', email, kataSandi: 'rahasia123' } })
  assert.equal(d.status, 201, JSON.stringify(d.data))
  const v = await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: email, kode: d.data.kodeOtp } })
  return { token: v.data.token, id: v.data.pengguna.id }
}

before(async () => {
  server = buatApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  basis = `http://127.0.0.1:${server.address().port}`
  db.prepare(
    `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi)
     VALUES ('admin_teks', 'admin', 'Admin Tes', 'admin-teks@tes.id', ?, 1)`,
  ).run(hashSandi('rahasia123'))
  db.prepare("INSERT INTO dompet (pengguna_id) VALUES ('admin_teks')").run()
})

after(async () => {
  globalThis.fetch = fetchAsli
  await new Promise((r) => server.close(r))
  db.close()
  for (const akhiran of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbSementara + akhiran, { force: true })
    } catch {
      // Windows kadang masih memegang berkasnya sesaat.
    }
  }
})

async function tokenAdmin() {
  const m = await panggil('POST', '/api/auth/masuk', { body: { identitas: 'admin-teks@tes.id', kataSandi: 'rahasia123' } })
  return m.data.token
}

describe('Bio dan deskripsi profil', () => {
  it('menolak bio kreator yang menyerang usaha lain dan tidak mengubah profil', async () => {
    const k = await daftarkan('kreator', 'bio-kreator@tes.id')
    await panggil('PUT', '/api/auth/profil', { token: k.token, body: { bio: 'Konten kuliner santai dan jujur.' } })

    const tolak = await panggil('PUT', '/api/auth/profil', {
      token: k.token,
      body: { bio: 'Spill kedai sebelah yang pakai boraks, jangan beli di sana.' },
    })
    assert.equal(tolak.status, 422, JSON.stringify(tolak.data))
    assert.ok(tolak.data.rincian.moderasi.temuan.length > 0)

    const bio = db.prepare('SELECT bio FROM profil_kreator WHERE pengguna_id = ?').get(k.id).bio
    assert.equal(bio, 'Konten kuliner santai dan jujur.', 'penolakan tidak boleh mengubah bio lama')
  })

  it('menolak deskripsi usaha UMKM yang menuduh kompetitor', async () => {
    const u = await daftarkan('umkm', 'bio-umkm@tes.id')
    const tolak = await panggil('PUT', '/api/auth/profil', {
      token: u.token,
      body: { namaUsaha: 'Warung Uji', deskripsi: 'Kompetitor kami penipu dan tidak higienis.' },
    })
    assert.equal(tolak.status, 422)
    const ok = await panggil('PUT', '/api/auth/profil', {
      token: u.token,
      body: { namaUsaha: 'Warung Uji', deskripsi: 'Masakan rumahan Aceh, dimasak setiap pagi.' },
    })
    assert.equal(ok.status, 200)
  })

  it('bio yang samar tersimpan, masuk antrean admin, dan bisa dihapus', async () => {
    const k = await daftarkan('kreator', 'bio-samar@tes.id')
    const simpan = await panggil('PUT', '/api/auth/profil', {
      token: k.token,
      body: { bio: 'Review jujur, lebih enak dari warung sebelah.' },
    })
    assert.equal(simpan.status, 200, JSON.stringify(simpan.data))

    const admin = await tokenAdmin()
    const antrean = await panggil('GET', '/api/admin/penandaan-etika', { token: admin })
    const baris = antrean.data.penandaan.find((t) => t.pengguna === 'Uji Teks' && t.jenis === 'bio_kreator')
    assert.ok(baris, 'harus masuk antrean')

    const hapus = await panggil('POST', `/api/admin/penandaan-etika/${baris.id}`, { token: admin, body: { tindakan: 'hapus' } })
    assert.equal(hapus.status, 200)
    const bio = db.prepare('SELECT bio FROM profil_kreator WHERE pengguna_id = ?').get(k.id).bio
    assert.equal(bio, null)

    const lagi = await panggil('POST', `/api/admin/penandaan-etika/${baris.id}`, { token: admin, body: { tindakan: 'biarkan' } })
    assert.equal(lagi.status, 404, 'penandaan yang sudah diputus tidak bisa diputus ulang')
  })

  it('hanya admin yang boleh melihat antrean penandaan', async () => {
    const k = await daftarkan('kreator', 'bio-intip@tes.id')
    const res = await panggil('GET', '/api/admin/penandaan-etika', { token: k.token })
    assert.equal(res.status, 403)
  })
})

describe('Komentar ulasan', () => {
  const k = {}

  before(async () => {
    k.umkm = await daftarkan('umkm', 'ulasan-umkm@tes.id')
    k.kreator = await daftarkan('kreator', 'ulasan-kreator@tes.id')
  })

  async function kampanyeSelesai(nama) {
    const buat = await panggil('POST', '/api/kampanye', {
      token: k.umkm.token,
      body: { nama, kategori: 'Kuliner', lokasi: 'Banda Aceh', targetViews: 1000, tarifPerView: 50, deskripsi: 'Kopi tubruk asli Gayo.' },
    })
    const id = buat.data.kampanye.id
    db.prepare("UPDATE kampanye SET kreator_id = ?, status = 'selesai' WHERE id = ?").run(k.kreator.id, id)
    db.prepare(
      "INSERT INTO lamaran (kampanye_id, kreator_id, jenis, status) VALUES (?, ?, 'undangan', 'disetujui') ON CONFLICT(kampanye_id, kreator_id) DO UPDATE SET status = 'disetujui'",
    ).run(id, k.kreator.id)
    return id
  }

  it('kritik keras kepada mitra kampanye tetap boleh', async () => {
    const id = await kampanyeSelesai('Kopi Ulasan Satu')
    const res = await panggil('POST', '/api/ulasan', {
      token: k.umkm.token,
      body: { kampanyeId: id, bintang: 2, komentar: 'Kreatornya telat mengunggah dan tidak sesuai brief. Mengecewakan.' },
    })
    assert.equal(res.status, 201, JSON.stringify(res.data))
  })

  it('menolak ulasan yang menyerang pihak ketiga, dan ulasannya tidak tersimpan', async () => {
    const id = await kampanyeSelesai('Kopi Ulasan Dua')
    const res = await panggil('POST', '/api/ulasan', {
      token: k.umkm.token,
      body: { kampanyeId: id, bintang: 5, komentar: 'Kreatornya bagus. Tapi jangan beli di warung sebelah, penipu semua.' },
    })
    assert.equal(res.status, 422, JSON.stringify(res.data))
    const n = db.prepare('SELECT COUNT(*) AS n FROM ulasan WHERE kampanye_id = ?').get(id).n
    assert.equal(n, 0)

    // Setelah ditulis ulang, bisa dikirim: penolakan tidak menghabiskan jatah satu ulasan.
    const ulang = await panggil('POST', '/api/ulasan', {
      token: k.umkm.token,
      body: { kampanyeId: id, bintang: 5, komentar: 'Kreatornya bagus dan tepat waktu.' },
    })
    assert.equal(ulang.status, 201)
  })

  it('ulasan samar tersimpan lalu dihapus komentarnya oleh admin, bintang tetap', async () => {
    const id = await kampanyeSelesai('Kopi Ulasan Tiga')
    const res = await panggil('POST', '/api/ulasan', {
      token: k.umkm.token,
      body: { kampanyeId: id, bintang: 4, komentar: 'Hasilnya lebih bagus dari warung sebelah.' },
    })
    assert.equal(res.status, 201, JSON.stringify(res.data))

    const admin = await tokenAdmin()
    const antrean = await panggil('GET', '/api/admin/penandaan-etika', { token: admin })
    const baris = antrean.data.penandaan.find((t) => t.jenis === 'ulasan' && t.teks.includes('lebih bagus'))
    assert.ok(baris)
    await panggil('POST', `/api/admin/penandaan-etika/${baris.id}`, { token: admin, body: { tindakan: 'hapus' } })

    const u = db.prepare('SELECT bintang, komentar FROM ulasan WHERE kampanye_id = ?').get(id)
    assert.equal(u.komentar, null)
    assert.equal(u.bintang, 4)
  })
})

describe('Video referensi', () => {
  let umkm

  before(async () => {
    umkm = await daftarkan('umkm', 'referensi-umkm@tes.id')
  })

  it('membuang referensi yang menyerang pihak lain dan tetap menyusun brief dari yang layak', async () => {
    const res = await panggil('POST', '/api/ai/brief-referensi', {
      token: umkm.token,
      body: {
        tautan: [
          'https://www.tiktok.com/@akunjahat/video/7001000000000000001',
          'https://www.tiktok.com/@akunbaik/video/7002000000000000002',
        ],
        nama: 'Sambal Matah',
        kategori: 'Kuliner',
        lokasi: 'Banda Aceh',
      },
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const jahat = res.data.referensi.find((r) => r.url.includes('7001'))
    const baik = res.data.referensi.find((r) => r.url.includes('7002'))
    assert.equal(jahat.ditolakEtika, true)
    assert.equal(baik.ditolakEtika, false)
    assert.ok(res.data.brief.poin.length > 0)
  })

  it('menolak 422 bila semua referensi menyerang pihak lain', async () => {
    const res = await panggil('POST', '/api/ai/brief-referensi', {
      token: umkm.token,
      body: { tautan: ['https://www.tiktok.com/@akunjahat/video/7001000000000000001'] },
    })
    assert.equal(res.status, 422)
    assert.ok(res.data.rincian.referensi[0].ditolakEtika)
  })

  it('judul referensi tersimpan ikut diperiksa saat kampanye dibayar', async () => {
    const buat = await panggil('POST', '/api/kampanye', {
      token: umkm.token,
      body: {
        nama: 'Sambal Referensi',
        kategori: 'Kuliner',
        lokasi: 'Banda Aceh',
        targetViews: 1000,
        tarifPerView: 50,
        deskripsi: 'Sambal matah segar buatan rumah.',
        referensi: [
          {
            url: 'https://www.tiktok.com/@akunjahat/video/7001000000000000001',
            judul: 'Jangan beli di warung sebelah, mereka pakai boraks',
            penulis: 'Akun Uji',
          },
        ],
      },
    })
    assert.equal(buat.status, 201, JSON.stringify(buat.data))
    const periksa = await panggil('POST', `/api/kampanye/${buat.data.kampanye.id}/periksa`, { token: umkm.token })
    assert.equal(periksa.data.moderasi.status, 'ditolak')
    assert.ok(periksa.data.moderasi.temuan.some((t) => t.asal.startsWith('Referensi')))
  })
})
