/**
 * Tes alur ujung-ke-ujung.
 *
 * Menempuh persis jalur yang ada di PRD §7 — dari pendaftaran sampai ulasan —
 * lewat HTTP, bukan lewat pemanggilan fungsi langsung. Yang diuji bukan hanya
 * "kodenya jalan", tapi bahwa uangnya benar: berapa yang keluar dari UMKM,
 * berapa yang sampai ke kreator, dan berapa yang kembali.
 *
 * Jalankan: npm test
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Basis data sementara agar tes tidak menyentuh data pengembangan.
const dbSementara = path.join(os.tmpdir(), `lokalboost-tes-${Date.now()}.db`)
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
process.env.KOMISI_PERSEN = '5'

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { hashSandi } = await import('../src/lib/auth.js')
const { BOBOT_MATCHMAKER } = await import('../src/services/matchmaker.js')

let server
let basis

const KOMISI_PERSEN = 5

/** Pembungkus fetch yang otomatis menempelkan token dan mem-parsing JSON. */
async function panggil(metode, jalur, { token, body } = {}) {
  const res = await fetch(`${basis}${jalur}`, {
    method: metode,
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Linux; Android 13; SM-A536B) Chrome/120 Mobile Safari/537.36',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}


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

/** Daftar + verifikasi OTP, kembalikan token siap pakai. */
async function daftarkan({ peran, nama, email }) {
  const daftar = await panggil('POST', '/api/auth/daftar', {
    body: { peran, nama, email, kataSandi: 'rahasia123' },
  })
  assert.equal(daftar.status, 201, JSON.stringify(daftar.data))
  assert.ok(daftar.data.kodeOtp, 'kode OTP harus ikut dikembalikan di mode non-produksi')

  const verif = await panggil('POST', '/api/auth/otp/verifikasi', {
    body: { identitas: email, kode: daftar.data.kodeOtp },
  })
  assert.equal(verif.status, 200, JSON.stringify(verif.data))
  return { token: verif.data.token, id: verif.data.pengguna.id }
}

describe('Alur lengkap UMKM dan kreator', () => {
  const konteks = {}

  before(async () => {
    const app = buatApp()
    await new Promise((r) => {
      server = app.listen(0, r)
    })
    basis = `http://127.0.0.1:${server.address().port}`

    // Rute batch tayangan khusus admin. Akun admin tak bisa dibuat lewat
    // pendaftaran publik, jadi barisnya ditanam langsung.
    db.prepare(
      `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi)
       VALUES ('admin_alur', 'admin', 'Admin Alur', 'admin@alur.id', ?, 1)`,
    ).run(hashSandi('rahasia123'))
    db.prepare("INSERT INTO dompet (pengguna_id) VALUES ('admin_alur')").run()
    const masuk = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: 'admin@alur.id', kataSandi: 'rahasia123' },
    })
    konteks.tokenAdmin = masuk.data.token
  })

  after(async () => {
    await new Promise((r) => server.close(r))
    db.close() // lepaskan kunci berkas sebelum dihapus (wajib di Windows)
    for (const berkas of [dbSementara, `${dbSementara}-wal`, `${dbSementara}-shm`]) {
      try {
        if (fs.existsSync(berkas)) fs.unlinkSync(berkas)
      } catch {
        // Berkas sementara di %TEMP%; kalau masih terkunci, biarkan OS yang bersihkan.
      }
    }
  })

  it('menolak pendaftaran tanpa email', async () => {
    const res = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'umkm', nama: 'Tanpa Kontak', kataSandi: 'rahasia123' },
    })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /email wajib/i)
  })

  it('menolak pendaftaran yang hanya berbekal nomor HP', async () => {
    // Tidak ada penyedia SMS di backend ini, jadi kode verifikasi tidak akan
    // pernah sampai. Karena verifikasi kini wajib, menerima pendaftaran
    // semacam itu sama dengan menerbitkan akun yang terkunci selamanya.
    const res = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'umkm', nama: 'Hanya HP', telepon: '081234567890', kataSandi: 'rahasia123' },
    })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /email wajib/i)
  })

  it('menyebut nomor HP saat nomornya sudah dipakai akun lain', async () => {
    // Pencarian akun lama memakai email, jadi tabrakan nomor HP dulu lolos
    // sampai ke pelanggaran UNIQUE di database dan keluar sebagai "Data serupa
    // sudah ada" — pendaftar tidak tahu field mana yang bermasalah.
    const telepon = '081200990011'
    const pertama = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'kreator', nama: 'Pemilik Nomor', email: 'pemiliknomor@tes.id', telepon, kataSandi: 'rahasia123' },
    })
    assert.equal(pertama.status, 201)

    const kedua = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'kreator', nama: 'Penumpang', email: 'penumpang@tes.id', telepon, kataSandi: 'rahasia123' },
    })
    assert.equal(kedua.status, 409)
    assert.match(kedua.data.galat, /nomor hp/i)
    assert.doesNotMatch(kedua.data.galat, /data serupa/i)
  })

  it('tetap menerima pendaftaran ulang dengan email sama yang belum diverifikasi', async () => {
    // Penjagaan nomor HP di atas tidak boleh mengunci jalur ini: orang yang
    // berhenti sebelum memasukkan OTP harus bisa mengulang dengan data sama.
    const body = { peran: 'kreator', nama: 'Ulang', email: 'ulangdaftar@tes.id', telepon: '081200990022', kataSandi: 'rahasia123' }
    const pertama = await panggil('POST', '/api/auth/daftar', { body })
    assert.equal(pertama.status, 201)

    const ulang = await panggil('POST', '/api/auth/daftar', { body })
    assert.equal(ulang.status, 200)
  })

  it('menolak email yang bentuknya mustahil menerima surat', async () => {
    const res = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'umkm', nama: 'Salah Format', email: 'bukan-email', kataSandi: 'rahasia123' },
    })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /format email/i)
  })

  it('menolak masuk sebelum akun diverifikasi, sambil menunjukkan jalan keluarnya', async () => {
    const email = 'belumverif@tes.id'
    const daftar = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'kreator', nama: 'Belum Verif', email, kataSandi: 'rahasia123' },
    })
    assert.equal(daftar.status, 201)

    const masuk = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: email, kataSandi: 'rahasia123' },
    })
    assert.equal(masuk.status, 403, 'kata sandi benar tapi akun belum terverifikasi')
    assert.equal(masuk.data.rincian?.perluVerifikasi, true, 'frontend butuh penanda ini untuk mengalihkan')
    assert.equal(masuk.data.rincian?.identitas, email)
    assert.ok(!masuk.data.token, 'tidak boleh ada token untuk akun yang belum terverifikasi')
  })

  it('menghanguskan kode setelah lima tebakan salah', async () => {
    const email = 'tebakan@tes.id'
    const daftar = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'umkm', nama: 'Tukang Tebak', email, kataSandi: 'rahasia123' },
    })
    const kodeAsli = daftar.data.kodeOtp
    // Tebakan yang pasti salah, apa pun kode aslinya.
    const kodeSalah = kodeAsli === '000000' ? '111111' : '000000'

    for (let ke = 1; ke <= 4; ke += 1) {
      const salah = await panggil('POST', '/api/auth/otp/verifikasi', {
        body: { identitas: email, kode: kodeSalah },
      })
      assert.equal(salah.status, 400)
      assert.match(salah.data.galat, new RegExp(`sisa ${5 - ke} percobaan`, 'i'))
    }

    const kelima = await panggil('POST', '/api/auth/otp/verifikasi', {
      body: { identitas: email, kode: kodeSalah },
    })
    assert.match(kelima.data.galat, /dihanguskan/i)

    // Kode aslinya pun sudah tidak berlaku lagi — itu inti penghangusan.
    const pakaiAsli = await panggil('POST', '/api/auth/otp/verifikasi', {
      body: { identitas: email, kode: kodeAsli },
    })
    assert.equal(pakaiAsli.status, 400)
    assert.ok(!pakaiAsli.data.token)
  })

  it('menahan permintaan kode baru yang terlalu berdekatan', async () => {
    const email = 'jeda@tes.id'
    await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'umkm', nama: 'Buru Buru', email, kataSandi: 'rahasia123' },
    })

    const ulang = await panggil('POST', '/api/auth/otp/kirim', { body: { identitas: email } })
    assert.equal(ulang.status, 429, 'kode baru diminta beberapa milidetik setelah yang pertama')
    assert.match(ulang.data.galat, /tunggu \d+ detik/i)
  })

  it('menjawab sama untuk email terdaftar dan tidak, supaya tidak bisa dipetakan', async () => {
    const asing = await panggil('POST', '/api/auth/otp/kirim', {
      body: { identitas: 'tidak-pernah-ada@tes.id' },
    })
    assert.equal(asing.status, 200, 'jangan bocorkan bahwa akunnya tidak ada')
    assert.match(asing.data.pesan, /kalau .* terdaftar/i)
    assert.ok(!asing.data.kodeOtp, 'tidak ada kode untuk akun yang memang tidak ada')
  })

  it('menyamakan huruf besar-kecil email supaya tidak lahir dua akun', async () => {
    const daftar = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'kreator', nama: 'Huruf Besar', email: '  Kapital@Tes.ID ', kataSandi: 'rahasia123' },
    })
    assert.equal(daftar.status, 201)
    assert.equal(daftar.data.pengguna.email, 'kapital@tes.id')

    // Mendaftar lagi dengan ejaan berbeda harus mengenai akun yang sama,
    // bukan membuat yang kedua — jawabannya 200 (perbarui), bukan 201 (baru).
    const lagi = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'kreator', nama: 'Huruf Besar', email: 'KAPITAL@tes.id', kataSandi: 'rahasia123' },
    })
    assert.equal(lagi.status, 200)
    assert.equal(lagi.data.pengguna.id, daftar.data.pengguna.id)
  })

  it('mendaftarkan UMKM dan melengkapi profil toko', async () => {
    const { token, id } = await daftarkan({ peran: 'umkm', nama: 'Bu Sari', email: 'busari@tes.id' })
    konteks.umkm = { token, id }

    const profil = await panggil('PUT', '/api/auth/profil', {
      token,
      body: { namaUsaha: 'Warung Bu Sari', kategori: 'Kuliner', lokasi: 'Bogor', targetAudiens: 'Pekerja kantoran' },
    })
    assert.equal(profil.status, 200)
    assert.equal(profil.data.pengguna.profil.nama_usaha, 'Warung Bu Sari')
  })

  it('mendaftarkan kreator dan melengkapi profil konten', async () => {
    const { token, id } = await daftarkan({ peran: 'kreator', nama: 'Rafi Pratama', email: 'rafi@tes.id' })
    konteks.kreator = { token, id }

    const profil = await panggil('PUT', '/api/auth/profil', {
      token,
      body: { niche: 'Kuliner', lokasi: 'Bogor', pengikut: 50_000, bio: 'Konten kuliner kaki lima' },
    })
    assert.equal(profil.status, 200)
    assert.equal(profil.data.pengguna.profil.niche, 'Kuliner')
    jadikanLayak(id)
  })

  it('menolak kampanye yang anggarannya tidak menutupi target', async () => {
    const res = await panggil('POST', '/api/kampanye', {
      token: konteks.umkm.token,
      body: { nama: 'Kampanye Kurang Dana', kategori: 'Kuliner', lokasi: 'Bogor', targetViews: 1000, tarifPerView: 100, anggaran: 50_000 },
    })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /Anggaran tidak cukup/i)
  })

  it('membuat kampanye yang belum tampil di marketplace sebelum dana disetor', async () => {
    const buat = await panggil('POST', '/api/kampanye', {
      token: konteks.umkm.token,
      body: {
        nama: 'Promo Nasi Kotak Bu Sari',
        kategori: 'Kuliner',
        lokasi: 'Bogor',
        deskripsi: 'Paket nasi kotak untuk acara kantor dan arisan.',
        targetViews: 100,
        tarifPerView: 100,
        anggaran: 10_000,
        brief: ['Perlihatkan isi lengkap satu kotak.', 'Sebutkan harga mulai Rp 18.000.'],
      },
    })
    assert.equal(buat.status, 201, JSON.stringify(buat.data))
    konteks.kampanyeId = buat.data.kampanye.id
    assert.equal(buat.data.kampanye.status, 'menunggu_dana')
    assert.deepEqual(buat.data.kampanye.brief.length, 2)

    const pasar = await panggil('GET', '/api/kampanye')
    const ada = pasar.data.kampanye.some((k) => k.id === konteks.kampanyeId)
    assert.equal(ada, false, 'kampanye tanpa dana tidak boleh tampil di marketplace')
  })

  it('menerbitkan kampanye setelah dana masuk Rekber', async () => {
    const setor = await panggil('POST', `/api/kampanye/${konteks.kampanyeId}/setor`, {
      token: konteks.umkm.token,
      body: { jumlah: 10_000, metode: 'transfer_bank' },
    })
    assert.equal(setor.status, 200, JSON.stringify(setor.data))
    assert.equal(setor.data.kampanye.status, 'berjalan')

    const pasar = await panggil('GET', '/api/kampanye')
    assert.ok(pasar.data.kampanye.some((k) => k.id === konteks.kampanyeId))

    const dompet = await panggil('GET', '/api/dompet', { token: konteks.umkm.token })
    const setoran = dompet.data.dompet.riwayat.find((t) => t.jenis === 'setor')
    assert.equal(setoran.nominal, 10_000)
    assert.equal(setoran.arah, 'keluar')
  })

  it('menolak setoran ganda pada kampanye yang sama', async () => {
    const res = await panggil('POST', `/api/kampanye/${konteks.kampanyeId}/setor`, {
      token: konteks.umkm.token,
      body: { jumlah: 10_000 },
    })
    assert.equal(res.status, 409)
  })

  it('memberi skor kecocokan AI Matchmaker yang beralasan', async () => {
    const rekom = await panggil('GET', `/api/kampanye/${konteks.kampanyeId}/rekomendasi-kreator`, {
      token: konteks.umkm.token,
    })
    assert.equal(rekom.status, 200)
    const rafi = rekom.data.rekomendasi.find((r) => r.kreatorId === konteks.kreator.id)
    assert.ok(rafi, 'kreator terverifikasi harus muncul di rekomendasi')
    assert.ok(rafi.kecocokan > 60, `skor kecocokan terlalu rendah: ${rafi.kecocokan}`)
    assert.ok(rafi.alasan.length > 0, 'setiap rekomendasi wajib punya alasan')
    // Lokasi dan niche sama persis, jadi kedua komponen harus penuh. Bobotnya
    // dibaca dari sumbernya, bukan dipatok angka, supaya tes ini tidak pecah
    // setiap kali bobot matchmaker disetel ulang.
    assert.equal(rafi.rincian.lokasi, BOBOT_MATCHMAKER.lokasi)
    assert.equal(rafi.rincian.niche, BOBOT_MATCHMAKER.niche)
  })

  it('menjalankan undangan kreator sampai disetujui UMKM', async () => {
    const tutup = await panggil('POST', `/api/kampanye/${konteks.kampanyeId}/lamaran`, {
      token: konteks.kreator.token,
      body: { pesan: 'Saya mau ikut sendiri.' },
    })
    assert.equal(tutup.status, 409, 'kreator tidak boleh mengajukan diri')

    const lamar = await panggil('POST', `/api/kampanye/${konteks.kampanyeId}/undang`, {
      token: konteks.umkm.token,
      body: { kreatorId: konteks.kreator.id, pesan: 'Kami ingin Anda ikut.' },
    })
    assert.equal(lamar.status, 201, JSON.stringify(lamar.data))

    const daftar = await panggil('GET', `/api/kampanye/${konteks.kampanyeId}/lamaran`, {
      token: konteks.umkm.token,
    })
    assert.equal(daftar.data.lamaran.length, 1)
    konteks.lamaranId = daftar.data.lamaran[0].id

    const setuju = await panggil(
      'POST',
      `/api/kampanye/${konteks.kampanyeId}/lamaran/${konteks.lamaranId}/setujui`,
      { token: konteks.umkm.token },
    )
    assert.equal(setuju.status, 200)
    assert.equal(setuju.data.kampanye.status, 'berjalan')
    assert.equal(setuju.data.kampanye.kreatorId, konteks.kreator.id)
  })

  it('memberi notifikasi persetujuan ke kreator', async () => {
    const notif = await panggil('GET', '/api/notifikasi', { token: konteks.kreator.token })
    assert.ok(notif.data.belumDibaca > 0)
    assert.ok(notif.data.notifikasi.some((n) => /disetujui/i.test(n.judul)))
  })

  it('mengunggah video dan memprosesnya dengan AI', async () => {
    // Naskah dulu datang dari Script Generator. Fitur itu dihapus, jadi naskah
    // ditulis langsung di sini: yang diuji di bawah adalah pemecahan subtitle,
    // bukan asal-usul naskahnya.
    konteks.naskah =
      'Halo, ini Nasi Kotak Bu Sari. Lauknya lengkap dan masih hangat. ' +
      'Cocok untuk acara kantor maupun syukuran. Pesan sekarang lewat WhatsApp ya.'

    const unggah = await panggil('POST', '/api/video', {
      token: konteks.kreator.token,
      body: { kampanyeId: konteks.kampanyeId, judul: 'Nasi Kotak Bu Sari 30 detik', durasiDetik: 32 },
    })
    assert.equal(unggah.status, 201, JSON.stringify(unggah.data))
    konteks.videoId = unggah.data.video.id
    assert.equal(unggah.data.video.status, 'diproses')

    const proses = await panggil('POST', `/api/video/${konteks.videoId}/proses`, {
      token: konteks.kreator.token,
      body: { naskah: konteks.naskah },
    })
    assert.equal(proses.status, 200)
    assert.equal(proses.data.video.status, 'tayang')
    assert.equal(proses.data.video.subtitle.status, 'selesai')
    assert.ok(proses.data.video.subtitle.segmen.length > 0)
  })

  it('menolak unggahan video dari kreator yang bukan pemenang kampanye', async () => {
    const lain = await daftarkan({ peran: 'kreator', nama: 'Kreator Lain', email: 'lain@tes.id' })
    const res = await panggil('POST', '/api/video', {
      token: lain.token,
      body: { kampanyeId: konteks.kampanyeId, judul: 'Nyelonong', durasiDetik: 30 },
    })
    assert.equal(res.status, 403)
  })

  it('menolak batch tayangan dari selain admin', async () => {
    // Batch menerima IP dari body. Selama publik, 40 tayangan ber-IP karangan
    // lolos semua dan escrow UMKM terkuras tanpa login.
    const palsu = [{ videoId: konteks.videoId, ip: '10.9.0.1', userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1', durasiTonton: 25 }]
    const tamu = await panggil('POST', '/api/tayangan/batch', { body: { tayangan: palsu } })
    assert.equal(tamu.status, 401)
    const kreator = await panggil('POST', '/api/tayangan/batch', {
      token: konteks.kreator.token,
      body: { tayangan: palsu },
    })
    assert.equal(kreator.status, 403)
  })

  it('menyaring tayangan bot, tayangan kilat, dan IP berulang', async () => {
    const kirim = (t) =>
      fetch(`${basis}/api/tayangan/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${konteks.tokenAdmin}` },
        body: JSON.stringify({ tayangan: t }),
      }).then((r) => r.json())

    // 60 penonton asli: IP unik, perangkat wajar, durasi tonton cukup.
    const asli = Array.from({ length: 60 }, (_, i) => ({
      videoId: konteks.videoId,
      ip: `114.10.${i}.${i + 5}`,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) Chrome/120 Mobile Safari/537.36',
      kota: i % 3 === 0 ? 'Bogor' : 'Jakarta',
      durasiTonton: 20,
    }))
    const hasilAsli = await kirim(asli)
    assert.equal(hasilAsli.dihitung, 60, JSON.stringify(hasilAsli))
    assert.equal(hasilAsli.disaring, 0)

    // 10 bot terang-terangan.
    const bot = Array.from({ length: 10 }, (_, i) => ({
      videoId: konteks.videoId,
      ip: `45.9.1.${i}`,
      userAgent: 'python-requests/2.31.0',
      durasiTonton: 25,
    }))
    const hasilBot = await kirim(bot)
    assert.equal(hasilBot.disaring, 10, 'semua bot harus disaring')

    // 10 tayangan kilat (1 detik) — jauh di bawah 25% durasi video.
    const kilat = Array.from({ length: 10 }, (_, i) => ({
      videoId: konteks.videoId,
      ip: `103.7.2.${i}`,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Version/17.2 Mobile Safari/604.1',
      durasiTonton: 1,
    }))
    const hasilKilat = await kirim(kilat)
    assert.equal(hasilKilat.disaring, 10, 'tayangan kilat harus disaring')

    // 20 tayangan yang seluruhnya berasal dari 2 alamat IP saja.
    // Aturannya membolehkan maksimal 3 tayangan per IP dalam satu jendela,
    // jadi yang lolos hanya 6 dan sisanya disaring sebagai IP berulang.
    const berulang = Array.from({ length: 20 }, (_, i) => ({
      videoId: konteks.videoId,
      ip: `36.72.14.${i % 2}`,
      userAgent: `Mozilla/5.0 (Linux; Android 12; Pixel ${i}) Chrome/120 Mobile Safari/537.36`,
      durasiTonton: 18,
    }))
    const hasilBerulang = await kirim(berulang)
    assert.equal(hasilBerulang.dihitung, 6, 'hanya 3 tayangan per IP yang boleh dihitung')
    assert.equal(hasilBerulang.disaring, 14, `IP berulang harus disaring, dapat ${hasilBerulang.disaring}`)

    konteks.tayanganAsliDihitung = 60 + hasilBerulang.dihitung
  })

  it('menghitung Pay-Per-View hanya dari tayangan tervalidasi', async () => {
    const laporan = await panggil('GET', `/api/kampanye/${konteks.kampanyeId}/laporan`, {
      token: konteks.umkm.token,
    })
    assert.equal(laporan.status, 200)
    const l = laporan.data.laporan

    assert.equal(l.tervalidasi, konteks.tayanganAsliDihitung)
    assert.ok(l.disaring >= 26, `harusnya ada tayangan yang disaring, dapat ${l.disaring}`)
    // Biaya = jumlah tayangan tervalidasi x tarif per view. Tidak lebih.
    assert.equal(l.keuangan.terpakai, l.tervalidasi * 100)
    assert.ok(l.viewsHarian.length === 7)
    assert.ok(l.sebaranLokasi.length > 0)
    assert.ok(l.antiFraud.rincian.length > 0, 'rincian alasan penyaringan harus ada')

    konteks.biayaTerpakai = l.keuangan.terpakai
  })

  it('menahan pendapatan kreator selama kampanye masih berjalan', async () => {
    const dompet = await panggil('GET', '/api/dompet', { token: konteks.kreator.token })
    const d = dompet.data.dompet
    const bersih = konteks.biayaTerpakai - Math.round((konteks.biayaTerpakai * KOMISI_PERSEN) / 100)

    assert.equal(d.saldoTertahan, bersih, 'pendapatan harus tertahan, belum bisa ditarik')
    assert.equal(d.saldo, 0)

    const tarik = await panggil('POST', '/api/dompet/tarik', {
      token: konteks.kreator.token,
      body: { jumlah: 1000, tujuan: 'BCA 4471' },
    })
    assert.equal(tarik.status, 400, 'penarikan dari saldo tertahan harus ditolak')
  })

  it('melepaskan dana dan mengembalikan sisa saat kampanye ditutup', async () => {
    const tutup = await panggil('POST', `/api/kampanye/${konteks.kampanyeId}/selesai`, {
      token: konteks.umkm.token,
      body: { alasan: 'Ditutup untuk pengujian' },
    })
    assert.equal(tutup.status, 200, JSON.stringify(tutup.data))

    const komisi = Math.round((konteks.biayaTerpakai * KOMISI_PERSEN) / 100)
    const bersih = konteks.biayaTerpakai - komisi
    const sisa = 10_000 - konteks.biayaTerpakai

    assert.equal(tutup.data.dibayarKeKreator, bersih)
    assert.equal(tutup.data.komisiPlatform, komisi)
    assert.equal(tutup.data.dikembalikanKeUmkm, sisa)

    // Neraca harus tertutup: yang keluar dari UMKM = kreator + komisi + refund.
    assert.equal(bersih + komisi + sisa, 10_000)

    const dompetKreator = await panggil('GET', '/api/dompet', { token: konteks.kreator.token })
    assert.equal(dompetKreator.data.dompet.saldo, bersih)
    assert.equal(dompetKreator.data.dompet.saldoTertahan, 0)

    const dompetUmkm = await panggil('GET', '/api/dompet', { token: konteks.umkm.token })
    assert.equal(dompetUmkm.data.dompet.saldo, sisa)
  })

  it('tidak membayar tayangan yang masuk setelah kampanye selesai', async () => {
    // Regresi: dulu tayangan ini memotong escrow yang sisanya sudah dikembalikan
    // ke UMKM, membalik status escrow ke "sebagian_cair", menambah saldo tertahan
    // kreator yang tak pernah bisa cair, lalu menjawab 409 ke penonton.
    const sebelum = db.prepare('SELECT * FROM escrow WHERE kampanye_id = ?').get(konteks.kampanyeId)
    const res = await panggil('POST', '/api/tayangan', {
      body: { videoId: konteks.videoId, durasiTonton: 25 },
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.dihitung, false)
    assert.match(res.data.alasan, /tidak sedang berjalan/)

    const sesudah = db.prepare('SELECT * FROM escrow WHERE kampanye_id = ?').get(konteks.kampanyeId)
    assert.equal(sesudah.jumlah_dicairkan, sebelum.jumlah_dicairkan)
    assert.equal(sesudah.status, 'selesai')
    const dompet = await panggil('GET', '/api/dompet', { token: konteks.kreator.token })
    assert.equal(dompet.data.dompet.saldoTertahan, 0)
  })

  it('mengizinkan penarikan dana setelah kampanye selesai', async () => {
    const dompet = await panggil('GET', '/api/dompet', { token: konteks.kreator.token })
    const saldo = dompet.data.dompet.saldo

    const tarik = await panggil('POST', '/api/dompet/tarik', {
      token: konteks.kreator.token,
      body: { jumlah: saldo, tujuan: 'BCA 4471' },
    })
    assert.equal(tarik.status, 200, JSON.stringify(tarik.data))
    assert.equal(tarik.data.saldoTersisa, 0)

    const lagi = await panggil('POST', '/api/dompet/tarik', {
      token: konteks.kreator.token,
      body: { jumlah: 1000, tujuan: 'BCA 4471' },
    })
    assert.equal(lagi.status, 400, 'saldo kosong tidak boleh bisa ditarik lagi')
  })

  it('membuat ringkasan AI dalam bahasa yang mudah dipahami', async () => {
    const res = await panggil('GET', `/api/kampanye/${konteks.kampanyeId}/ringkasan-ai`, {
      token: konteks.umkm.token,
    })
    assert.equal(res.status, 200)
    const r = res.data.ringkasan
    assert.ok(r.ringkasan.length > 80, 'ringkasan terlalu pendek')
    assert.ok(r.sorotan.length >= 3)
    // Larangan jargon dari PRD §11 berlaku juga untuk versi template.
    assert.doesNotMatch(r.ringkasan, /engagement rate|impresi|CTR/i)
  })

  it('menerima ulasan dua arah hanya dari pihak yang terlibat', async () => {
    const dariUmkm = await panggil('POST', '/api/ulasan', {
      token: konteks.umkm.token,
      body: { kampanyeId: konteks.kampanyeId, bintang: 5, komentar: 'Videonya rapi dan sesuai brief.' },
    })
    assert.equal(dariUmkm.status, 201)

    const ulang = await panggil('POST', '/api/ulasan', {
      token: konteks.umkm.token,
      body: { kampanyeId: konteks.kampanyeId, bintang: 4 },
    })
    assert.equal(ulang.status, 409, 'satu pihak hanya boleh memberi satu ulasan')

    const dariKreator = await panggil('POST', '/api/ulasan', {
      token: konteks.kreator.token,
      body: { kampanyeId: konteks.kampanyeId, bintang: 5, komentar: 'Brief jelas, pembayaran lancar.' },
    })
    assert.equal(dariKreator.status, 201)

    const profil = await panggil('GET', `/api/kreator/${konteks.kreator.id}`)
    assert.equal(profil.data.kreator.rating, 5)
    assert.equal(profil.data.kreator.jumlahUlasan, 1)
    assert.equal(profil.data.kreator.kampanyeSelesai, 1)
  })

  it('mencatat sengketa lengkap dengan bukti data tayangan', async () => {
    const res = await panggil('POST', '/api/sengketa', {
      token: konteks.kreator.token,
      body: {
        kampanyeId: konteks.kampanyeId,
        kategori: 'penyaringan_anti_fraud_keliru',
        alasan: 'Beberapa penonton asli saya ikut tersaring.',
      },
    })
    assert.equal(res.status, 201, JSON.stringify(res.data))

    const daftar = await panggil('GET', '/api/sengketa', { token: konteks.kreator.token })
    assert.equal(daftar.data.sengketa.length, 1)
    assert.ok(daftar.data.sengketa[0].bukti.antiFraud.totalTayangan > 0, 'sengketa harus membawa bukti otomatis')
  })

  it('menolak sengketa kedua dari pihak yang sama selama perkara masih berjalan', async () => {
    const ulang = await panggil('POST', '/api/sengketa', {
      token: konteks.kreator.token,
      body: {
        kampanyeId: konteks.kampanyeId,
        kategori: 'lainnya',
        alasan: 'Saya klik dua kali karena halaman terasa lambat.',
      },
    })
    assert.equal(ulang.status, 409, JSON.stringify(ulang.data))

    const daftar = await panggil('GET', '/api/sengketa', { token: konteks.kreator.token })
    assert.equal(daftar.data.sengketa.length, 1, 'tidak boleh ada duplikat di antrean admin')

    // Pihak seberang tetap boleh mengajukan perkaranya sendiri.
    const umkm = await panggil('POST', '/api/sengketa', {
      token: konteks.umkm.token,
      body: {
        kampanyeId: konteks.kampanyeId,
        kategori: 'video_tidak_sesuai_brief',
        alasan: 'Menurut saya video belum sesuai brief.',
      },
    })
    assert.equal(umkm.status, 201, JSON.stringify(umkm.data))
  })

  it('menolak akses laporan dari pihak yang tidak terlibat', async () => {
    const orangLain = await daftarkan({ peran: 'umkm', nama: 'UMKM Lain', email: 'lainumkm@tes.id' })
    const res = await panggil('GET', `/api/kampanye/${konteks.kampanyeId}/laporan`, {
      token: orangLain.token,
    })
    assert.equal(res.status, 403)
  })

  it('menyajikan statistik publik yang dihitung dari data nyata', async () => {
    const res = await panggil('GET', '/api/dashboard/statistik-publik')
    assert.equal(res.status, 200)
    assert.equal(res.data.kampanyeSelesai, 1)
    assert.ok(res.data.totalTayanganAsli > 0)
    assert.ok(res.data.totalTayanganDisaring > 0)
    assert.ok(res.data.totalDanaTersalurkan > 0)
  })
})
