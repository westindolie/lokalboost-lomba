/**
 * Tes bagian yang tidak dilewati alur utama.
 *
 * `alur.test.js` menempuh perjalanan UMKM–kreator dari pendaftaran sampai
 * ulasan. Berkas ini menutup sisanya: ruang Admin Platform (PRD §4.3),
 * moderasi konten, keputusan sengketa berikut pemulihan tayangan (PRD §15),
 * direktori kreator, notifikasi, dan penjaga otorisasi di tiap rute.
 *
 * Jalankan: npm test
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-admin-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
// Gerbang biaya pasang kampanye diuji sendiri di biaya-pasang.test.js.
process.env.BIAYA_PASANG_KAMPANYE = '0'
// Tes membaca kode OTP dari respons. Dikunci di sini karena .env laptop
// sengaja memakai BOCORKAN_OTP=false, dan dotenv tidak menimpa nilai yang sudah ada.
process.env.BOCORKAN_OTP = 'true'
// Tes selalu memakai berkas sementara, tidak pernah basis data Turso sungguhan.
process.env.TURSO_DATABASE_URL = ''
// Setor dana simulasi. Midtrans diuji terpisah di midtrans.test.js.
process.env.MIDTRANS_SERVER_KEY = ''
process.env.KOMISI_PERSEN = '0'

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { hashSandi } = await import('../src/lib/auth.js')

let server
let basis

const UA_ASLI = 'Mozilla/5.0 (Linux; Android 13; SM-A536B) Chrome/120 Mobile Safari/537.36'


/** Syarat ikut kampanye: profil lengkap + minimal satu akun terverifikasi. */
function jadikanLayak(id) {
  db.prepare("INSERT OR IGNORE INTO profil_kreator (pengguna_id) VALUES (?)").run(id)
  db.prepare(
    `UPDATE profil_kreator SET niche = COALESCE(NULLIF(niche, ''), 'Kuliner'),
       lokasi = COALESCE(NULLIF(lokasi, ''), 'Bogor'), bio = COALESCE(NULLIF(bio, ''), 'Konten kuliner kaki lima')
     WHERE pengguna_id = ?`,
  ).run(id)
  db.prepare(
    "INSERT OR REPLACE INTO statistik_terukur (kreator_id, platform, akun, penilaian) VALUES (?, 'tiktok', ?, '{}')",
  ).run(id, `uji_${id}`)
}

async function panggil(metode, jalur, { token, body } = {}) {
  const res = await fetch(`${basis}${jalur}`, {
    method: metode,
    headers: {
      'content-type': 'application/json',
      'user-agent': UA_ASLI,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function daftarkan({ peran, nama, email }) {
  const daftar = await panggil('POST', '/api/auth/daftar', {
    body: { peran, nama, email, kataSandi: 'rahasia123' },
  })
  assert.equal(daftar.status, 201, JSON.stringify(daftar.data))
  const verif = await panggil('POST', '/api/auth/otp/verifikasi', {
    body: { identitas: email, kode: daftar.data.kodeOtp },
  })
  assert.equal(verif.status, 200, JSON.stringify(verif.data))
  return { token: verif.data.token, id: verif.data.pengguna.id }
}

describe('Ruang admin, moderasi konten, dan sengketa', () => {
  const k = {}

  before(async () => {
    const app = buatApp()
    await new Promise((r) => {
      server = app.listen(0, r)
    })
    basis = `http://127.0.0.1:${server.address().port}`

    // Akun admin tidak bisa dibuat lewat pendaftaran publik — memang tidak
    // boleh bisa. Di tes, barisnya ditanam langsung seperti yang dilakukan
    // seed.js di lingkungan sungguhan.
    db.prepare(
      `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi)
       VALUES ('admin_tes', 'admin', 'Admin Tes', 'admin@tes.id', ?, 1)`,
    ).run(hashSandi('rahasia123'))
    db.prepare("INSERT INTO dompet (pengguna_id) VALUES ('admin_tes')").run()
  })

  after(async () => {
    await new Promise((r) => server.close(r))
    db.close()
    for (const berkas of [dbSementara, `${dbSementara}-wal`, `${dbSementara}-shm`]) {
      try {
        if (fs.existsSync(berkas)) fs.unlinkSync(berkas)
      } catch {
        // Berkas sementara di %TEMP%; biarkan OS yang membersihkan bila terkunci.
      }
    }
  })

  it('menyiapkan satu kampanye berjalan lengkap dengan video dan tayangan', async () => {
    k.umkm = await daftarkan({ peran: 'umkm', nama: 'Bu Sari', email: 'umkm@tes.id' })
    k.kreator = await daftarkan({ peran: 'kreator', nama: 'Rafi', email: 'kreator@tes.id' })

    await panggil('PUT', '/api/auth/profil', {
      token: k.umkm.token,
      body: { namaUsaha: 'Warung Bu Sari', kategori: 'Kuliner', lokasi: 'Bogor' },
    })
    await panggil('PUT', '/api/auth/profil', {
      token: k.kreator.token,
      body: { niche: 'Kuliner', lokasi: 'Bogor', pengikut: 40_000 },
    })
    jadikanLayak(k.kreator.id)

    const buat = await panggil('POST', '/api/kampanye', {
      token: k.umkm.token,
      body: {
        nama: 'Kampanye Uji Admin',
        kategori: 'Kuliner',
        lokasi: 'Bogor',
        targetViews: 200,
        tarifPerView: 100,
        anggaran: 20_000,
        brief: ['Perlihatkan produknya dari dekat.'],
      },
    })
    assert.equal(buat.status, 201, JSON.stringify(buat.data))
    k.kampanyeId = buat.data.kampanye.id

    await panggil('POST', `/api/kampanye/${k.kampanyeId}/setor`, {
      token: k.umkm.token,
      body: { jumlah: 20_000 },
    })

    // Kreator bergabung langsung, tanpa undangan atau persetujuan UMKM.
    const gabung = await panggil('POST', `/api/kampanye/${k.kampanyeId}/lamaran`, { token: k.kreator.token })
    assert.equal(gabung.status, 201, JSON.stringify(gabung.data))

    const video = await panggil('POST', '/api/video', {
      token: k.kreator.token,
      body: { kampanyeId: k.kampanyeId, judul: 'Video Uji', durasiDetik: 30 },
    })
    assert.equal(video.status, 201, JSON.stringify(video.data))
    k.videoId = video.data.video.id
    assert.equal(video.data.video.moderasi, 'menunggu', 'video baru harus masuk antrean moderasi')

    // 50 tayangan asli + 10 bot, supaya angka anti-fraud punya isi.
    // Batch khusus admin karena menerima IP dari body.
    const masukAdmin = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: 'admin@tes.id', kataSandi: 'rahasia123' },
    })
    const kirim = (t) =>
      fetch(`${basis}/api/tayangan/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${masukAdmin.data.token}` },
        body: JSON.stringify({ tayangan: t }),
      }).then((r) => r.json())

    await kirim(
      Array.from({ length: 50 }, (_, i) => ({
        videoId: k.videoId,
        ip: `120.1.${i}.${i + 3}`,
        userAgent: UA_ASLI,
        kota: 'Bogor',
        durasiTonton: 20,
      })),
    )
    const bot = await kirim(
      Array.from({ length: 10 }, (_, i) => ({
        videoId: k.videoId,
        ip: `45.9.9.${i}`,
        userAgent: 'python-requests/2.31.0',
        durasiTonton: 25,
      })),
    )
    assert.equal(bot.disaring, 10)
  })

  it('menolak seluruh rute admin untuk peran selain admin', async () => {
    for (const jalur of ['/api/admin/ringkasan', '/api/admin/konten', '/api/admin/pengguna', '/api/admin/transaksi', '/api/admin/kampanye']) {
      const tamu = await panggil('GET', jalur)
      assert.equal(tamu.status, 401, `${jalur} harus menolak tamu`)

      const umkm = await panggil('GET', jalur, { token: k.umkm.token })
      assert.equal(umkm.status, 403, `${jalur} harus menolak UMKM`)
    }
  })

  it('memberi admin ringkasan platform yang utuh', async () => {
    const masuk = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: 'admin@tes.id', kataSandi: 'rahasia123' },
    })
    assert.equal(masuk.status, 200, JSON.stringify(masuk.data))
    k.admin = { token: masuk.data.token }

    const res = await panggil('GET', '/api/admin/ringkasan', { token: k.admin.token })
    assert.equal(res.status, 200)
    const r = res.data

    assert.equal(r.pengguna.umkm, 1)
    assert.equal(r.pengguna.kreator, 1)
    assert.equal(r.kampanye.berjalan, 1)
    assert.equal(r.antiFraud.tervalidasi, 50)
    assert.equal(r.antiFraud.disaring, 10)
    assert.ok(r.antiFraud.rincian.length > 0, 'rincian alasan penyaringan harus ada')
    assert.equal(r.keuangan.komisiPersen, 0, 'komisi reward kreator dihapus')
    assert.equal(r.konten.menungguModerasi, 1)
    // Dana yang belum dicairkan masih tertahan di Rekber.
    assert.equal(r.keuangan.danaDiRekber, 20_000 - 50 * 100)
  })

  it('menutup neraca dana setiap kampanye', async () => {
    const res = await panggil('GET', '/api/admin/kampanye', { token: k.admin.token })
    assert.equal(res.status, 200)
    const kampanye = res.data.kampanye.find((x) => x.id === k.kampanyeId)

    assert.equal(kampanye.disetor, 20_000)
    assert.equal(kampanye.terpakai, 5000)
    assert.equal(kampanye.komisi, 0)
    assert.equal(kampanye.diterimaKreator, 5000)
    assert.equal(kampanye.sisaDitahan, 15_000)
    assert.equal(kampanye.selisihNeraca, 0, 'neraca escrow wajib tertutup')
  })

  it('meloloskan konten dan memberi tahu kreatornya', async () => {
    const antrean = await panggil('GET', '/api/admin/konten?moderasi=menunggu', { token: k.admin.token })
    assert.equal(antrean.data.konten.length, 1)
    assert.equal(antrean.data.konten[0].id, k.videoId)

    const salah = await panggil('POST', `/api/admin/konten/${k.videoId}/moderasi`, {
      token: k.admin.token,
      body: { keputusan: 'hapus' },
    })
    assert.equal(salah.status, 400, 'keputusan moderasi di luar daftar harus ditolak')

    const tanpaCatatan = await panggil('POST', `/api/admin/konten/${k.videoId}/moderasi`, {
      token: k.admin.token,
      body: { keputusan: 'revisi' },
    })
    assert.equal(tanpaCatatan.status, 400, 'permintaan revisi wajib beralasan')

    // Regresi: video yang diminta revisi dulu tetap menghasilkan uang.
    const revisi = await panggil('POST', `/api/admin/konten/${k.videoId}/moderasi`, {
      token: k.admin.token,
      body: { keputusan: 'revisi', catatan: 'Logo UMKM belum terlihat.' },
    })
    assert.equal(revisi.status, 200)
    const dicairkanSebelum = db.prepare('SELECT jumlah_dicairkan AS n FROM escrow WHERE kampanye_id = ?').get(k.kampanyeId).n
    const tayangRevisi = await panggil('POST', '/api/tayangan', {
      body: { videoId: k.videoId, durasiTonton: 25 },
    })
    assert.equal(tayangRevisi.data.dihitung, false, JSON.stringify(tayangRevisi.data))
    assert.match(tayangRevisi.data.alasan, /revisi/)
    assert.equal(
      db.prepare('SELECT jumlah_dicairkan AS n FROM escrow WHERE kampanye_id = ?').get(k.kampanyeId).n,
      dicairkanSebelum,
      'tayangan video yang diminta revisi tidak boleh memotong escrow',
    )

    const lolos = await panggil('POST', `/api/admin/konten/${k.videoId}/moderasi`, {
      token: k.admin.token,
      body: { keputusan: 'lolos' },
    })
    assert.equal(lolos.status, 200)
    assert.equal(lolos.data.konten.moderasi, 'lolos')

    const notif = await panggil('GET', '/api/notifikasi', { token: k.kreator.token })
    assert.ok(
      notif.data.notifikasi.some((n) => /lolos tinjauan/i.test(n.judul)),
      'kreator harus diberi tahu hasil moderasi',
    )

    const video = await panggil('GET', `/api/video/${k.videoId}`)
    assert.equal(video.data.video.moderasi, 'lolos')
    assert.equal(video.data.video.status, 'tayang')
  })

  it('memverifikasi dan mencabut verifikasi profil pengguna', async () => {
    const sebelum = await panggil('GET', '/api/admin/pengguna?peran=kreator', { token: k.admin.token })
    assert.equal(sebelum.data.pengguna.length, 1)
    assert.equal(sebelum.data.pengguna[0].profilTerverifikasi, false)

    const verif = await panggil('POST', `/api/admin/pengguna/${k.kreator.id}/verifikasi`, {
      token: k.admin.token,
      body: { terverifikasi: true },
    })
    assert.equal(verif.status, 200)
    assert.equal(verif.data.terverifikasi, true)

    const direktori = await panggil('GET', '/api/kreator?terverifikasi=true')
    assert.equal(direktori.data.kreator.length, 1, 'badge terverifikasi harus terlihat publik')

    const cabut = await panggil('POST', `/api/admin/pengguna/${k.kreator.id}/verifikasi`, {
      token: k.admin.token,
      body: { terverifikasi: false },
    })
    assert.equal(cabut.data.terverifikasi, false)

    const kosong = await panggil('GET', '/api/kreator?terverifikasi=true')
    assert.equal(kosong.data.kreator.length, 0)

    // Kembalikan supaya rekomendasi matchmaker di tes berikutnya tetap wajar.
    await panggil('POST', `/api/admin/pengguna/${k.kreator.id}/verifikasi`, {
      token: k.admin.token,
      body: { terverifikasi: true },
    })

    const adminSendiri = await panggil('POST', '/api/admin/pengguna/admin_tes/verifikasi', {
      token: k.admin.token,
      body: { terverifikasi: true },
    })
    assert.equal(adminSendiri.status, 400, 'akun admin tidak perlu diverifikasi')
  })

  it('menyaring direktori kreator menurut niche dan lokasi', async () => {
    const cocok = await panggil('GET', '/api/kreator?niche=Kuliner&lokasi=Bogor')
    assert.equal(cocok.data.kreator.length, 1)

    const meleset = await panggil('GET', '/api/kreator?niche=Fashion')
    assert.equal(meleset.data.kreator.length, 0)

    const cari = await panggil('GET', '/api/kreator?q=rafi')
    assert.equal(cari.data.kreator.length, 1)

    const tidakAda = await panggil('GET', '/api/kreator/krtr_entah')
    assert.equal(tidakAda.status, 404)
  })

  it('menyajikan bukti tayangan mentah untuk sengketa, hanya ke pihak kampanye', async () => {
    const tamu = await panggil('GET', `/api/tayangan?kampanyeId=${k.kampanyeId}`)
    assert.equal(tamu.status, 401, 'bukti tayangan tidak boleh terbuka untuk tamu')
    const lintas = await panggil('GET', '/api/tayangan', { token: k.umkm.token })
    assert.equal(lintas.status, 400, 'daftar lintas kampanye khusus admin')

    const semua = await panggil('GET', `/api/tayangan?kampanyeId=${k.kampanyeId}`, { token: k.umkm.token })
    assert.equal(semua.status, 200)
    assert.ok(semua.data.jumlah > 0)

    const disaring = await panggil('GET', `/api/tayangan?kampanyeId=${k.kampanyeId}&hanyaDisaring=true`, {
      token: k.kreator.token,
    })
    assert.ok(disaring.data.tayangan.every((t) => t.valid === false))
    assert.ok(disaring.data.tayangan.every((t) => t.alasan))
  })

  it('memutus sengketa dan memulihkan tayangan yang salah tersaring', async () => {
    const ajukan = await panggil('POST', '/api/sengketa', {
      token: k.kreator.token,
      body: {
        kampanyeId: k.kampanyeId,
        kategori: 'penyaringan_anti_fraud_keliru',
        alasan: 'Ada penonton asli saya yang ikut tersaring.',
      },
    })
    assert.equal(ajukan.status, 201, JSON.stringify(ajukan.data))
    k.sengketaId = ajukan.data.sengketaId

    const dilihatAdmin = await panggil('GET', '/api/sengketa', { token: k.admin.token })
    assert.equal(dilihatAdmin.data.sengketa.length, 1, 'admin melihat seluruh sengketa')

    const olehUmkm = await panggil('POST', `/api/sengketa/${k.sengketaId}/putuskan`, {
      token: k.umkm.token,
      body: { status: 'selesai', keputusan: 'Saya menangkan sendiri' },
    })
    assert.equal(olehUmkm.status, 403, 'hanya admin yang boleh memutus sengketa')

    const alasanBot = 'Perangkat terdeteksi sebagai bot atau browser otomatis'
    const putus = await panggil('POST', `/api/sengketa/${k.sengketaId}/putuskan`, {
      token: k.admin.token,
      body: {
        status: 'selesai',
        keputusan: 'Sebagian tayangan dipulihkan setelah audit manual.',
        pulihkanAlasan: alasanBot,
      },
    })
    assert.equal(putus.status, 200, JSON.stringify(putus.data))
    assert.equal(putus.data.pemulihan.dipulihkan, 10, 'tayangan dengan alasan itu harus pulih')
    assert.equal(
      putus.data.pemulihan.pencairan.viewsBaru,
      10,
      'tayangan yang dipulihkan harus langsung ikut dicairkan, bukan menunggu kampanye ditutup',
    )

    const laporan = await panggil('GET', `/api/kampanye/${k.kampanyeId}/laporan`, {
      token: k.umkm.token,
    })
    assert.equal(laporan.data.laporan.tervalidasi, 60, 'tayangan pulih ikut dihitung')

    const kedua = await panggil('GET', `/api/sengketa/${k.sengketaId}`, { token: k.kreator.token })
    assert.equal(kedua.data.sengketa.status, 'selesai')
    assert.ok(kedua.data.dataTerkini.tervalidasi === 60)
  })

  it('mencatat pencairan hasil banding di dompet kreator', async () => {
    const dompet = await panggil('GET', '/api/dompet', { token: k.kreator.token })
    // 60 tayangan × Rp 100, tanpa komisi (dihapus).
    assert.equal(dompet.data.dompet.saldoTertahan, 6000)

    const audit = await panggil('POST', `/api/kampanye/${k.kampanyeId}/audit-fraud`, {
      token: k.umkm.token,
    })
    assert.equal(audit.status, 200)

    const neraca = await panggil('GET', '/api/admin/kampanye', { token: k.admin.token })
    const kampanye = neraca.data.kampanye.find((x) => x.id === k.kampanyeId)
    assert.equal(kampanye.terpakai, 6000, '60 tayangan × Rp 100')
    assert.equal(kampanye.selisihNeraca, 0)
  })

  it('mencatat seluruh transaksi platform untuk pengawasan admin', async () => {
    const res = await panggil('GET', '/api/admin/transaksi', { token: k.admin.token })
    assert.equal(res.status, 200)
    assert.ok(res.data.transaksi.some((t) => t.jenis === 'setor' && t.nominal === 20_000))

    const disaringJenis = await panggil('GET', '/api/admin/transaksi?jenis=setor', {
      token: k.admin.token,
    })
    assert.ok(disaringJenis.data.transaksi.every((t) => t.jenis === 'setor'))
  })

  it('menandai notifikasi terbaca satu per satu maupun sekaligus', async () => {
    const awal = await panggil('GET', '/api/notifikasi', { token: k.kreator.token })
    assert.ok(awal.data.belumDibaca > 0)
    const satu = awal.data.notifikasi[0]

    await panggil('POST', `/api/notifikasi/${satu.id}/baca`, { token: k.kreator.token })
    const setelahSatu = await panggil('GET', '/api/notifikasi', { token: k.kreator.token })
    assert.equal(setelahSatu.data.belumDibaca, awal.data.belumDibaca - 1)

    await panggil('POST', '/api/notifikasi/baca', { token: k.kreator.token })
    const habis = await panggil('GET', '/api/notifikasi?hanyaBaru=true', { token: k.kreator.token })
    assert.equal(habis.data.belumDibaca, 0)
    assert.equal(habis.data.notifikasi.length, 0)
  })

  it('menyatakan dengan jujur fitur AI mana yang memakai model bahasa', async () => {
    const res = await panggil('GET', '/api/ai/status')
    assert.equal(res.status, 200)
    assert.equal(typeof res.data.modelBahasaAktif, 'boolean')
    assert.equal(res.data.fitur.smartMatchmaker.jenis, 'algoritma')
    assert.equal(res.data.fitur.antiFraud.jenis, 'algoritma')
    assert.ok(res.data.fitur.antiFraud.alasanPenyaringan.length > 0)
    // Klaimnya harus konsisten dengan ketersediaan kunci API.
    const diharapkan = res.data.modelBahasaAktif ? 'model bahasa' : 'template'
    assert.equal(res.data.fitur.autoReportSummary.jenis, diharapkan)
    assert.equal(res.data.fitur.scriptGenerator.jenis, diharapkan)
  })

  it('menyimpan riwayat naskah AI milik kreator sendiri', async () => {
    const buat = await panggil('POST', '/api/ai/naskah', {
      token: k.kreator.token,
      body: { kampanyeId: k.kampanyeId },
    })
    assert.equal(buat.status, 200)
    // Bentuk naskah sama, entah dari model atau template.
    const n = buat.data.naskah
    assert.ok(['llm', 'template'].includes(n.sumber))
    assert.ok(n.hook && n.cta, 'hook dan ajakan wajib ada')
    assert.ok(n.adegan.length >= 1)
    assert.ok(Array.isArray(n.ideLain) && n.ideLain.length >= 1, 'ide konten lain wajib ada')

    const riwayat = await panggil('GET', '/api/ai/naskah', { token: k.kreator.token })
    assert.ok(riwayat.data.naskah.length >= 1)
    assert.equal(riwayat.data.naskah[0].kampanyeId, k.kampanyeId)

    const olehUmkm = await panggil('GET', '/api/ai/naskah', { token: k.umkm.token })
    assert.equal(olehUmkm.status, 403, 'naskah adalah ruang kerja kreator')
  })

  it('memecah naskah menjadi subtitle bertimestamp', async () => {
    const res = await panggil('POST', '/api/ai/subtitle', {
      token: k.kreator.token,
      body: { naskah: 'Halo semua. Ini bakso aci paling enak di Bogor. Cobain ya!', durasiDetik: 30 },
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.subtitle.status, 'selesai')
    assert.equal(res.data.subtitle.segmen.length, 3)
    assert.match(res.data.subtitle.segmen[0].mulai, /^\d{2}:\d{2}$/)
  })

  it('menolak penghapusan video yang sudah punya tayangan', async () => {
    const res = await panggil('DELETE', `/api/video/${k.videoId}`, { token: k.kreator.token })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /tayangan/i)
  })

  it('menyaring marketplace menurut kategori, lokasi, dan rentang anggaran', async () => {
    const semua = await panggil('GET', '/api/kampanye?status=berjalan')
    assert.equal(semua.data.jumlah, 1)

    const kategori = await panggil('GET', '/api/kampanye?status=berjalan&kategori=Fashion')
    assert.equal(kategori.data.jumlah, 0)

    const anggaran = await panggil('GET', '/api/kampanye?status=berjalan&anggaranMin=100000')
    assert.equal(anggaran.data.jumlah, 0, 'kampanye Rp 20.000 tidak boleh lolos filter minimal')

    const cari = await panggil('GET', '/api/kampanye?status=berjalan&q=uji')
    assert.equal(cari.data.jumlah, 1)
  })

  it('menyusun daftar kerja kreator: kampanye, lamaran, dan rekomendasi', async () => {
    const kampanye = await panggil('GET', '/api/kreator/saya/kampanye', { token: k.kreator.token })
    assert.equal(kampanye.data.kampanye.length, 1)

    const lamaran = await panggil('GET', '/api/kreator/saya/lamaran', { token: k.kreator.token })
    assert.equal(lamaran.data.lamaran[0].status, 'disetujui')

    const rekomendasi = await panggil('GET', '/api/kreator/saya/rekomendasi', { token: k.kreator.token })
    assert.equal(rekomendasi.status, 200)
    assert.ok(Array.isArray(rekomendasi.data.rekomendasi))
  })

  it('menjaga rute yang butuh peran tertentu', async () => {
    const kreatorBuatKampanye = await panggil('POST', '/api/kampanye', {
      token: k.kreator.token,
      body: { nama: 'X', kategori: 'Kuliner', lokasi: 'Bogor', targetViews: 10, tarifPerView: 10 },
    })
    assert.equal(kreatorBuatKampanye.status, 403)

    const umkmMelamar = await panggil('POST', `/api/kampanye/${k.kampanyeId}/lamaran`, {
      token: k.umkm.token,
    })
    assert.equal(umkmMelamar.status, 403)

    const tanpaToken = await panggil('GET', '/api/dompet')
    assert.equal(tanpaToken.status, 401)

    const tokenPalsu = await panggil('GET', '/api/dompet', { token: 'bukan.token.sah' })
    assert.equal(tokenPalsu.status, 401)
  })

  it('menjawab rute yang tidak ada dengan 404 berbahasa manusia', async () => {
    const res = await panggil('GET', '/api/entah-apa')
    assert.equal(res.status, 404)
    assert.match(res.data.galat, /tidak ada/i)
  })

  it('melaporkan kesehatan layanan', async () => {
    const res = await panggil('GET', '/api/kesehatan')
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'sehat')
  })

  it('mendaftar ulasan tertunda setelah kampanye ditutup', async () => {
    await panggil('POST', `/api/kampanye/${k.kampanyeId}/selesai`, {
      token: k.umkm.token,
      body: { alasan: 'Ditutup untuk pengujian' },
    })

    const tertunda = await panggil('GET', '/api/ulasan/tertunda', { token: k.umkm.token })
    assert.equal(tertunda.data.tertunda.length, 1)
    assert.equal(tertunda.data.tertunda[0].kampanyeId, k.kampanyeId)

    await panggil('POST', '/api/ulasan', {
      token: k.umkm.token,
      body: { kampanyeId: k.kampanyeId, bintang: 5, komentar: 'Kerja bagus.' },
    })

    const sesudah = await panggil('GET', '/api/ulasan/tertunda', { token: k.umkm.token })
    assert.equal(sesudah.data.tertunda.length, 0)

    const publik = await panggil('GET', `/api/ulasan?penggunaId=${k.kreator.id}`)
    assert.equal(publik.data.jumlah, 1)
    assert.equal(publik.data.rerata, 5)
  })

  it('menutup neraca sampai kampanye benar-benar selesai', async () => {
    const res = await panggil('GET', '/api/admin/kampanye', { token: k.admin.token })
    const kampanye = res.data.kampanye.find((x) => x.id === k.kampanyeId)

    assert.equal(kampanye.status, 'selesai')
    assert.equal(kampanye.diterimaKreator + kampanye.komisi + kampanye.dikembalikan, kampanye.disetor)
    assert.equal(kampanye.selisihNeraca, 0)
  })
})
