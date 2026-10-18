/**
 * Pemeriksaan etika kampanye: LokalBoost tidak boleh dipakai untuk
 * menjelekkan UMKM lain.
 *
 * Yang dijaga: aturan kata kunci membedakan klaim tentang produk sendiri
 * ("bakso kami tanpa boraks") dari tuduhan ke pihak lain ("warung sebelah
 * pakai boraks"); kampanye yang tidak lolos tidak bisa disetor dananya;
 * mengubah isi memicu pemeriksaan ulang; banding dan keputusan admin bekerja,
 * dan keputusan admin tidak bisa dilangkahi dengan menekan "periksa" lagi.
 *
 * AI dimatikan di sini, jadi yang teruji adalah lapis aturan + gerbangnya.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-moderasi-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
// Gerbang biaya pasang kampanye diuji sendiri di biaya-pasang.test.js.
process.env.BIAYA_PASANG_KAMPANYE = '0'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.MIDTRANS_SERVER_KEY = ''
process.env.GEMINI_API_KEY = ''
process.env.WAY_API_KEY = ''
process.env.NARA_API_KEY = ''
process.env.NVIDIA_API_KEY = ''
process.env.OPENROUTER_API_KEY = ''
process.env.ANTHROPIC_API_KEY = ''
process.env.SMTP_HOST = ''

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { hashSandi } = await import('../src/lib/auth.js')
const { periksaAturan, seragamkan, periksaIsiKampanye } = await import('../src/services/moderasi-kampanye.js')

let server
let basis

async function panggil(metode, jalur, { token, body } = {}) {
  const res = await fetch(`${basis}${jalur}`, {
    method: metode,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

async function akunUmkm(email) {
  const d = await panggil('POST', '/api/auth/daftar', {
    body: { peran: 'umkm', nama: 'Uji Moderasi', email, kataSandi: 'rahasia123' },
  })
  assert.equal(d.status, 201, JSON.stringify(d.data))
  const v = await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: email, kode: d.data.kodeOtp } })
  return v.data.token
}

const dasarKampanye = {
  kategori: 'Kuliner',
  lokasi: 'Banda Aceh',
  targetViews: 1000,
  tarifPerView: 50,
}

const tingkat = (teks) => periksaAturan([{ asal: 'Deskripsi', teks }]).tingkat

before(async () => {
  const app = buatApp()
  await new Promise((r) => {
    server = app.listen(0, r)
  })
  basis = `http://127.0.0.1:${server.address().port}`
  db.prepare(
    `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi)
     VALUES ('admin_moderasi', 'admin', 'Admin Tes', 'admin-moderasi@tes.id', ?, 1)`,
  ).run(hashSandi('rahasia123'))
  db.prepare("INSERT INTO dompet (pengguna_id) VALUES ('admin_moderasi')").run()
})

after(async () => {
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

describe('Aturan kata kunci', () => {
  it('meloloskan klaim tentang produk sendiri', () => {
    assert.equal(tingkat('Bakso kami tanpa boraks dan formalin, dimasak setiap pagi.'), 'aman')
    assert.equal(tingkat('Lebih hemat daripada jajan di mal. Datang ke warung kami di Lampineung!'), 'aman')
    assert.equal(tingkat('Ayam geprek pedas level 1-5, halal bersertifikat.'), 'aman')
  })

  it('menandai tuduhan ke pihak lain sebagai kuat', () => {
    assert.equal(tingkat('Jangan beli bakso di warung sebelah, pakai boraks!'), 'kuat')
    assert.equal(tingkat('Kompetitor kami pakai daging tikus.'), 'kuat')
    assert.equal(tingkat('Beda sama toko sebelah yang kotor dan jorok.'), 'kuat')
    assert.equal(tingkat('Awas sama @warungbusari, penipu!'), 'kuat')
  })

  it('tidak tertipu ejaan akal-akalan', () => {
    assert.equal(seragamkan('B0R4KS'), 'boraks')
    assert.equal(seragamkan('basiii'), 'basi')
    assert.equal(tingkat('Warung sebelah pakai b0r4ks lho'), 'kuat')
    assert.equal(tingkat('Toko sebelah f.o.r.m.a.l.i.n semua'), 'kuat')
  })

  it('menandai perbandingan dengan pihak lain sebagai sedang', () => {
    assert.equal(tingkat('Rasanya lebih enak dari warung sebelah.'), 'sedang')
  })

  it('menilai per kalimat, tidak menggabungkan kalimat yang tak berhubungan', () => {
    assert.equal(tingkat('Bakso kami tanpa boraks. Parkir luas di sebelah masjid.'), 'aman')
  })

  it('tanpa AI: pola kuat ditolak, sedang ditinjau, bersih lolos', async () => {
    const tolak = await periksaIsiKampanye({ nama: 'Bakso', deskripsi: 'Jangan beli di warung sebelah, basi semua.' })
    assert.equal(tolak.status, 'ditolak')
    assert.equal(tolak.sumber, 'aturan')
    assert.ok(tolak.temuan[0].kutipan.includes('warung sebelah'))
    assert.ok(tolak.saran)

    const tinjau = await periksaIsiKampanye({ nama: 'Bakso', deskripsi: 'Lebih enak dari warung sebelah.' })
    assert.equal(tinjau.status, 'tinjau')

    const lolos = await periksaIsiKampanye({ nama: 'Bakso Aci', deskripsi: 'Kuah gurih, aci kenyal, dimasak pagi.' })
    assert.equal(lolos.status, 'lolos')
  })

  it('memeriksa poin brief juga', async () => {
    const h = await periksaIsiKampanye({ nama: 'Kopi Gayo', deskripsi: 'Kopi asli Gayo.' }, [
      'Tunjukkan proses seduh.',
      'Bilang kopi di kedai sebelah itu oplosan.',
    ])
    assert.equal(h.status, 'ditolak')
    assert.equal(h.temuan[0].asal, 'Brief poin 2')
  })
})

describe('Gerbang sebelum dana masuk Rekber', () => {
  const k = {}

  it('kampanye bersih lolos dan bisa disetor', async () => {
    k.umkm = await akunUmkm('moderasi-bersih@tes.id')
    const buat = await panggil('POST', '/api/kampanye', {
      token: k.umkm,
      body: { ...dasarKampanye, nama: 'Mie Aceh Bersih', deskripsi: 'Mie Aceh kuah kental, porsi besar.' },
    })
    assert.equal(buat.status, 201)
    assert.equal(buat.data.kampanye.moderasiStatus, 'belum')

    const periksa = await panggil('POST', `/api/kampanye/${buat.data.kampanye.id}/periksa`, { token: k.umkm })
    assert.equal(periksa.status, 200)
    assert.equal(periksa.data.moderasi.status, 'lolos')

    const setor = await panggil('POST', `/api/kampanye/${buat.data.kampanye.id}/setor`, { token: k.umkm, body: {} })
    assert.equal(setor.status, 200, JSON.stringify(setor.data))
    assert.equal(setor.data.kampanye.status, 'berjalan')
  })

  it('kampanye yang menjelekkan ditolak di setor walau /periksa dilewati', async () => {
    const buat = await panggil('POST', '/api/kampanye', {
      token: k.umkm,
      body: {
        ...dasarKampanye,
        nama: 'Bakso Fitnah',
        deskripsi: 'Bakso kami enak. Jangan beli di warung sebelah, mereka pakai boraks!',
      },
    })
    k.idJahat = buat.data.kampanye.id

    const setor = await panggil('POST', `/api/kampanye/${k.idJahat}/setor`, { token: k.umkm, body: {} })
    assert.equal(setor.status, 422)
    assert.equal(setor.data.rincian.moderasi.status, 'ditolak')
    const status = db.prepare('SELECT status FROM kampanye WHERE id = ?').get(k.idJahat).status
    assert.equal(status, 'menunggu_dana', 'kampanye tidak boleh tayang')
    const escrow = db.prepare('SELECT jumlah_disetor FROM escrow WHERE kampanye_id = ?').get(k.idJahat)
    assert.equal(escrow.jumlah_disetor, 0)
  })

  it('mengubah isi memicu pemeriksaan ulang', async () => {
    const ubah = await panggil('PATCH', `/api/kampanye/${k.idJahat}`, {
      token: k.umkm,
      body: { deskripsi: 'Bakso urat dengan kuah kaldu sapi, dimasak setiap pagi.' },
    })
    assert.equal(ubah.status, 200)
    assert.equal(ubah.data.kampanye.moderasiStatus, 'belum')

    const periksa = await panggil('POST', `/api/kampanye/${k.idJahat}/periksa`, { token: k.umkm })
    assert.equal(periksa.data.moderasi.status, 'lolos')
  })

  it('banding membawa kampanye ke admin, dan putusan admin tidak bisa dilangkahi', async () => {
    const buat = await panggil('POST', '/api/kampanye', {
      token: k.umkm,
      body: {
        ...dasarKampanye,
        nama: 'Sate Banding',
        deskripsi: 'Jangan beli di warung lain, basi semua.',
      },
    })
    const id = buat.data.kampanye.id
    const periksa = await panggil('POST', `/api/kampanye/${id}/periksa`, { token: k.umkm })
    assert.equal(periksa.data.moderasi.status, 'ditolak')

    const banding = await panggil('POST', `/api/kampanye/${id}/banding`, {
      token: k.umkm,
      body: { alasan: 'Ini hanya contoh, tidak ditujukan ke usaha tertentu.' },
    })
    assert.equal(banding.status, 200, JSON.stringify(banding.data))
    assert.equal(banding.data.moderasi.status, 'tinjau')

    const masuk = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: 'admin-moderasi@tes.id', kataSandi: 'rahasia123' },
    })
    const admin = masuk.data.token
    const antrean = await panggil('GET', '/api/admin/moderasi-kampanye?status=tinjau', { token: admin })
    const baris = antrean.data.kampanye.find((x) => x.id === id)
    assert.ok(baris, 'kampanye harus ada di antrean admin')
    assert.ok(baris.moderasi.banding.includes('contoh'))

    const tanpaCatatan = await panggil('POST', `/api/admin/moderasi-kampanye/${id}`, {
      token: admin,
      body: { keputusan: 'ditolak' },
    })
    assert.equal(tanpaCatatan.status, 400)

    const tolak = await panggil('POST', `/api/admin/moderasi-kampanye/${id}`, {
      token: admin,
      body: { keputusan: 'ditolak', catatan: 'Menyebut warung lain basi.' },
    })
    assert.equal(tolak.status, 200)

    // Memeriksa ulang tanpa mengubah isi mengembalikan putusan admin.
    const lagi = await panggil('POST', `/api/kampanye/${id}/periksa`, { token: k.umkm })
    assert.equal(lagi.data.moderasi.status, 'ditolak')
    assert.equal(lagi.data.moderasi.keputusanAdmin.keputusan, 'ditolak')

    const bandingLagi = await panggil('POST', `/api/kampanye/${id}/banding`, {
      token: k.umkm,
      body: { alasan: 'Tolong ditinjau ulang sekali lagi ya.' },
    })
    assert.equal(bandingLagi.status, 409)

    const setor = await panggil('POST', `/api/kampanye/${id}/setor`, { token: k.umkm, body: {} })
    assert.equal(setor.status, 422)
  })

  it('UMKM lain tidak bisa memeriksa atau membanding kampanye orang lain', async () => {
    const lain = await akunUmkm('moderasi-lain@tes.id')
    const res = await panggil('POST', `/api/kampanye/${k.idJahat}/periksa`, { token: lain })
    assert.equal(res.status, 403)
  })
})

describe('Ucapan video kreator', () => {
  const k = {}

  async function kampanyeBerkreator(email, namaKampanye) {
    k.umkm = k.umkm || (await akunUmkm(email))
    const buat = await panggil('POST', '/api/kampanye', {
      token: k.umkm,
      body: { ...dasarKampanye, nama: namaKampanye, deskripsi: 'Kopi tubruk asli Gayo, disangrai harian.' },
    })
    const id = buat.data.kampanye.id
    await panggil('POST', `/api/kampanye/${id}/periksa`, { token: k.umkm })
    const setor = await panggil('POST', `/api/kampanye/${id}/setor`, { token: k.umkm, body: {} })
    assert.equal(setor.status, 200, JSON.stringify(setor.data))
    if (!k.kreator) {
      const d = await panggil('POST', '/api/auth/daftar', {
        body: { peran: 'kreator', nama: 'Kreator Uji', email: 'kreator-moderasi@tes.id', kataSandi: 'rahasia123' },
      })
      const v = await panggil('POST', '/api/auth/otp/verifikasi', {
        body: { identitas: 'kreator-moderasi@tes.id', kode: d.data.kodeOtp },
      })
      k.kreator = v.data.token
      k.kreatorId = v.data.pengguna.id
    }
    db.prepare("UPDATE kampanye SET kreator_id = ?, status = 'berjalan' WHERE id = ?").run(k.kreatorId, id)
    db.prepare(
      "INSERT INTO lamaran (kampanye_id, kreator_id, jenis, status) VALUES (?, ?, 'undangan', 'disetujui') ON CONFLICT(kampanye_id, kreator_id) DO UPDATE SET status = 'disetujui'",
    ).run(id, k.kreatorId)
    return id
  }

  async function unggahDanProses(kampanyeId, judul, naskah) {
    const v = await panggil('POST', '/api/video', { token: k.kreator, body: { kampanyeId, judul } })
    assert.equal(v.status, 201, JSON.stringify(v.data))
    const p = await panggil('POST', `/api/video/${v.data.video.id}/proses`, { token: k.kreator, body: { naskah } })
    assert.equal(p.status, 200, JSON.stringify(p.data))
    return p.data.video
  }

  it('menahan video yang ucapannya menuduh usaha lain, lalu memberi tahu kreator', async () => {
    const id = await kampanyeBerkreator('moderasi-video@tes.id', 'Kopi Gayo Video')
    const video = await unggahDanProses(
      id,
      'Review kopi Gayo',
      'Kopi ini juara. Jangan beli kopi di kedai sebelah, mereka oplos dengan jagung dan basi.',
    )
    assert.equal(video.moderasi, 'revisi')
    assert.equal(video.status, 'ditolak')
    assert.equal(video.etika.status, 'ditolak')
    assert.equal(video.etika.ucapanTerperiksa, false, 'tanpa Gemini, hanya naskah yang diperiksa')
    assert.match(video.catatanModerasi, /menjelekkan usaha lain/)
  })

  it('video bersih tetap menunggu admin, tidak diloloskan otomatis', async () => {
    const id = await kampanyeBerkreator('moderasi-video@tes.id', 'Kopi Gayo Bersih')
    const video = await unggahDanProses(id, 'Seduh kopi Gayo', 'Kopi Gayo disangrai pagi ini. Datang ke Lampineung ya!')
    assert.equal(video.moderasi, 'menunggu')
    assert.equal(video.status, 'tayang')
    assert.equal(video.etika.status, 'lolos')
  })

  it('judul video ikut diperiksa', async () => {
    const id = await kampanyeBerkreator('moderasi-video@tes.id', 'Kopi Gayo Judul')
    const video = await unggahDanProses(id, 'Kedai sebelah penipu, jangan beli', 'Kopi enak.')
    assert.equal(video.moderasi, 'revisi')
  })

  it('video yang sudah diloloskan admin tidak dibalik otomatis oleh proses ulang', async () => {
    const id = await kampanyeBerkreator('moderasi-video@tes.id', 'Kopi Gayo Ulang')
    const video = await unggahDanProses(id, 'Kopi Gayo', 'Kopi enak sekali.')
    db.prepare("UPDATE video SET moderasi = 'lolos' WHERE id = ?").run(video.id)
    const p = await panggil('POST', `/api/video/${video.id}/proses`, {
      token: k.kreator,
      body: { naskah: 'Kedai sebelah pakai boraks, jangan beli.' },
    })
    assert.equal(p.data.video.moderasi, 'lolos', 'putusan admin tidak boleh dibatalkan sistem')
  })
})

describe('Persetujuan pemilik usaha atas video yang ditahan otomatis', () => {
  const k = {}

  async function videoDitahan(namaKampanye, emailKreator) {
    k.umkm = await akunUmkm(`umkm-${namaKampanye.replace(/\W/g, '')}@tes.id`)
    const buat = await panggil('POST', '/api/kampanye', {
      token: k.umkm,
      body: { ...dasarKampanye, nama: namaKampanye, deskripsi: 'Kopi tubruk asli Gayo, disangrai harian.' },
    })
    const id = buat.data.kampanye.id
    await panggil('POST', `/api/kampanye/${id}/periksa`, { token: k.umkm })
    await panggil('POST', `/api/kampanye/${id}/setor`, { token: k.umkm, body: {} })
    const d = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'kreator', nama: 'Kreator Setuju', email: emailKreator, kataSandi: 'rahasia123' },
    })
    const v = await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: emailKreator, kode: d.data.kodeOtp } })
    k.kreator = v.data.token
    db.prepare("UPDATE kampanye SET kreator_id = ?, status = 'berjalan' WHERE id = ?").run(v.data.pengguna.id, id)
    db.prepare(
      "INSERT INTO lamaran (kampanye_id, kreator_id, jenis, status) VALUES (?, ?, 'undangan', 'disetujui') ON CONFLICT(kampanye_id, kreator_id) DO UPDATE SET status = 'disetujui'",
    ).run(id, v.data.pengguna.id)
    const vid = await panggil('POST', '/api/video', { token: k.kreator, body: { kampanyeId: id, judul: 'Review kopi' } })
    const proses = await panggil('POST', `/api/video/${vid.data.video.id}/proses`, {
      token: k.kreator,
      body: { naskah: 'Jangan beli kopi di kedai sebelah, basi semua.' },
    })
    assert.equal(proses.data.video.moderasi, 'revisi')
    return { kampanyeId: id, videoId: vid.data.video.id }
  }

  it('pemilik usaha menyetujui, lalu tayangan dibayar lagi', async () => {
    const { kampanyeId, videoId } = await videoDitahan('Kopi Setuju', 'kreator-setuju@tes.id')

    const tayang = () =>
      fetch(`${basis}/api/tayangan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId, ip: '203.0.113.9', durasiTonton: 20, userAgent: 'Mozilla/5.0' }),
      }).then((r) => r.json())

    const sebelum = await tayang()
    assert.equal(sebelum.dihitung, false, 'video ditahan tidak menghitung tayangan')
    assert.match(sebelum.alasan, /revisi/)

    const tanpaAlasan = await panggil('POST', `/api/video/${videoId}/setujui-umkm`, { token: k.umkm, body: {} })
    assert.equal(tanpaAlasan.status, 400)

    const setuju = await panggil('POST', `/api/video/${videoId}/setujui-umkm`, {
      token: k.umkm,
      body: { alasan: 'Sudah saya tonton, kedai sebelah itu cabang kami sendiri.' },
    })
    assert.equal(setuju.status, 200, JSON.stringify(setuju.data))
    assert.equal(setuju.data.video.moderasi, 'lolos')
    assert.equal(setuju.data.video.status, 'tayang')
    assert.ok(setuju.data.video.etika.keputusanUmkm.alasan.includes('cabang'))

    const sesudah = await tayang()
    assert.doesNotMatch(sesudah.alasan || '', /revisi/, 'setelah disetujui, video tidak lagi ditahan')
    assert.ok(kampanyeId)
  })

  it('UMKM lain dan kreator tidak boleh menyetujui', async () => {
    const { videoId } = await videoDitahan('Kopi Terlarang', 'kreator-terlarang@tes.id')
    const lain = await akunUmkm('umkm-penyusup@tes.id')
    const a = await panggil('POST', `/api/video/${videoId}/setujui-umkm`, {
      token: lain,
      body: { alasan: 'Saya mau menyetujui video orang lain.' },
    })
    assert.equal(a.status, 403)
    const b = await panggil('POST', `/api/video/${videoId}/setujui-umkm`, {
      token: k.kreator,
      body: { alasan: 'Saya kreatornya, setujui sendiri.' },
    })
    assert.equal(b.status, 403)
  })

  it('putusan admin mengikat: pemilik usaha tidak bisa membatalkannya', async () => {
    const { videoId } = await videoDitahan('Kopi Admin', 'kreator-admin@tes.id')
    const masuk = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: 'admin-moderasi@tes.id', kataSandi: 'rahasia123' },
    })
    const putus = await panggil('POST', `/api/admin/konten/${videoId}/moderasi`, {
      token: masuk.data.token,
      body: { keputusan: 'revisi', catatan: 'Memang menyerang kedai lain.' },
    })
    assert.equal(putus.status, 200)

    const coba = await panggil('POST', `/api/video/${videoId}/setujui-umkm`, {
      token: k.umkm,
      body: { alasan: 'Saya tetap mau meloloskan video ini.' },
    })
    assert.equal(coba.status, 409)
  })

  it('video yang tidak ditahan tidak perlu disetujui', async () => {
    const { videoId } = await videoDitahan('Kopi Bersih Lagi', 'kreator-bersih@tes.id')
    db.prepare("UPDATE video SET moderasi = 'menunggu', status = 'tayang', etika_hasil = NULL WHERE id = ?").run(videoId)
    const coba = await panggil('POST', `/api/video/${videoId}/setujui-umkm`, {
      token: k.umkm,
      body: { alasan: 'Tidak ada yang perlu disetujui di sini.' },
    })
    assert.equal(coba.status, 409)
  })
})
