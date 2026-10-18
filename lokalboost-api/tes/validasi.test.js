/**
 * Validasi isian: email, nomor HP, tautan profil kreator, dan field kampanye.
 *
 * Web punya salinan aturan yang sama (lokalboost-web/src/validasi.js), tapi
 * yang diuji di sini adalah pagar terakhirnya: API yang bisa dipanggil
 * langsung tanpa lewat formulir.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-tes-validasi-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
// Gerbang biaya pasang kampanye diuji sendiri di biaya-pasang.test.js.
process.env.BIAYA_PASANG_KAMPANYE = '0'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.MIDTRANS_SERVER_KEY = ''

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { emailSah, rapikanTelepon, teleponSah } = await import('../src/lib/validasi.js')

let server
let basis

async function panggil(metode, jalur, { token, body } = {}) {
  const res = await fetch(`${basis}${jalur}`, {
    method: metode,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

async function akunTerverifikasi(peran, email) {
  const d = await panggil('POST', '/api/auth/daftar', { body: { peran, nama: 'Uji Validasi', email, kataSandi: 'rahasia123' } })
  assert.equal(d.status, 201, JSON.stringify(d.data))
  const v = await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: email, kode: d.data.kodeOtp } })
  return v.data.token
}

before(async () => {
  const app = buatApp()
  await new Promise((r) => {
    server = app.listen(0, r)
  })
  basis = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((r) => server.close(r))
  db.close() // lepaskan kunci berkas sebelum dihapus (wajib di Windows)
  for (const akhiran of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbSementara + akhiran, { force: true })
    } catch {
      // Berkas sementara di %TEMP%; kalau masih terkunci, biarkan OS yang bersihkan.
    }
  }
})

describe('Aturan dasar', () => {
  it('email: menolak yang tidak punya inbox', () => {
    for (const salah of ['a@b.c', 'rafi@gmail', 'rafi@@gmail.com', 'ra fi@gmail.com', '.rafi@gmail.com', 'rafi..x@gmail.com', 'rafi@gmail.123']) {
      assert.equal(emailSah(salah), false, salah)
    }
    for (const benar of ['rafi@gmail.com', 'rafi.uji+lb@contoh.co.id', 'R.Pratama@Mail.ID']) {
      assert.equal(emailSah(benar), true, benar)
    }
  })

  it('nomor HP: membakukan ke 08xx dan menolak yang bukan seluler Indonesia', () => {
    assert.equal(rapikanTelepon('+62 812-3456-7890'), '081234567890')
    assert.equal(rapikanTelepon('62812 3456 7890'), '081234567890')
    assert.equal(rapikanTelepon('(0812) 3456.7890'), '081234567890')
    assert.equal(rapikanTelepon('812 3456 7890'), '081234567890')
    for (const salah of ['12345', '0212345678', '08123', '0812345678901234', '0812abc45678', '080123456789']) {
      assert.equal(teleponSah(salah), false, salah)
    }
  })
})

describe('POST /api/auth/daftar', () => {
  it('menolak email, nomor HP, dan nama yang tidak sah', async () => {
    const dasar = { peran: 'umkm', nama: 'Warung Uji', kataSandi: 'rahasia123' }
    const email = await panggil('POST', '/api/auth/daftar', { body: { ...dasar, email: 'a@b.c' } })
    assert.equal(email.status, 400)
    assert.match(email.data.galat, /email/i)

    const hp = await panggil('POST', '/api/auth/daftar', { body: { ...dasar, email: 'hp@contoh.id', telepon: '12345' } })
    assert.equal(hp.status, 400)
    assert.match(hp.data.galat, /Nomor HP/)

    const nama = await panggil('POST', '/api/auth/daftar', { body: { ...dasar, nama: ' x ', email: 'nama@contoh.id' } })
    assert.equal(nama.status, 400)
  })

  it('menyimpan nomor HP dalam bentuk baku, dan bentuk lain menemukan akun yang sama', async () => {
    const d = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'umkm', nama: 'Pemilik HP', email: 'pemilikhp@contoh.id', telepon: '+62 813-1111-2222', kataSandi: 'rahasia123' },
    })
    assert.equal(d.status, 201)
    assert.equal(d.data.pengguna.telepon, '081311112222')
    await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: 'pemilikhp@contoh.id', kode: d.data.kodeOtp } })

    const masuk = await panggil('POST', '/api/auth/masuk', { body: { identitas: '62 813 1111 2222', kataSandi: 'rahasia123' } })
    assert.equal(masuk.status, 200, JSON.stringify(masuk.data))
  })
})

describe('PUT /api/auth/profil (kreator)', () => {
  let token
  before(async () => {
    token = await akunTerverifikasi('kreator', 'kreatorvalidasi@contoh.id')
  })

  it('menolak tautan yang bukan profil TikTok / Instagram / YouTube', async () => {
    for (const salah of [
      'https://www.instagram.com/p/Cx123abc/',
      'https://www.youtube.com/watch?v=abcdefghijk',
      'https://youtu.be/abcdefghijk',
      'https://vt.tiktok.com/ZS123/',
      'https://facebook.com/rafi',
      'bukan tautan',
    ]) {
      const r = await panggil('PUT', '/api/auth/profil', { token, body: { portofolioUrl: salah } })
      assert.equal(r.status, 400, `${salah} seharusnya ditolak`)
    }
  })

  it('menerima tautan profil dan menyimpannya dalam bentuk baku', async () => {
    const cases = [
      ['tiktok.com/@Rafi.Jajan', 'https://www.tiktok.com/@rafi.jajan'],
      ['https://instagram.com/rafijajan/', 'https://www.instagram.com/rafijajan'],
      ['https://m.youtube.com/@RafiJajan', 'https://www.youtube.com/@rafijajan'],
    ]
    for (const [masuk, baku] of cases) {
      const r = await panggil('PUT', '/api/auth/profil', { token, body: { portofolioUrl: masuk } })
      assert.equal(r.status, 200, JSON.stringify(r.data))
      assert.equal(r.data.pengguna.profil.portofolio_url, baku)
    }
  })

  it('mengabaikan jumlah pengikut yang diketik kreator', async () => {
    const r = await panggil('PUT', '/api/auth/profil', { token, body: { pengikut: 9999999 } })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.pengguna.profil.pengikut, 0)
  })
})

describe('POST /api/kampanye', () => {
  let token
  before(async () => {
    token = await akunTerverifikasi('umkm', 'umkmvalidasi@contoh.id')
  })

  const dasar = { nama: 'Mie Aceh Uji', kategori: 'Kuliner', lokasi: 'Banda Aceh', targetViews: 1000, tarifPerView: 100 }

  it('menolak nama terlalu pendek, deskripsi asal-asalan, dan lama kampanye di luar 1-90 hari', async () => {
    assert.equal((await panggil('POST', '/api/kampanye', { token, body: { ...dasar, nama: 'Ab' } })).status, 400)
    assert.equal((await panggil('POST', '/api/kampanye', { token, body: { ...dasar, deskripsi: 'enak' } })).status, 400)
    assert.equal((await panggil('POST', '/api/kampanye', { token, body: { ...dasar, tenggatHari: 365 } })).status, 400)
    assert.equal((await panggil('POST', '/api/kampanye', { token, body: { ...dasar, brief: ['x'.repeat(201)] } })).status, 400)
  })

  it('menerima isian yang sah dan membuang poin brief yang kosong', async () => {
    const r = await panggil('POST', '/api/kampanye', {
      token,
      body: { ...dasar, deskripsi: 'Mie Aceh kuah kental dengan rempah.', brief: ['Tunjukkan kuahnya', '  ', ''] },
    })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    assert.deepEqual(r.data.kampanye.brief, ['Tunjukkan kuahnya'])
  })
})
