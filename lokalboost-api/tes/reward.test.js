/**
 * Reward fleksibel (18 Okt 2026): banyak kreator per kampanye, tarif per view
 * atau CPM, target views minimal untuk pencairan, reward produk, dan video
 * yang disetor lewat tautan dengan views dari platform.
 *
 * Yang diuji terutama uangnya: siapa menerima berapa, kapan boleh cair, apa
 * yang hangus, dan bahwa neraca escrow selalu tertutup.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-reward-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
// Gerbang biaya pasang kampanye diuji sendiri di biaya-pasang.test.js.
process.env.BIAYA_PASANG_KAMPANYE = '0'
process.env.BOCORKAN_OTP = 'true'
process.env.TURSO_DATABASE_URL = ''
process.env.MIDTRANS_SERVER_KEY = ''
process.env.KOMISI_PERSEN = '5'
// ScrapeCreators dipalsukan di bawah; kuncinya hanya supaya jalurnya aktif.
process.env.SCRAPECREATORS_API_KEY = 'kunci-uji'
process.env.SCRAPECREATORS_BASE_URL = 'https://scrape.uji'

/** Video palsu di "platform": id -> { views, akun, desc, waktu }. */
const PLATFORM = new Map()
let panggilanPenyedia = 0
const fetchAsli = globalThis.fetch
globalThis.fetch = async (url, opsi = {}) => {
  const u = String(url)
  if (!u.startsWith('https://scrape.uji')) return fetchAsli(url, opsi)
  panggilanPenyedia++
  const tautan = new URL(u).searchParams.get('url') || ''
  const id = tautan.match(/video\/(\d+)/)?.[1]
  const v = PLATFORM.get(id)
  if (!v) return new Response(JSON.stringify({ message: 'tidak ada' }), { status: 404 })
  return new Response(
    JSON.stringify({
      aweme_detail: {
        aweme_id: id,
        desc: v.desc,
        author: { unique_id: v.akun },
        statistics: { play_count: v.views, digg_count: 1, comment_count: 0 },
        video: { duration: 30_000 },
        text_extra: [],
        create_time: v.waktu ?? Math.floor(Date.now() / 1000),
      },
      transcript: null,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

const { buatApp } = await import('../src/app.js')
const { db } = await import('../src/lib/db.js')
const { hashSandi } = await import('../src/lib/auth.js')
const { prosesPembayaran } = await import('../src/services/escrow.js')

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


/** Syarat ikut kampanye: profil lengkap + minimal satu akun terverifikasi. */
function jadikanLayak(id) {
  db.prepare("INSERT OR IGNORE INTO profil_kreator (pengguna_id) VALUES (?)").run(id)
  db.prepare(
    `UPDATE profil_kreator SET niche = COALESCE(NULLIF(niche, ''), 'Kuliner'),
       lokasi = COALESCE(NULLIF(lokasi, ''), 'Bogor'), bio = COALESCE(NULLIF(bio, ''), 'Konten kuliner kaki lima')
     WHERE pengguna_id = ?`,
  ).run(id)
  db.prepare(
    "INSERT OR REPLACE INTO statistik_terukur (kreator_id, platform, akun, penilaian) VALUES (?, 'youtube', ?, '{}')",
  ).run(id, `uji_${id}`)
}

async function daftarkan(peran, nama, email) {
  const daftar = await panggil('POST', '/api/auth/daftar', { body: { peran, nama, email, kataSandi: 'rahasia123' } })
  assert.equal(daftar.status, 201, JSON.stringify(daftar.data))
  const verif = await panggil('POST', '/api/auth/otp/verifikasi', { body: { identitas: email, kode: daftar.data.kodeOtp } })
  assert.equal(verif.status, 200, JSON.stringify(verif.data))
  if (peran === 'kreator') jadikanLayak(verif.data.pengguna.id)
  return { token: verif.data.token, id: verif.data.pengguna.id }
}

let nomorKampanye = 0
/** Buat kampanye + setor dana (simulasi). Kembalikan id. */
async function kampanyeBerdana(umkm, isian) {
  const buat = await panggil('POST', '/api/kampanye', {
    token: umkm.token,
    body: {
      nama: `Kampanye Reward ${++nomorKampanye}`,
      kategori: 'Kuliner',
      lokasi: 'Bogor',
      deskripsi: 'Nasi kotak hangat untuk acara kantor dan arisan.',
      ...isian,
    },
  })
  assert.equal(buat.status, 201, JSON.stringify(buat.data))
  const id = buat.data.kampanye.id
  if (buat.data.kampanye.modelReward !== 'produk') {
    const setor = await panggil('POST', `/api/kampanye/${id}/setor`, { token: umkm.token, body: { jumlah: buat.data.kampanye.anggaran } })
    assert.equal(setor.status, 200, JSON.stringify(setor.data))
  }
  return id
}

async function gabung(kampanyeId, umkm, kreator) {
  const lamar = await panggil('POST', `/api/kampanye/${kampanyeId}/undang`, { token: umkm.token, body: { kreatorId: kreator.id } })
  assert.equal(lamar.status, 201, JSON.stringify(lamar.data))
  const daftar = await panggil('GET', `/api/kampanye/${kampanyeId}/lamaran`, { token: umkm.token })
  const l = daftar.data.lamaran.find((x) => x.kreatorId === kreator.id)
  const setuju = await panggil('POST', `/api/kampanye/${kampanyeId}/lamaran/${l.id}/setujui`, { token: umkm.token })
  assert.equal(setuju.status, 200, JSON.stringify(setuju.data))
}

/** Pasang views tervalidasi seorang kreator lewat satu video tautan, lalu akrualkan. */
function setelViews(kampanyeId, kreatorId, views) {
  const id = `vid-${kampanyeId}-${kreatorId}`
  db.prepare(
    `INSERT INTO video (id, kampanye_id, kreator_id, judul, status, sumber, url, platform, platform_id, views_awal, views_diakui)
     VALUES (?, ?, ?, 'V', 'tayang', 'tautan', ?, 'tiktok', ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET views_diakui = excluded.views_diakui`,
  ).run(id, kampanyeId, kreatorId, `https://x/${id}`, `tiktok:${id}`, views)
  return prosesPembayaran(kampanyeId)
}

const dompet = async (akun) => (await panggil('GET', '/api/dompet', { token: akun.token })).data.dompet
const escrowDari = (id) => db.prepare('SELECT * FROM escrow WHERE kampanye_id = ?').get(id)

describe('Reward fleksibel', () => {
  const k = {}

  before(async () => {
    server = await new Promise((r) => {
      const s = buatApp().listen(0, () => r(s))
    })
    basis = `http://127.0.0.1:${server.address().port}`
    k.umkm = await daftarkan('umkm', 'Bu Sari', 'sari@reward.id')
    k.a = await daftarkan('kreator', 'Kreator A', 'a@reward.id')
    k.b = await daftarkan('kreator', 'Kreator B', 'b@reward.id')
    k.c = await daftarkan('kreator', 'Kreator C', 'c@reward.id')
    db.prepare(
      `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi)
       VALUES ('admin_rw', 'admin', 'Admin', 'admin@reward.id', ?, 1)`,
    ).run(hashSandi('rahasia123'))
    db.prepare("INSERT INTO dompet (pengguna_id) VALUES ('admin_rw')").run()
    k.admin = { token: (await panggil('POST', '/api/auth/masuk', { body: { identitas: 'admin@reward.id', kataSandi: 'rahasia123' } })).data.token }
  })

  after(async () => {
    globalThis.fetch = fetchAsli
    await new Promise((r) => server.close(r))
    db.close()
    for (const f of [dbSementara, `${dbSementara}-wal`, `${dbSementara}-shm`]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f)
      } catch {
        // dibiarkan untuk OS
      }
    }
  })

  describe('Pengaturan kampanye', () => {
    it('menolak anggaran yang tidak menutupi target pada tarif CPM', async () => {
      const res = await panggil('POST', '/api/kampanye', {
        token: k.umkm.token,
        body: { nama: 'Kurang Dana CPM', kategori: 'Kuliner', lokasi: 'Bogor', targetViews: 10_000, skemaTarif: 'cpm', tarifCpm: 25_000, anggaran: 200_000 },
      })
      assert.equal(res.status, 400)
      assert.match(res.data.galat, /Perlu minimal Rp 250\.000/)
    })

    it('menolak target minimal reward yang lebih besar dari target kampanye', async () => {
      const res = await panggil('POST', '/api/kampanye', {
        token: k.umkm.token,
        body: { nama: 'Ambang Kebesaran', kategori: 'Kuliner', lokasi: 'Bogor', targetViews: 5000, tarifPerView: 50, ambangViewsTunai: 6000 },
      })
      assert.equal(res.status, 400)
      assert.match(res.data.galat, /Target views minimal/)
    })

    it('menyimpan model reward, CPM, ambang, dan kategori tambahan', async () => {
      const res = await panggil('POST', '/api/kampanye', {
        token: k.umkm.token,
        body: {
          nama: 'Simpan Pengaturan',
          kategori: 'Kuliner',
          lokasi: 'Bogor',
          targetViews: 10_000,
          skemaTarif: 'cpm',
          tarifCpm: 12_500,
          anggaran: 150_000,
          ambangViewsTunai: 2000,
          modePencairan: 'sekali',
          kategoriLain: ['Ibu & Anak'],
        },
      })
      assert.equal(res.status, 201, JSON.stringify(res.data))
      const kmp = res.data.kampanye
      assert.equal(kmp.skemaTarif, 'cpm')
      assert.equal(kmp.tarifCpm, 12_500)
      assert.equal(kmp.ambangViewsTunai, 2000)
      assert.equal(kmp.modePencairan, 'sekali')
      assert.deepEqual(kmp.kategoriLain, ['Ibu & Anak'])
      assert.equal(kmp.anggaran, 150_000)
    })

    it('reward produk wajib memilih produk dari katalog sendiri', async () => {
      const res = await panggil('POST', '/api/kampanye', {
        token: k.umkm.token,
        body: { nama: 'Produk Tanpa Produk', kategori: 'Kuliner', lokasi: 'Bogor', targetViews: 5000, modelReward: 'produk', ambangViewsProduk: 1000 },
      })
      assert.equal(res.status, 400)
      assert.match(res.data.galat, /Pilih minimal satu produk/)
    })
  })

  describe('Banyak kreator dan tarif CPM', () => {
    it('banyak kreator bergabung, masing-masing dibayar dari views-nya sendiri', async () => {
      const id = await kampanyeBerdana(k.umkm, { targetViews: 10_000, skemaTarif: 'cpm', tarifCpm: 12_500, anggaran: 125_000 })
      await gabung(id, k.umkm, k.a)
      await gabung(id, k.umkm, k.b)

      setelViews(id, k.a.id, 1003)
      setelViews(id, k.b.id, 400)

      const a = db.prepare('SELECT * FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.a.id)
      const b = db.prepare('SELECT * FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.b.id)
      // CPM 12.500 = Rp 12,5 per view, dibulatkan ke bawah ke rupiah penuh.
      assert.equal(a.bruto_akrual, Math.floor((1003 * 12_500) / 1000))
      assert.equal(b.bruto_akrual, 5000)
      const e = escrowDari(id)
      assert.equal(e.jumlah_dicairkan, a.bruto_akrual + b.bruto_akrual)
      assert.equal(e.komisi_platform, a.komisi_akrual + b.komisi_akrual)

      // Akrual ulang tanpa views baru tidak membayar dua kali.
      const ulang = prosesPembayaran(id)
      assert.equal(ulang.biayaBaru, 0)
      k.kampanyeCpm = id
    })

    it('kreator yang bergabung lebih dulu dibayar lebih dulu saat dana hampir habis', async () => {
      const id = await kampanyeBerdana(k.umkm, { targetViews: 1000, tarifPerView: 100, anggaran: 100_000 })
      await gabung(id, k.umkm, k.a)
      await gabung(id, k.umkm, k.b)
      db.prepare('UPDATE video SET views_diakui = 0 WHERE kampanye_id = ?').run(id)
      setelViews(id, k.a.id, 700)
      setelViews(id, k.b.id, 290) // total 990 < target, kampanye masih berjalan
      const a = db.prepare('SELECT bruto_akrual FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.a.id)
      const b = db.prepare('SELECT bruto_akrual FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.b.id)
      assert.equal(a.bruto_akrual, 70_000)
      assert.equal(b.bruto_akrual, 29_000)
      // Sisa dana Rp 1.000 masih ada: kreator ketiga masih boleh melamar.
      const lamar = await panggil('POST', `/api/kampanye/${id}/undang`, { token: k.umkm.token, body: { kreatorId: k.c.id } })
      assert.equal(lamar.status, 201, JSON.stringify(lamar.data))
      k.kampanyeSempit = id
    })

    it('menolak kreator baru setelah anggaran habis', async () => {
      // Anggaran selalu >= biaya target, jadi dana habis bersamaan dengan
      // target tercapai: kampanye selesai dan berhenti menerima kreator.
      const id = await kampanyeBerdana(k.umkm, { targetViews: 1000, tarifPerView: 100, anggaran: 100_000 })
      await gabung(id, k.umkm, k.a)
      setelViews(id, k.a.id, 1500) // Rp 150.000 > anggaran: hanya Rp 100.000 terbayar
      const a = db.prepare('SELECT bruto_akrual FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.a.id)
      assert.equal(a.bruto_akrual, 100_000)
      assert.equal(db.prepare('SELECT status FROM kampanye WHERE id = ?').get(id).status, 'selesai')
      const lamar = await panggil('POST', `/api/kampanye/${id}/undang`, { token: k.umkm.token, body: { kreatorId: k.b.id } })
      assert.equal(lamar.status, 409)
    })
  })

  describe('Target views minimal untuk pencairan', () => {
    it('per milestone: cair sekali di tiap kelipatan ambang, tidak bisa dua kali', async () => {
      const id = await kampanyeBerdana(k.umkm, {
        targetViews: 10_000,
        tarifPerView: 10,
        anggaran: 100_000,
        ambangViewsTunai: 1000,
        modePencairan: 'per_milestone',
      })
      await gabung(id, k.umkm, k.a)
      const saldoAwal = (await dompet(k.a)).saldo

      setelViews(id, k.a.id, 900)
      const belum = await panggil('POST', `/api/kampanye/${id}/cairkan`, { token: k.a.token })
      assert.equal(belum.status, 409)
      assert.match(belum.data.galat, /belum mencapai 1\.000/)
      const status = await panggil('GET', `/api/kampanye/${id}/reward-saya`, { token: k.a.token })
      assert.equal(status.data.reward.tunai.kode, 'belum_ambang')

      setelViews(id, k.a.id, 2300) // milestone ke-2 langsung tercapai
      const cair = await panggil('POST', `/api/kampanye/${id}/cairkan`, { token: k.a.token })
      assert.equal(cair.status, 200, JSON.stringify(cair.data))
      const bersih = 23_000 - Math.round((23_000 * 5) / 100)
      assert.equal(cair.data.nominal, bersih)
      assert.equal(cair.data.milestone, 2)
      assert.equal((await dompet(k.a)).saldo, saldoAwal + bersih)

      const ganda = await panggil('POST', `/api/kampanye/${id}/cairkan`, { token: k.a.token })
      assert.equal(ganda.status, 409, 'milestone yang sama tidak boleh cair dua kali')

      setelViews(id, k.a.id, 2900)
      assert.equal((await panggil('POST', `/api/kampanye/${id}/cairkan`, { token: k.a.token })).status, 409)

      setelViews(id, k.a.id, 3000) // milestone ke-3
      const lagi = await panggil('POST', `/api/kampanye/${id}/cairkan`, { token: k.a.token })
      assert.equal(lagi.status, 200, JSON.stringify(lagi.data))
      const hakTotal = 30_000 - Math.round((30_000 * 5) / 100)
      assert.equal(cair.data.nominal + lagi.data.nominal, hakTotal)
    })

    it('mode sekali: hanya satu pencairan awal, sisanya cair saat kampanye selesai', async () => {
      const id = await kampanyeBerdana(k.umkm, {
        targetViews: 10_000,
        tarifPerView: 10,
        anggaran: 100_000,
        ambangViewsTunai: 1000,
        modePencairan: 'sekali',
      })
      await gabung(id, k.umkm, k.b)
      setelViews(id, k.b.id, 1200)
      assert.equal((await panggil('POST', `/api/kampanye/${id}/cairkan`, { token: k.b.token })).status, 200)
      setelViews(id, k.b.id, 2500)
      assert.equal((await panggil('POST', `/api/kampanye/${id}/cairkan`, { token: k.b.token })).status, 409)

      const tutup = await panggil('POST', `/api/kampanye/${id}/selesai`, { token: k.umkm.token, body: {} })
      assert.equal(tutup.status, 200, JSON.stringify(tutup.data))
      const l = db.prepare('SELECT * FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.b.id)
      assert.equal(l.bersih_dicairkan, l.bruto_akrual - l.komisi_akrual, 'semua hak bersih sudah cair')
    })

    it('kreator di bawah ambang saat kampanye selesai: reward hangus dan kembali ke UMKM', async () => {
      const id = await kampanyeBerdana(k.umkm, { targetViews: 10_000, tarifPerView: 10, anggaran: 100_000, ambangViewsTunai: 1000 })
      await gabung(id, k.umkm, k.a)
      await gabung(id, k.umkm, k.c)
      setelViews(id, k.a.id, 1500)
      setelViews(id, k.c.id, 600)
      const tertahanC = (await dompet(k.c)).saldoTertahan
      assert.ok(tertahanC > 0)

      const saldoUmkm = (await dompet(k.umkm)).saldo
      const tutup = await panggil('POST', `/api/kampanye/${id}/selesai`, { token: k.umkm.token, body: {} })
      assert.equal(tutup.status, 200, JSON.stringify(tutup.data))

      const c = db.prepare('SELECT * FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.c.id)
      assert.equal(c.hangus, 1)
      assert.equal((await dompet(k.c)).saldoTertahan, 0)

      // Neraca: disetor = kreator A (bersih) + komisi A + dikembalikan ke UMKM.
      const e = escrowDari(id)
      const a = db.prepare('SELECT * FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.a.id)
      assert.equal(e.jumlah_dicairkan, a.bruto_akrual)
      assert.equal(e.komisi_platform, a.komisi_akrual)
      assert.equal(e.jumlah_dikembalikan, 100_000 - a.bruto_akrual)
      assert.equal((await dompet(k.umkm)).saldo, saldoUmkm + e.jumlah_dikembalikan)
    })

    it('sengketa yang terbuka menahan pencairan', async () => {
      const id = await kampanyeBerdana(k.umkm, { targetViews: 10_000, tarifPerView: 10, anggaran: 100_000, ambangViewsTunai: 1000 })
      await gabung(id, k.umkm, k.a)
      setelViews(id, k.a.id, 1100)
      const s = await panggil('POST', '/api/sengketa', {
        token: k.umkm.token,
        body: { kampanyeId: id, kategori: 'lainnya', alasan: 'Ingin memastikan videonya sesuai brief.' },
      })
      assert.equal(s.status, 201, JSON.stringify(s.data))
      const status = await panggil('GET', `/api/kampanye/${id}/reward-saya`, { token: k.a.token })
      assert.equal(status.data.reward.tunai.kode, 'menunggu_verifikasi')
      const cair = await panggil('POST', `/api/kampanye/${id}/cairkan`, { token: k.a.token })
      assert.equal(cair.status, 409)
      assert.match(cair.data.galat, /sengketa/)
    })
  })

  describe('Reward produk', () => {
    it('kampanye produk terbit tanpa pembayaran, kuota dipotong dari stok', async () => {
      const p = await panggil('POST', '/api/produk', { token: k.umkm.token, body: { nama: 'Nastar 500 gr', nilai: 85_000, stok: 3 } })
      assert.equal(p.status, 201, JSON.stringify(p.data))
      k.produkId = p.data.produk.id

      const lebih = await panggil('POST', '/api/kampanye', {
        token: k.umkm.token,
        body: {
          nama: 'Produk Kebanyakan', kategori: 'Kuliner', lokasi: 'Bogor', targetViews: 5000,
          modelReward: 'produk', ambangViewsProduk: 1000, produkReward: [{ produkId: k.produkId, kuota: 5 }],
        },
      })
      assert.equal(lebih.status, 400)
      assert.match(lebih.data.galat, /Stok Nastar 500 gr tinggal 3/)

      const id = await kampanyeBerdana(k.umkm, {
        targetViews: 5000, modelReward: 'produk', ambangViewsProduk: 1000, produkReward: [{ produkId: k.produkId, kuota: 2 }],
      })
      const bayar = await panggil('POST', `/api/kampanye/${id}/setor`, { token: k.umkm.token, body: { jumlah: 1 } })
      assert.equal(bayar.status, 409, 'reward produk tidak menyetor uang')
      const terbit = await panggil('POST', `/api/kampanye/${id}/terbitkan`, { token: k.umkm.token })
      assert.equal(terbit.status, 200, JSON.stringify(terbit.data))
      assert.equal(terbit.data.kampanye.status, 'berjalan')
      assert.equal(db.prepare('SELECT stok FROM produk WHERE id = ?').get(k.produkId).stok, 1)
      k.kampanyeProduk = id
    })

    it('klaim hanya setelah ambang, satu kali per kreator, dan berhenti saat kuota habis', async () => {
      const id = k.kampanyeProduk
      await gabung(id, k.umkm, k.a)
      await gabung(id, k.umkm, k.b)
      await gabung(id, k.umkm, k.c)
      const alamat = 'Jl. Merdeka No. 10, Bogor Tengah, Kota Bogor'

      setelViews(id, k.a.id, 800)
      const kurang = await panggil('POST', `/api/kampanye/${id}/klaim-produk`, { token: k.a.token, body: { produkId: k.produkId, alamat } })
      assert.equal(kurang.status, 409)

      setelViews(id, k.a.id, 1000)
      setelViews(id, k.b.id, 1500)
      setelViews(id, k.c.id, 1200)
      const klaimA = await panggil('POST', `/api/kampanye/${id}/klaim-produk`, { token: k.a.token, body: { produkId: k.produkId, alamat } })
      assert.equal(klaimA.status, 201, JSON.stringify(klaimA.data))
      assert.equal(klaimA.data.reward.produk.kode, 'klaim_diproses')
      const ganda = await panggil('POST', `/api/kampanye/${id}/klaim-produk`, { token: k.a.token, body: { produkId: k.produkId, alamat } })
      assert.equal(ganda.status, 409)

      assert.equal((await panggil('POST', `/api/kampanye/${id}/klaim-produk`, { token: k.b.token, body: { produkId: k.produkId, alamat } })).status, 201)
      const habis = await panggil('POST', `/api/kampanye/${id}/klaim-produk`, { token: k.c.token, body: { produkId: k.produkId, alamat } })
      assert.equal(habis.status, 409)
      assert.match(habis.data.galat, /habis/)

      const kirim = await panggil('POST', `/api/kampanye/${id}/klaim/${klaimA.data.klaim.id}/kirim`, { token: k.umkm.token, body: { resi: 'JNE123456' } })
      assert.equal(kirim.status, 200, JSON.stringify(kirim.data))
      const status = await panggil('GET', `/api/kampanye/${id}/reward-saya`, { token: k.a.token })
      assert.equal(status.data.reward.produk.kode, 'produk_dikirim')
      assert.equal(status.data.reward.produk.klaim.resi, 'JNE123456')
    })
  })

  describe('Setor tautan video', () => {
    it('hanya kreator yang sudah diterima, dari akunnya sendiri', async () => {
      const id = await kampanyeBerdana(k.umkm, { targetViews: 50_000, tarifPerView: 10, anggaran: 500_000, ambangViewsTunai: 1000 })
      k.kampanyeTautan = id
      PLATFORM.set('7000000000000000001', { views: 500, akun: 'kreator_a', desc: 'Nasi kotak hangat Bu Sari #kuliner' })
      PLATFORM.set('7000000000000000002', { views: 100, akun: 'orang_lain', desc: 'Video orang lain' })
      const url1 = 'https://www.tiktok.com/@kreator_a/video/7000000000000000001'

      const belumGabung = await panggil('POST', '/api/video/tautan', { token: k.a.token, body: { kampanyeId: id, url: url1 } })
      assert.equal(belumGabung.status, 403)

      await gabung(id, k.umkm, k.a)
      const tanpaAkun = await panggil('POST', '/api/video/tautan', { token: k.a.token, body: { kampanyeId: id, url: url1 } })
      assert.equal(tanpaAkun.status, 400)
      assert.match(tanpaAkun.data.galat, /Hubungkan akun TikTok/)

      const profil = await panggil('PUT', '/api/auth/profil', { token: k.a.token, body: { sosial: { tiktok: 'kreator_a' } } })
      assert.equal(profil.status, 200, JSON.stringify(profil.data))

      const bukanMilik = await panggil('POST', '/api/video/tautan', {
        token: k.a.token,
        body: { kampanyeId: id, url: 'https://www.tiktok.com/@orang_lain/video/7000000000000000002' },
      })
      assert.equal(bukanMilik.status, 422)
      assert.match(bukanMilik.data.galat, /@orang_lain/)

      const setor = await panggil('POST', '/api/video/tautan', { token: k.a.token, body: { kampanyeId: id, url: url1 } })
      assert.equal(setor.status, 201, JSON.stringify(setor.data))
      // AI mati di tes: sistem tidak pernah meloloskan sendiri, pemilik usaha memutuskan.
      assert.equal(setor.data.video.kecocokan, 'tinjau')
      assert.equal(setor.data.video.status, 'diproses')
      assert.equal(setor.data.video.viewsAwal, 500)
      k.videoId = setor.data.video.id

      const kembar = await panggil('POST', '/api/video/tautan', { token: k.a.token, body: { kampanyeId: id, url: url1 } })
      assert.equal(kembar.status, 409)
    })

    it('menolak video yang diunggah sebelum kreator bergabung', async () => {
      PLATFORM.set('7000000000000000003', { views: 9000, akun: 'kreator_a', desc: 'Video lama', waktu: Math.floor(Date.now() / 1000) - 30 * 86400 })
      const res = await panggil('POST', '/api/video/tautan', {
        token: k.a.token,
        body: { kampanyeId: k.kampanyeTautan, url: 'https://www.tiktok.com/@kreator_a/video/7000000000000000003' },
      })
      assert.equal(res.status, 409)
      assert.match(res.data.galat, /sebelum Anda bergabung/)
    })

    it('views dihitung dari kenaikan setelah disetor, setelah pemilik usaha menyetujui', async () => {
      const id = k.kampanyeTutup = k.kampanyeTautan
      const setuju = await panggil('POST', `/api/video/${k.videoId}/kecocokan`, { token: k.umkm.token, body: { setujui: true } })
      assert.equal(setuju.status, 200, JSON.stringify(setuju.data))
      assert.equal(setuju.data.video.status, 'tayang')

      PLATFORM.get('7000000000000000001').views = 1700
      // Views baru saja diukur saat disetor; admin boleh melewati jeda.
      const perbarui = await panggil('POST', `/api/video/${k.videoId}/perbarui-views`, { token: k.admin.token })
      assert.equal(perbarui.status, 200, JSON.stringify(perbarui.data))
      assert.equal(perbarui.data.video.viewsDiakui, 1200, 'views sebelum disetor (500) tidak dihitung')

      const terlalu = await panggil('POST', `/api/video/${k.videoId}/perbarui-views`, { token: k.a.token })
      assert.equal(terlalu.status, 429, 'kreator dibatasi jeda antar pembaruan')

      const l = db.prepare('SELECT * FROM lamaran WHERE kampanye_id = ? AND kreator_id = ?').get(id, k.a.id)
      assert.equal(l.bruto_akrual, 12_000)
    })

    it('kenaikan tidak wajar ditahan dan menahan pencairan sampai admin mengakui', async () => {
      PLATFORM.get('7000000000000000001').views = 500 + 30_000
      const r = await panggil('POST', `/api/video/${k.videoId}/perbarui-views`, { token: k.admin.token })
      assert.equal(r.status, 200, JSON.stringify(r.data))
      assert.equal(r.data.video.viewsDiakui, 20_000)
      assert.equal(r.data.video.viewsTertahan, 10_000)

      const status = await panggil('GET', `/api/kampanye/${k.kampanyeTautan}/reward-saya`, { token: k.a.token })
      assert.equal(status.data.reward.tunai.kode, 'menunggu_verifikasi')

      const akui = await panggil('POST', `/api/video/${k.videoId}/akui-views`, { token: k.admin.token })
      assert.equal(akui.status, 200, JSON.stringify(akui.data))
      assert.equal(akui.data.video.viewsDiakui, 30_000)
      const lagi = await panggil('GET', `/api/kampanye/${k.kampanyeTautan}/reward-saya`, { token: k.a.token })
      assert.equal(lagi.data.reward.tunai.kode, 'memenuhi_syarat')
      assert.equal(lagi.data.reward.views, 30_000)
    })
  })
})
