/**
 * Halaman Edit Profil: foto profil + akun media sosial untuk UMKM dan kreator.
 *
 * Yang dijaga: foto hanya JPG/PNG/WebP sungguhan (SVG dan berkas palsu
 * ditolak), akun sosial dibakukan dan tidak boleh tertukar platform, dan
 * data itu benar-benar muncul di profil publik kreator serta detail kampanye.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const stempel = Date.now()
const dbSementara = path.join(os.tmpdir(), `lokalboost-tes-profil-${stempel}.db`)
const folderUnggahan = path.join(os.tmpdir(), `lokalboost-tes-profil-unggahan-${stempel}`)
process.env.DB_PATH = dbSementara
process.env.FOLDER_UNGGAHAN = folderUnggahan
process.env.NODE_ENV = 'test'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.MIDTRANS_SERVER_KEY = ''
process.env.BLOB_READ_WRITE_TOKEN = ''

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { bakukanAkunSosial } = await import('../src/services/akun-sosial.js')

let server
let basis

async function panggil(metode, jalur, { token, body, berkas } = {}) {
  const res = await fetch(`${basis}${jalur}`, {
    method: metode,
    headers: {
      ...(berkas ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(berkas ? { body: berkas } : body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

async function akunTerverifikasi(peran, email) {
  const d = await panggil('POST', '/api/auth/daftar', { body: { peran, nama: 'Uji Profil', email, kataSandi: 'rahasia123' } })
  assert.equal(d.status, 201, JSON.stringify(d.data))
  const v = await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: email, kode: d.data.kodeOtp } })
  return { token: v.data.token, id: v.data.pengguna.id }
}

// PNG 1x1 yang sah.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function formFoto(isi, nama, jenis) {
  const fd = new FormData()
  fd.append('foto', new Blob([isi], { type: jenis }), nama)
  return fd
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
  db.close()
  for (const akhiran of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbSementara + akhiran, { force: true })
    } catch {
      // Windows kadang masih memegang berkasnya sesaat; sisa di folder temp tidak apa-apa.
    }
  }
  fs.rmSync(folderUnggahan, { recursive: true, force: true })
})

describe('bakukanAkunSosial', () => {
  it('menerima nama akun polos, @akun, dan tautan lengkap', () => {
    assert.equal(bakukanAkunSosial('instagram', '@warung.sunda'), 'https://www.instagram.com/warung.sunda')
    assert.equal(bakukanAkunSosial('tiktok', 'rafi_kuliner'), 'https://www.tiktok.com/@rafi_kuliner')
    assert.equal(bakukanAkunSosial('youtube', 'https://youtube.com/@SariMasak'), 'https://www.youtube.com/@sarimasak')
    assert.equal(bakukanAkunSosial('tiktok', 'tiktok.com/@abc.def'), 'https://www.tiktok.com/@abc.def')
  })

  it('kosong berarti hapus', () => {
    assert.equal(bakukanAkunSosial('tiktok', '   '), null)
  })

  it('menolak tautan platform lain di kolom yang salah', () => {
    assert.throws(() => bakukanAkunSosial('instagram', 'https://www.tiktok.com/@rafi'), /berisi tautan TikTok/)
  })

  it('menolak tautan postingan dan nama akun tidak sah', () => {
    assert.throws(() => bakukanAkunSosial('instagram', 'https://www.instagram.com/p/abc123'), /Instagram/)
    assert.throws(() => bakukanAkunSosial('tiktok', 'nama dengan spasi'), /TikTok/)
  })
})

describe('PUT /api/auth/profil dengan akun sosial', () => {
  it('UMKM menyimpan nama, lokasi, dan akun sosial; kampanye memajangnya', async () => {
    const { token, id } = await akunTerverifikasi('umkm', `umkm-${stempel}@uji.id`)
    const r = await panggil('PUT', '/api/auth/profil', {
      token,
      body: {
        nama: 'Bu Sari',
        namaUsaha: 'Warung Sari',
        lokasi: 'Banda Aceh',
        sosial: { instagram: '@warung.sari', tiktok: '' },
      },
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.pengguna.nama, 'Bu Sari')
    assert.equal(r.data.pengguna.profil.lokasi, 'Banda Aceh')
    assert.equal(r.data.pengguna.sosial.instagram, 'https://www.instagram.com/warung.sari')
    assert.equal(r.data.pengguna.sosial.tiktok, null)

    db.prepare(
      `INSERT INTO kampanye (id, umkm_id, nama, kategori, lokasi, target_views, tarif_per_view, anggaran, batas_maks_biaya, status)
       VALUES ('uji-profil-${stempel}', ?, 'Kampanye Uji', 'Kuliner', 'Banda Aceh', 1000, 50, 50000, 50000, 'terbuka')`,
    ).run(id)
    const k = await panggil('GET', `/api/kampanye/uji-profil-${stempel}`)
    assert.equal(k.status, 200, JSON.stringify(k.data))
    const kampanye = k.data.kampanye || k.data
    assert.equal(kampanye.umkmProfil.lokasi, 'Banda Aceh')
    assert.equal(kampanye.umkmProfil.sosial.instagram, 'https://www.instagram.com/warung.sari')
  })

  it('satu kolom salah menolak seluruh simpanan (nama tidak ikut berubah)', async () => {
    const { token } = await akunTerverifikasi('umkm', `umkm2-${stempel}@uji.id`)
    const r = await panggil('PUT', '/api/auth/profil', {
      token,
      body: { nama: 'Nama Baru', sosial: { youtube: 'https://www.tiktok.com/@salah' } },
    })
    assert.equal(r.status, 400)
    const saya = await panggil('GET', '/api/auth/saya', { token })
    assert.equal(saya.data.pengguna.nama, 'Uji Profil')
  })

  it('kreator: tautan utama ikut berganti dan profil publik memajang akun sosial', async () => {
    const { token, id } = await akunTerverifikasi('kreator', `kreator-${stempel}@uji.id`)
    await panggil('PUT', '/api/auth/profil', {
      token,
      body: { niche: 'Kuliner', lokasi: 'Banda Aceh', portofolioUrl: 'https://www.tiktok.com/@lama_akun' },
    })
    const awal = await panggil('GET', '/api/auth/saya', { token })
    // Tautan pendaftaran tampil di kolom platformnya walau belum diisi ulang.
    assert.equal(awal.data.pengguna.sosial.tiktok, 'https://www.tiktok.com/@lama_akun')

    const r = await panggil('PUT', '/api/auth/profil', {
      token,
      body: { sosial: { tiktok: '@baru_akun', youtube: '@kanalbaru' } },
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.pengguna.profil.portofolio_url, 'https://www.tiktok.com/@baru_akun')

    const publik = await panggil('GET', `/api/kreator/${id}`)
    assert.equal(publik.data.kreator.sosial.tiktok, 'https://www.tiktok.com/@baru_akun')
    assert.equal(publik.data.kreator.sosial.youtube, 'https://www.youtube.com/@kanalbaru')

    // Hapus TikTok: tautan utama pindah ke akun yang masih ada.
    const h = await panggil('PUT', '/api/auth/profil', { token, body: { sosial: { tiktok: '' } } })
    assert.equal(h.data.pengguna.profil.portofolio_url, 'https://www.youtube.com/@kanalbaru')
  })
})

describe('Foto profil', () => {
  it('unggah PNG sah, tampil di profil, lalu bisa diganti dan dihapus', async () => {
    const { token, id } = await akunTerverifikasi('kreator', `foto-${stempel}@uji.id`)
    const r = await panggil('POST', '/api/auth/foto', { token, berkas: formFoto(PNG, 'saya.png', 'image/png') })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.match(r.data.foto, /^\/unggahan\/foto_.+\.png$/)
    assert.equal(r.data.pengguna.profil.foto, r.data.foto)
    const berkasPertama = path.join(folderUnggahan, path.basename(r.data.foto))
    assert.ok(fs.existsSync(berkasPertama))

    const dilayani = await fetch(`${basis}${r.data.foto}`)
    assert.equal(dilayani.status, 200)

    const publik = await panggil('GET', `/api/kreator/${id}`)
    assert.equal(publik.data.kreator.foto, r.data.foto)

    // Ganti: berkas lama dibuang supaya folder tidak menumpuk.
    const g = await panggil('POST', '/api/auth/foto', { token, berkas: formFoto(PNG, 'baru.png', 'image/png') })
    assert.equal(g.status, 200)
    assert.ok(!fs.existsSync(berkasPertama))

    const h = await panggil('DELETE', '/api/auth/foto', { token })
    assert.equal(h.status, 200)
    assert.equal(h.data.pengguna.profil.foto, null)
    assert.ok(!fs.existsSync(path.join(folderUnggahan, path.basename(g.data.foto))))
  })

  it('UMKM juga bisa punya foto (logo toko)', async () => {
    const { token } = await akunTerverifikasi('umkm', `foto-umkm-${stempel}@uji.id`)
    const r = await panggil('POST', '/api/auth/foto', { token, berkas: formFoto(PNG, 'logo.png', 'image/png') })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.pengguna.profil.foto, r.data.foto)
  })

  it('menolak SVG, berkas palsu, dan permintaan tanpa login', async () => {
    const { token } = await akunTerverifikasi('kreator', `foto-tolak-${stempel}@uji.id`)
    const svg = await panggil('POST', '/api/auth/foto', {
      token,
      berkas: formFoto('<svg onload="alert(1)"/>', 'x.svg', 'image/svg+xml'),
    })
    assert.equal(svg.status, 400)

    const palsu = await panggil('POST', '/api/auth/foto', {
      token,
      berkas: formFoto('<html><script>alert(1)</script></html>', 'x.png', 'image/png'),
    })
    assert.equal(palsu.status, 400)
    assert.match(palsu.data.galat, /bukan foto/)
    const sisa = fs.existsSync(folderUnggahan) ? fs.readdirSync(folderUnggahan) : []
    assert.ok(!sisa.some((n) => n.endsWith('.png') && fs.readFileSync(path.join(folderUnggahan, n), 'utf8').includes('script')))

    const tanpaLogin = await panggil('POST', '/api/auth/foto', { berkas: formFoto(PNG, 'a.png', 'image/png') })
    assert.equal(tanpaLogin.status, 401)
  })

  it('menolak foto di atas 2 MB', async () => {
    const { token } = await akunTerverifikasi('kreator', `foto-besar-${stempel}@uji.id`)
    const besar = Buffer.concat([PNG, Buffer.alloc(2.2 * 1024 * 1024)])
    const r = await panggil('POST', '/api/auth/foto', { token, berkas: formFoto(besar, 'besar.png', 'image/png') })
    assert.equal(r.status, 400)
    assert.match(r.data.galat, /2 MB/)
  })
})
