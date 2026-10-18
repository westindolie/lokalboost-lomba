/**
 * Tes biaya pasang kampanye (pendapatan LokalBoost, services/biaya-pasang.js).
 *
 * Janji yang diuji:
 *   - kampanye tidak bisa dibuat sebelum biaya pasang lunas,
 *   - satu pembayaran = satu kampanye, termasuk saat dua permintaan bersamaan,
 *   - uangnya tidak pernah masuk Rekber,
 *   - begitu Midtrans aktif, jalur simulasi tertutup dan lunas hanya setelah
 *     status diambil ulang dari Midtrans (tiruan, tidak ada panggilan nyata).
 *
 * Jalankan: npm test
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-tes-biaya-pasang-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.KOMISI_PERSEN = '5'
process.env.BIAYA_PASANG_KAMPANYE = '10000'
// Mulai tanpa Midtrans (simulasi); bagian kedua menyalakannya lewat config.
process.env.MIDTRANS_SERVER_KEY = ''
process.env.MIDTRANS_CLIENT_KEY = ''
process.env.MIDTRANS_PRODUKSI = ''
const KUNCI_SERVER = 'SB-Mid-server-TES-pasang'

// ---------------------------------------------------------------------
//  Midtrans tiruan
// ---------------------------------------------------------------------

const palsu = { transaksi: new Map(), permintaanSnap: [] }
const fetchAsli = globalThis.fetch
globalThis.fetch = async (url, opsi = {}) => {
  const u = String(url)
  if (!u.includes('midtrans.com')) return fetchAsli(url, opsi)
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

  if (u.endsWith('/snap/v1/transactions')) {
    palsu.permintaanSnap.push(JSON.parse(opsi.body))
    const n = palsu.permintaanSnap.length
    return json({ token: `token-${n}`, redirect_url: `https://app.sandbox.midtrans.com/snap/v4/redirection/token-${n}` }, 201)
  }
  const cocok = u.match(/\/v2\/([^/]+)\/(status|cancel)$/)
  if (cocok) {
    const orderId = decodeURIComponent(cocok[1])
    if (cocok[2] === 'cancel') return json({ status_code: '404' })
    const t = palsu.transaksi.get(orderId)
    if (!t) return json({ status_code: '404', status_message: "Transaction doesn't exist." }, 404)
    return json({ status_code: '200', order_id: orderId, ...t })
  }
  throw new Error(`Midtrans tiruan tidak mengenal ${u}`)
}

const lunaskan = (orderId, jumlah) =>
  palsu.transaksi.set(orderId, {
    transaction_status: 'settlement',
    gross_amount: `${jumlah}.00`,
    payment_type: 'qris',
    fraud_status: 'accept',
  })

function notifikasi(orderId, jumlah) {
  const gross = `${jumlah}.00`
  const signature_key = crypto.createHash('sha512').update(`${orderId}200${gross}${KUNCI_SERVER}`).digest('hex')
  return { order_id: orderId, status_code: '200', gross_amount: gross, transaction_status: 'settlement', signature_key }
}

// ---------------------------------------------------------------------

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { hashSandi } = await import('../src/lib/auth.js')
const { config } = await import('../src/config.js')

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
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function daftarkan({ peran, nama, email }) {
  const daftar = await panggil('POST', '/api/auth/daftar', { body: { peran, nama, email, kataSandi: 'rahasia123' } })
  assert.equal(daftar.status, 201, JSON.stringify(daftar.data))
  const verif = await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: email, kode: daftar.data.kodeOtp } })
  assert.equal(verif.status, 200, JSON.stringify(verif.data))
  return { token: verif.data.token, id: verif.data.pengguna.id }
}

const isianKampanye = (nama) => ({
  nama,
  kategori: 'Kuliner',
  lokasi: 'Bogor',
  targetViews: 500,
  tarifPerView: 100,
  anggaran: 50_000,
})

const buatKampanye = (token, nama) => panggil('POST', '/api/kampanye', { token, body: isianKampanye(nama) })
const statusKampanye = (id) => db.prepare('SELECT status FROM kampanye WHERE id = ?').get(id).status
const jumlahKampanye = (umkmId) => db.prepare('SELECT COUNT(*) AS n FROM kampanye WHERE umkm_id = ?').get(umkmId).n
const barisBiaya = (umkmId) =>
  db.prepare("SELECT * FROM pembayaran WHERE umkm_id = ? AND jenis = 'biaya_pasang' ORDER BY dibuat_pada").all(umkmId)

describe('Biaya pasang kampanye', () => {
  const k = {}

  before(async () => {
    const app = buatApp()
    await new Promise((r) => {
      server = app.listen(0, r)
    })
    basis = `http://127.0.0.1:${server.address().port}`

    db.prepare(
      `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi)
       VALUES ('admin_bp', 'admin', 'Admin', 'admin-bp@tes.id', ?, 1)`,
    ).run(hashSandi('rahasia123'))
    db.prepare("INSERT INTO dompet (pengguna_id) VALUES ('admin_bp')").run()
    const masuk = await panggil('POST', '/api/auth/masuk', { body: { identitas: 'admin-bp@tes.id', kataSandi: 'rahasia123' } })
    k.admin = { token: masuk.data.token }

    k.umkm = await daftarkan({ peran: 'umkm', nama: 'Bu Sari', email: 'umkm-bp@tes.id' })
    k.lain = await daftarkan({ peran: 'umkm', nama: 'Pak Lain', email: 'lain-bp@tes.id' })
    k.kreator = await daftarkan({ peran: 'kreator', nama: 'Rafi', email: 'kreator-bp@tes.id' })
  })

  after(async () => {
    globalThis.fetch = fetchAsli
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

  describe('tanpa Midtrans (simulasi)', () => {
    it('melaporkan biaya Rp 10.000 yang belum dibayar', async () => {
      const res = await panggil('GET', '/api/pembayaran/biaya-pasang', { token: k.umkm.token })
      assert.equal(res.status, 200)
      assert.equal(res.data.aktif, true)
      assert.equal(res.data.biaya, 10_000)
      assert.equal(res.data.sudahBayar, false)
      assert.equal(res.data.midtrans, false)

      const publik = await panggil('GET', '/api/dashboard/statistik-publik')
      assert.equal(publik.data.biayaPasang, 10_000)
    })

    it('hanya untuk UMKM', async () => {
      assert.equal((await panggil('GET', '/api/pembayaran/biaya-pasang', { token: k.kreator.token })).status, 403)
      assert.equal((await panggil('POST', '/api/pembayaran/biaya-pasang/simulasi', { token: k.kreator.token })).status, 403)
    })

    it('menolak membuat kampanye sebelum biaya pasang lunas (402)', async () => {
      const res = await buatKampanye(k.umkm.token, 'Bakso Belum Bayar')
      assert.equal(res.status, 402, JSON.stringify(res.data))
      assert.match(res.data.pesan || res.data.galat || JSON.stringify(res.data), /Rp\s?10\.000/)
      assert.equal(jumlahKampanye(k.umkm.id), 0)
    })

    it('isian yang salah tetap dijawab 400, bukan 402', async () => {
      const res = await panggil('POST', '/api/kampanye', { token: k.umkm.token, body: { ...isianKampanye('Ab') } })
      assert.equal(res.status, 400)
    })

    it('bayar simulasi membuka satu kampanye, dan tidak bisa dibayar dua kali', async () => {
      const bayar = await panggil('POST', '/api/pembayaran/biaya-pasang/simulasi', { token: k.umkm.token })
      assert.equal(bayar.status, 201, JSON.stringify(bayar.data))
      assert.equal(bayar.data.tagihan.status, 'lunas')
      assert.equal(bayar.data.tagihan.jenis, 'biaya_pasang')
      assert.equal(bayar.data.tagihan.jumlah, 10_000)
      assert.equal(bayar.data.sudahBayar, true)

      const lagi = await panggil('POST', '/api/pembayaran/biaya-pasang/simulasi', { token: k.umkm.token })
      assert.equal(lagi.status, 409)
      assert.equal(barisBiaya(k.umkm.id).length, 1)
    })

    it('tiket terpakai oleh kampanye pertama; kampanye kedua butuh bayar lagi', async () => {
      const pertama = await buatKampanye(k.umkm.token, 'Bakso Sudah Bayar')
      assert.equal(pertama.status, 201, JSON.stringify(pertama.data))
      k.kampanyePertama = pertama.data.kampanye.id

      const [tiket] = barisBiaya(k.umkm.id)
      assert.equal(tiket.kampanye_id, k.kampanyePertama)

      // Biaya pasang bukan dana Rekber.
      const escrow = db.prepare('SELECT * FROM escrow WHERE kampanye_id = ?').get(k.kampanyePertama)
      assert.equal(escrow.jumlah_disetor, 0)
      assert.equal(pertama.data.kampanye.status, 'menunggu_dana')

      const status = await panggil('GET', '/api/pembayaran/biaya-pasang', { token: k.umkm.token })
      assert.equal(status.data.sudahBayar, false)
      assert.equal(status.data.riwayat[0].namaKampanye, 'Bakso Sudah Bayar')

      const kedua = await buatKampanye(k.umkm.token, 'Bakso Kedua')
      assert.equal(kedua.status, 402)
      assert.equal(jumlahKampanye(k.umkm.id), 1)
    })

    it('menyunting kampanye yang sudah ada tidak butuh biaya lagi', async () => {
      const res = await panggil('PATCH', `/api/kampanye/${k.kampanyePertama}`, {
        token: k.umkm.token,
        body: { deskripsi: 'Bakso aci kuah pedas, buka setiap hari.' },
      })
      assert.equal(res.status, 200, JSON.stringify(res.data))
    })

    it('tiket milik UMKM lain tidak bisa dipakai', async () => {
      await panggil('POST', '/api/pembayaran/biaya-pasang/simulasi', { token: k.umkm.token })
      const res = await buatKampanye(k.lain.token, 'Kampanye Pak Lain')
      assert.equal(res.status, 402)
      assert.equal(jumlahKampanye(k.lain.id), 0)
    })

    it('dua permintaan bersamaan dengan satu tiket: hanya satu kampanye lahir', async () => {
      const hasil = await Promise.all([
        buatKampanye(k.umkm.token, 'Balapan Satu'),
        buatKampanye(k.umkm.token, 'Balapan Dua'),
      ])
      const kode = hasil.map((h) => h.status).sort()
      assert.deepEqual(kode, [201, 402])
      assert.equal(jumlahKampanye(k.umkm.id), 2)
      assert.ok(barisBiaya(k.umkm.id).every((p) => p.kampanye_id), 'semua tiket sudah terpakai')
    })

    it('admin melihat pendapatan biaya pasang', async () => {
      const res = await panggil('GET', '/api/admin/ringkasan', { token: k.admin.token })
      assert.equal(res.status, 200)
      assert.equal(res.data.keuangan.biayaPasangTerkumpul, 20_000)
      assert.equal(res.data.keuangan.biayaPasangTarif, 10_000)
    })
  })

  describe('dengan Midtrans', () => {
    before(() => {
      config.midtrans.serverKey = KUNCI_SERVER
      config.midtrans.clientKey = 'SB-Mid-client-TES'
    })
    after(() => {
      config.midtrans.serverKey = ''
      config.midtrans.clientKey = ''
    })

    it('menutup jalur simulasi', async () => {
      const res = await panggil('POST', '/api/pembayaran/biaya-pasang/simulasi', { token: k.lain.token })
      assert.equal(res.status, 409)
      assert.equal(barisBiaya(k.lain.id).length, 0)
    })

    it('membuat tagihan Snap Rp 10.000 tanpa kampanye, dan memakai ulang yang masih berlaku', async () => {
      const res = await panggil('POST', '/api/pembayaran/biaya-pasang/tagihan', {
        token: k.lain.token,
        body: { metode: 'ewallet' },
      })
      assert.equal(res.status, 201, JSON.stringify(res.data))
      k.order = res.data.tagihan.orderId
      assert.match(k.order, /^LBP-/)
      assert.equal(res.data.tagihan.jumlah, 10_000)
      assert.equal(res.data.tagihan.jenis, 'biaya_pasang')
      assert.equal(res.data.tagihan.kampanyeId, null)

      const kiriman = palsu.permintaanSnap.at(-1)
      assert.equal(kiriman.transaction_details.gross_amount, 10_000)
      assert.equal(kiriman.item_details[0].price, 10_000)
      assert.match(kiriman.item_details[0].name, /Biaya pasang/)
      assert.match(kiriman.callbacks.finish, /\/umkm\/kampanye\/baru$/)

      const lagi = await panggil('POST', '/api/pembayaran/biaya-pasang/tagihan', {
        token: k.lain.token,
        body: { metode: 'ewallet' },
      })
      assert.equal(lagi.status, 200)
      assert.equal(lagi.data.tagihan.orderId, k.order)

      const status = await panggil('GET', '/api/pembayaran/biaya-pasang', { token: k.lain.token })
      assert.equal(status.data.sudahBayar, false)
      assert.equal(status.data.menunggu.orderId, k.order)
    })

    it('belum dibayar di Midtrans = kampanye tetap ditolak', async () => {
      const cek = await panggil('POST', `/api/pembayaran/${k.order}/cek`, { token: k.lain.token })
      assert.equal(cek.status, 200)
      assert.equal(cek.data.tagihan.status, 'menunggu')
      assert.equal((await buatKampanye(k.lain.token, 'Kampanye Menunggu')).status, 402)
    })

    it('lunas setelah status diambil ulang; notifikasi berulang tidak menggandakan tiket', async () => {
      lunaskan(k.order, 10_000)
      for (let i = 0; i < 3; i++) {
        const n = await panggil('POST', '/api/pembayaran/notifikasi', { body: notifikasi(k.order, 10_000) })
        assert.equal(n.status, 200)
      }
      const cek = await panggil('POST', `/api/pembayaran/${k.order}/cek`, { token: k.lain.token })
      assert.equal(cek.data.tagihan.status, 'lunas')
      assert.equal(cek.data.kampanye, null)

      const lunas = barisBiaya(k.lain.id).filter((p) => p.status === 'lunas')
      assert.equal(lunas.length, 1)
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transaksi WHERE pengguna_id = ? AND jenis = 'setor'").get(k.lain.id).n, 0)

      const res = await buatKampanye(k.lain.token, 'Kampanye Lunas Midtrans')
      assert.equal(res.status, 201, JSON.stringify(res.data))
      assert.equal(barisBiaya(k.lain.id).find((p) => p.order_id === k.order).kampanye_id, res.data.kampanye.id)
    })

    it('nominal Midtrans yang berbeda ditahan untuk ditinjau, bukan jadi tiket', async () => {
      const c = await daftarkan({ peran: 'umkm', nama: 'Bu Cici', email: 'cici-bp@tes.id' })
      const t = await panggil('POST', '/api/pembayaran/biaya-pasang/tagihan', { token: c.token, body: { metode: 'va' } })
      assert.equal(t.status, 201)
      lunaskan(t.data.tagihan.orderId, 5_000)
      const cek = await panggil('POST', `/api/pembayaran/${t.data.tagihan.orderId}/cek`, { token: c.token })
      assert.equal(cek.data.tagihan.status, 'perlu_tinjau')
      assert.equal((await buatKampanye(c.token, 'Kampanye Cici')).status, 402)
    })

    it('UMKM lain tidak bisa mengecek tagihan biaya pasang milik orang', async () => {
      const res = await panggil('POST', `/api/pembayaran/${k.order}/cek`, { token: k.umkm.token })
      assert.equal(res.status, 403)
    })

    describe('mode demo', () => {
      before(() => {
        config.modeDemo = true
      })
      after(() => {
        config.modeDemo = false
      })

      it('tetap menagih biaya pasang dan menyediakan simulasi di samping Midtrans', async () => {
        const d = await daftarkan({ peran: 'umkm', nama: 'Bu Demo', email: 'demo-bp@tes.id' })
        k.demo = d
        const st = await panggil('GET', '/api/pembayaran/biaya-pasang', { token: d.token })
        assert.equal(st.data.aktif, true, 'mode demo tidak boleh membuang biaya pasang')
        assert.equal(st.data.sudahBayar, false)
        assert.equal(st.data.midtrans, true)
        assert.equal(st.data.modeDemo, true)
        assert.equal((await buatKampanye(d.token, 'Kampanye Demo Belum Bayar')).status, 402)

        const konfig = await panggil('GET', '/api/pembayaran/konfigurasi')
        assert.equal(konfig.data.aktif, true)
        assert.equal(konfig.data.modeDemo, true)
      })

      it('simulasi biaya pasang jalan walau Midtrans aktif, lalu kampanye bisa dibuat', async () => {
        const bayar = await panggil('POST', '/api/pembayaran/biaya-pasang/simulasi', { token: k.demo.token })
        assert.equal(bayar.status, 201, JSON.stringify(bayar.data))
        assert.equal(bayar.data.tagihan.status, 'lunas')
        const buat = await buatKampanye(k.demo.token, 'Kampanye Demo Lunas')
        assert.equal(buat.status, 201, JSON.stringify(buat.data))
        k.kampanyeDemo = buat.data.kampanye.id
      })

      it('periksa tidak lagi mendanai otomatis; setor simulasi baru mendanai', async () => {
        const periksa = await panggil('POST', `/api/kampanye/${k.kampanyeDemo}/periksa`, { token: k.demo.token })
        assert.equal(periksa.status, 200)
        assert.equal(periksa.data.moderasi.status, 'lolos')
        assert.equal(db.prepare('SELECT jumlah_disetor AS n FROM escrow WHERE kampanye_id = ?').get(k.kampanyeDemo).n, 0)
        assert.equal(statusKampanye(k.kampanyeDemo), 'menunggu_dana')

        const setor = await panggil('POST', `/api/kampanye/${k.kampanyeDemo}/setor`, { token: k.demo.token, body: { jumlah: 50_000 } })
        assert.equal(setor.status, 200, JSON.stringify(setor.data))
        assert.equal(statusKampanye(k.kampanyeDemo), 'berjalan')
        const label = db.prepare("SELECT label FROM transaksi WHERE kampanye_id = ? AND jenis = 'setor'").get(k.kampanyeDemo).label
        assert.match(label, /^DEMO:/)
      })

      it('simulasi setor tetap melewati gerbang etika', async () => {
        await panggil('POST', '/api/pembayaran/biaya-pasang/simulasi', { token: k.demo.token })
        const buat = await panggil('POST', '/api/kampanye', {
          token: k.demo.token,
          body: { ...isianKampanye('Bakso Aci Kotor'), deskripsi: 'Jangan beli bakso di warung sebelah, mereka pakai boraks dan penipu.' },
        })
        assert.equal(buat.status, 201, JSON.stringify(buat.data))
        const id = buat.data.kampanye.id
        const setor = await panggil('POST', `/api/kampanye/${id}/setor`, { token: k.demo.token, body: { jumlah: 50_000 } })
        assert.equal(setor.status, 422)
        assert.equal(statusKampanye(id), 'menunggu_dana')
      })
    })
  })

  describe('pemeriksaan isi saat mengisi kampanye', () => {
    it('menolak isi yang menjelekkan usaha lain sebelum disimpan atau dibayar', async () => {
      const res = await panggil('POST', '/api/kampanye/periksa-isi', {
        token: k.umkm.token,
        body: {
          nama: 'Bakso Aci Mang Oleh',
          deskripsi: 'Jangan beli bakso di warung sebelah, mereka pakai boraks dan penipu.',
          brief: ['Tunjukkan bakso kami enak'],
        },
      })
      assert.equal(res.status, 200, JSON.stringify(res.data))
      assert.equal(res.data.moderasi.status, 'ditolak')
      assert.ok(res.data.moderasi.temuan.length > 0)
      assert.equal(jumlahKampanye(k.umkm.id), db.prepare('SELECT COUNT(*) AS n FROM kampanye WHERE umkm_id = ?').get(k.umkm.id).n)
    })

    it('meloloskan isi yang hanya membahas produk sendiri', async () => {
      const res = await panggil('POST', '/api/kampanye/periksa-isi', {
        token: k.umkm.token,
        body: { nama: 'Kopi Gayo Bang Ucok', deskripsi: 'Kopi arabika Gayo sangrai harian, diseduh manual V60.', brief: ['Tunjukkan proses seduh'] },
      })
      assert.equal(res.status, 200)
      assert.equal(res.data.moderasi.status, 'lolos')
    })

    it('hanya untuk UMKM dan menolak isian yang cacat', async () => {
      assert.equal((await panggil('POST', '/api/kampanye/periksa-isi', { token: k.kreator.token, body: { nama: 'Kopi Gayo' } })).status, 403)
      assert.equal((await panggil('POST', '/api/kampanye/periksa-isi', { token: k.umkm.token, body: { nama: 'Ab' } })).status, 400)
    })
  })
})
