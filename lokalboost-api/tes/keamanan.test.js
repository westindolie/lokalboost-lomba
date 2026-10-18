/**
 * Tes 2FA penarikan dana dan pemulihan kata sandi.
 *
 * Dua jalur yang sama-sama menjaga akses ke uang orang: yang satu menyetujui
 * pencairan, yang satu mengambil alih akun. Keduanya bersandar pada
 * services/otp.js, jadi berkas ini juga yang membuktikan pagar di sana
 * (batas tebakan, sekali pakai, tujuan kode) benar-benar berlaku.
 *
 * Jalankan: npm test
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-keamanan-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
// Tes membaca kode OTP dari respons. Dikunci di sini karena .env laptop
// sengaja memakai BOCORKAN_OTP=false, dan dotenv tidak menimpa nilai yang sudah ada.
process.env.BOCORKAN_OTP = 'true'
// Tes selalu memakai berkas sementara, tidak pernah basis data Turso sungguhan.
process.env.TURSO_DATABASE_URL = ''
// Setor dana simulasi. Midtrans diuji terpisah di midtrans.test.js.
process.env.MIDTRANS_SERVER_KEY = ''

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { AMBANG_2FA } = await import('../src/services/escrow.js')

let server
let basis

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

async function daftarkan({ peran, nama, email, kataSandi = 'rahasia123' }) {
  const daftar = await panggil('POST', '/api/auth/daftar', {
    body: { peran, nama, email, kataSandi },
  })
  assert.equal(daftar.status, 201, JSON.stringify(daftar.data))
  const verif = await panggil('POST', '/api/auth/otp/verifikasi', {
    body: { identitas: email, kode: daftar.data.kodeOtp },
  })
  assert.equal(verif.status, 200, JSON.stringify(verif.data))
  return { token: verif.data.token, id: verif.data.pengguna.id }
}

/** Isi dompet langsung di basis data — asal saldonya bukan yang diuji di sini. */
function isiSaldo(penggunaId, jumlah) {
  db.prepare('UPDATE dompet SET saldo = ? WHERE pengguna_id = ?').run(jumlah, penggunaId)
}

/**
 * Jeda 60 detik antar kode dihitung dari tabel `otp`, jadi tes yang meminta
 * beberapa kode berturut-turut akan kena 429. Memundurkan stempel waktunya
 * lebih jujur daripada melonggarkan jedanya demi tes.
 */
function mundurkanJedaOtp(identitas) {
  db.prepare("UPDATE otp SET dibuat_pada = datetime('now', '-5 minutes') WHERE identitas = ?").run(identitas)
}

describe('2FA penarikan dan kata sandi', () => {
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
    for (const berkas of [dbSementara, `${dbSementara}-wal`, `${dbSementara}-shm`]) {
      try {
        if (fs.existsSync(berkas)) fs.unlinkSync(berkas)
      } catch {
        // Berkas sementara di %TEMP%; biarkan OS yang membersihkan.
      }
    }
  })

  // -------------------------------------------------------------------
  //  Penarikan dana
  // -------------------------------------------------------------------

  it('mengizinkan penarikan kecil tanpa kode apa pun', async () => {
    const email = 'kecil@tes.id'
    const kreator = await daftarkan({ peran: 'kreator', nama: 'Tarik Kecil', email })
    isiSaldo(kreator.id, 500_000)

    const res = await panggil('POST', '/api/dompet/tarik', {
      token: kreator.token,
      body: { jumlah: 300_000, tujuan: 'BCA 1234567890' },
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.saldoTersisa, 200_000)
  })

  it('menolak penarikan besar tanpa kode', async () => {
    const email = 'tanpakode@tes.id'
    const kreator = await daftarkan({ peran: 'kreator', nama: 'Tanpa Kode', email })
    isiSaldo(kreator.id, 5_000_000)

    const res = await panggil('POST', '/api/dompet/tarik', {
      token: kreator.token,
      body: { jumlah: AMBANG_2FA, tujuan: 'BCA 1234567890' },
    })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /verifikasi tambahan/i)
    assert.equal(db.prepare('SELECT saldo FROM dompet WHERE pengguna_id = ?').get(kreator.id).saldo, 5_000_000)
  })

  it('menolak penarikan besar dengan kode karangan, dan menghitung percobaannya', async () => {
    // Inilah lubang yang ditutup: versi sebelumnya meloloskan string apa pun.
    const email = 'karangan@tes.id'
    const kreator = await daftarkan({ peran: 'kreator', nama: 'Kode Karangan', email })
    isiSaldo(kreator.id, 5_000_000)
    mundurkanJedaOtp(email)

    const minta = await panggil('POST', '/api/dompet/tarik/kode', { token: kreator.token })
    assert.equal(minta.status, 200, JSON.stringify(minta.data))

    const res = await panggil('POST', '/api/dompet/tarik', {
      token: kreator.token,
      body: { jumlah: 3_000_000, tujuan: 'BCA 1234567890', kodeOtp: '000000' },
    })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /kode salah/i)

    // Percobaan harus benar-benar tercatat. Kalau verifikasi dijalankan di
    // dalam transaksi penarikan, lemparannya me-rollback hitungan ini dan
    // batas 5 tebakan tidak pernah tercapai.
    const baris = db
      .prepare("SELECT percobaan FROM otp WHERE identitas = ? AND tujuan = 'penarikan' ORDER BY id DESC LIMIT 1")
      .get(email)
    assert.equal(baris.percobaan, 1)
    assert.equal(db.prepare('SELECT saldo FROM dompet WHERE pengguna_id = ?').get(kreator.id).saldo, 5_000_000)
  })

  it('menolak kode verifikasi akun yang dipakai ulang untuk menarik dana', async () => {
    // Alasan kolom `tujuan` ada: kode untuk masuk tidak boleh mencairkan uang.
    const email = 'salahtujuan@tes.id'
    const daftar = await panggil('POST', '/api/auth/daftar', {
      body: { peran: 'kreator', nama: 'Salah Tujuan', email, kataSandi: 'rahasia123' },
    })
    const kodeVerifikasi = daftar.data.kodeOtp
    const verif = await panggil('POST', '/api/auth/otp/verifikasi', {
      body: { identitas: email, kode: kodeVerifikasi },
    })
    isiSaldo(verif.data.pengguna.id, 5_000_000)

    const res = await panggil('POST', '/api/dompet/tarik', {
      token: verif.data.token,
      body: { jumlah: 3_000_000, tujuan: 'BCA 1234567890', kodeOtp: kodeVerifikasi },
    })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /tidak ada kode aktif/i)
  })

  it('meloloskan penarikan besar dengan kode yang sah, lalu menghanguskan kodenya', async () => {
    const email = 'sah@tes.id'
    const kreator = await daftarkan({ peran: 'kreator', nama: 'Kode Sah', email })
    isiSaldo(kreator.id, 9_000_000)
    mundurkanJedaOtp(email)

    const minta = await panggil('POST', '/api/dompet/tarik/kode', { token: kreator.token })
    const kode = minta.data.kodeOtp
    assert.ok(kode)

    const pertama = await panggil('POST', '/api/dompet/tarik', {
      token: kreator.token,
      body: { jumlah: 4_000_000, tujuan: 'BCA 1234567890', kodeOtp: kode },
    })
    assert.equal(pertama.status, 200, JSON.stringify(pertama.data))
    assert.equal(pertama.data.saldoTersisa, 5_000_000)

    const kedua = await panggil('POST', '/api/dompet/tarik', {
      token: kreator.token,
      body: { jumlah: 4_000_000, tujuan: 'BCA 1234567890', kodeOtp: kode },
    })
    assert.equal(kedua.status, 400, 'kode sekali pakai tidak boleh berlaku dua kali')
    assert.equal(db.prepare('SELECT saldo FROM dompet WHERE pengguna_id = ?').get(kreator.id).saldo, 5_000_000)
  })

  it('tidak menghanguskan kode ketika penarikannya gagal karena saldo kurang', async () => {
    const email = 'saldokurang@tes.id'
    const kreator = await daftarkan({ peran: 'kreator', nama: 'Saldo Kurang', email })
    isiSaldo(kreator.id, 2_500_000)
    mundurkanJedaOtp(email)

    const minta = await panggil('POST', '/api/dompet/tarik/kode', { token: kreator.token })
    const kode = minta.data.kodeOtp

    const gagal = await panggil('POST', '/api/dompet/tarik', {
      token: kreator.token,
      body: { jumlah: 8_000_000, tujuan: 'BCA 1234567890', kodeOtp: kode },
    })
    assert.equal(gagal.status, 400)
    assert.match(gagal.data.galat, /saldo tidak cukup/i)

    const lagi = await panggil('POST', '/api/dompet/tarik', {
      token: kreator.token,
      body: { jumlah: 2_100_000, tujuan: 'BCA 1234567890', kodeOtp: kode },
    })
    assert.equal(lagi.status, 200, JSON.stringify(lagi.data))
  })

  it('memberitahu ambang 2FA lewat API, bukan lewat angka yang disalin ke layar', async () => {
    const kreator = await daftarkan({ peran: 'kreator', nama: 'Ambang', email: 'ambang@tes.id' })
    const res = await panggil('GET', '/api/dompet', { token: kreator.token })
    assert.equal(res.status, 200)
    assert.equal(res.data.ambang2fa, AMBANG_2FA)
  })

  // -------------------------------------------------------------------
  //  Ubah kata sandi
  // -------------------------------------------------------------------

  it('menolak ubah kata sandi kalau sandi lamanya salah', async () => {
    const umkm = await daftarkan({ peran: 'umkm', nama: 'Ubah Salah', email: 'ubahsalah@tes.id' })
    const res = await panggil('POST', '/api/auth/sandi/ubah', {
      token: umkm.token,
      body: { kataSandiLama: 'bukan-ini', kataSandiBaru: 'sandibaru123' },
    })
    assert.equal(res.status, 401)
    assert.match(res.data.galat, /kata sandi lama salah/i)
  })

  it('mengganti kata sandi, dan sandi lama langsung tidak berlaku', async () => {
    const email = 'ubahbenar@tes.id'
    const umkm = await daftarkan({ peran: 'umkm', nama: 'Ubah Benar', email })

    const ubah = await panggil('POST', '/api/auth/sandi/ubah', {
      token: umkm.token,
      body: { kataSandiLama: 'rahasia123', kataSandiBaru: 'sandibaru123' },
    })
    assert.equal(ubah.status, 200, JSON.stringify(ubah.data))

    const lama = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: email, kataSandi: 'rahasia123' },
    })
    assert.equal(lama.status, 401)

    const baru = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: email, kataSandi: 'sandibaru123' },
    })
    assert.equal(baru.status, 200, JSON.stringify(baru.data))
  })

  it('menolak kata sandi baru yang terlalu pendek', async () => {
    const umkm = await daftarkan({ peran: 'umkm', nama: 'Pendek', email: 'pendek@tes.id' })
    const res = await panggil('POST', '/api/auth/sandi/ubah', {
      token: umkm.token,
      body: { kataSandiLama: 'rahasia123', kataSandiBaru: 'abc' },
    })
    assert.equal(res.status, 400)
    assert.match(res.data.galat, /minimal 6/i)
  })

  // -------------------------------------------------------------------
  //  Lupa kata sandi
  // -------------------------------------------------------------------

  it('menjawab sama persis untuk email terdaftar maupun tidak', async () => {
    const email = 'lupa@tes.id'
    await daftarkan({ peran: 'kreator', nama: 'Lupa Sandi', email })
    mundurkanJedaOtp(email)

    const ada = await panggil('POST', '/api/auth/sandi/lupa', { body: { identitas: email } })
    const tiadaAlamat = 'tidak-pernah-ada@tes.id'
    const tiada = await panggil('POST', '/api/auth/sandi/lupa', { body: { identitas: tiadaAlamat } })

    assert.equal(ada.status, tiada.status)
    // Kalimatnya hanya berbeda pada alamat yang dikirim balik oleh pengguna
    // sendiri; strukturnya harus identik agar tidak bisa dipakai memetakan
    // email mana yang punya akun di sini.
    assert.equal(ada.data.pesan.replace(email, 'X'), tiada.data.pesan.replace(tiadaAlamat, 'X'))
    assert.equal(tiada.data.kodeOtp, undefined, 'email asing tidak boleh menerima kode')
  })

  it('menukar kode dengan kata sandi baru, lalu kode itu hangus', async () => {
    const email = 'reset@tes.id'
    await daftarkan({ peran: 'kreator', nama: 'Reset Sandi', email })
    mundurkanJedaOtp(email)

    const lupa = await panggil('POST', '/api/auth/sandi/lupa', { body: { identitas: email } })
    const kode = lupa.data.kodeOtp
    assert.ok(kode)

    const atur = await panggil('POST', '/api/auth/sandi/atur', {
      body: { identitas: email, kode, kataSandiBaru: 'sandireset123' },
    })
    assert.equal(atur.status, 200, JSON.stringify(atur.data))
    assert.ok(atur.data.token, 'pengguna langsung mendapat sesi setelah berhasil')

    const masuk = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: email, kataSandi: 'sandireset123' },
    })
    assert.equal(masuk.status, 200)

    const ulang = await panggil('POST', '/api/auth/sandi/atur', {
      body: { identitas: email, kode, kataSandiBaru: 'sandilain123' },
    })
    assert.equal(ulang.status, 400, 'kode reset hanya berlaku sekali')
  })

  it('menghanguskan kode reset setelah 5 tebakan salah', async () => {
    const email = 'brutal@tes.id'
    await daftarkan({ peran: 'kreator', nama: 'Tebak Brutal', email })
    mundurkanJedaOtp(email)

    const lupa = await panggil('POST', '/api/auth/sandi/lupa', { body: { identitas: email } })
    const kode = lupa.data.kodeOtp

    for (let i = 1; i <= 5; i += 1) {
      const salah = await panggil('POST', '/api/auth/sandi/atur', {
        body: { identitas: email, kode: '999999', kataSandiBaru: 'sandilain123' },
      })
      assert.equal(salah.status, 400)
    }

    const benarTapiTerlambat = await panggil('POST', '/api/auth/sandi/atur', {
      body: { identitas: email, kode, kataSandiBaru: 'sandilain123' },
    })
    assert.equal(benarTapiTerlambat.status, 400, 'kode yang sudah hangus tidak boleh hidup lagi')
  })

  it('menolak kode reset yang dipakai untuk memverifikasi akun orang lain', async () => {
    // Cermin dari tes penarikan: pemisahan tujuan berlaku ke dua arah.
    const email = 'silangtujuan@tes.id'
    await daftarkan({ peran: 'kreator', nama: 'Silang Tujuan', email })
    mundurkanJedaOtp(email)

    const lupa = await panggil('POST', '/api/auth/sandi/lupa', { body: { identitas: email } })
    const res = await panggil('POST', '/api/auth/otp/verifikasi', {
      body: { identitas: email, kode: lupa.data.kodeOtp },
    })
    assert.equal(res.status, 400)
  })
})
