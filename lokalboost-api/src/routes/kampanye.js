import fs from 'node:fs'
import { Router } from 'express'
import multer from 'multer'
import { db, transaksional } from '../lib/db.js'
import { wajibLogin, wajibPeran } from '../lib/auth.js'
import {
  bungkus,
  buatSlug,
  angkaPositif,
  galat400,
  galat403,
  galat404,
  galat409,
  wajibAda,
} from '../lib/util.js'
import { catatPilihan, rekomendasiKreator, skorKecocokan } from '../services/matchmaker.js'
import { prosesPembayaran, selesaikanKampanye, setorDana } from '../services/escrow.js'
import { deteksiAnomali, laporanAntiFraud } from '../services/antifraud.js'
import { statistikKampanye } from '../services/laporan.js'
import { kirimNotifikasi } from '../services/notifikasi.js'
import { ringkasLaporan } from '../services/ai.js'
import { midtransAktif } from '../services/midtrans.js'
import { config } from '../config.js'
import { hapusFoto, simpanFoto } from '../lib/penyimpanan-video.js'
import { BATAS_FOTO_MB, isiBerkasFotoSah, unggahFoto } from './auth.js'
import { rapikanReferensiSimpan } from '../services/referensi-konten.js'
import { pastikanTeks } from '../lib/validasi.js'
import { akunSosialPengguna } from '../services/akun-sosial.js'
import {
  bacaModerasi,
  pastikanLolosModerasi,
  periksaDanSimpan,
  setelUlangModerasi,
} from '../services/moderasi-kampanye.js'
import { batalkanTagihan } from '../services/midtrans.js'
import { batasLaju } from '../lib/batas.js'
import { pakaiTiket, pastikanAdaTiket } from '../services/biaya-pasang.js'
import {
  adalahPeserta,
  alokasikanProduk,
  cairkanReward,
  cpmDari,
  jumlahPeserta,
  klaimKampanye,
  klaimProduk,
  pastikanAnggaranCukup,
  produkKampanye,
  rapikanPengaturanReward,
  rapikanProdukReward,
  ringkasPeserta,
  simpanProdukReward,
  sisaKampanye,
  statusReward,
  tandaiProdukDikirim,
  tandaiProdukDiterima,
  terlibatKampanye,
  viewsKampanye,
} from '../services/reward.js'

export const rutaKampanye = Router()

function kelayakanKreatorIkut(kreatorId) {
  const profil = db
    .prepare(
      `SELECT p.nama, pk.niche, pk.lokasi, pk.bio
       FROM pengguna p LEFT JOIN profil_kreator pk ON pk.pengguna_id = p.id
       WHERE p.id = ? AND p.peran = 'kreator'`,
    )
    .get(kreatorId)
  if (!profil) {
    return { bolehIkut: false, profilLengkap: false, akunTerverifikasi: false, platformTerverifikasi: [] }
  }

  const profilLengkap = Boolean(profil.nama?.trim() && profil.niche?.trim() && profil.lokasi?.trim() && profil.bio?.trim())
  const platformTerverifikasi = db
    .prepare('SELECT platform FROM statistik_terukur WHERE kreator_id = ? ORDER BY platform')
    .all(kreatorId)
    .map((baris) => baris.platform)
  const akunTerverifikasi = platformTerverifikasi.length > 0

  return { bolehIkut: profilLengkap && akunTerverifikasi, profilLengkap, akunTerverifikasi, platformTerverifikasi }
}

function pastikanLayakKreatorIkut(kreatorId) {
  const kelayakan = kelayakanKreatorIkut(kreatorId)
  if (!kelayakan.profilLengkap) {
    throw galat409('Lengkapi nama, niche, lokasi, dan bio profil kreator sebelum ikut kampanye.')
  }
  if (!kelayakan.akunTerverifikasi) {
    throw galat409('Verifikasi minimal satu akun TikTok, Instagram, atau YouTube lewat menu Cek Profil sebelum ikut kampanye.')
  }
  return kelayakan
}

const ambil = (id) => db.prepare('SELECT * FROM kampanye WHERE id = ?').get(id)

function hitungSisaHari(k) {
  if (!k.diterbitkan_pada) return k.tenggat_hari
  const terbit = Date.parse(`${String(k.diterbitkan_pada).replace(' ', 'T')}Z`)
  if (!Number.isFinite(terbit)) return k.tenggat_hari
  return Math.max(0, Math.ceil((terbit + Number(k.tenggat_hari) * 86_400_000 - Date.now()) / 86_400_000))
}

/** Video acuan gaya dari UMKM, urut sesuai yang ditempel. */
export const referensiKampanye = (kampanyeId) =>
  db
    .prepare('SELECT platform, url, judul, penulis FROM kampanye_referensi WHERE kampanye_id = ? ORDER BY urutan, id')
    .all(kampanyeId)

/** Ganti seluruh referensi kampanye. Dipanggil di dalam transaksi. */
function simpanReferensi(kampanyeId, daftar) {
  db.prepare('DELETE FROM kampanye_referensi WHERE kampanye_id = ?').run(kampanyeId)
  const stmt = db.prepare(
    'INSERT INTO kampanye_referensi (kampanye_id, platform, url, judul, penulis, urutan) VALUES (?, ?, ?, ?, ?, ?)',
  )
  daftar.forEach((r, i) => stmt.run(kampanyeId, r.platform, r.url, r.judul, r.penulis, i))
}

/** Atribusi foto berlisensi CC (disimpan sebagai JSON). Rusak = dianggap tidak ada. */
function bacaKredit(teks) {
  if (!teks) return null
  try {
    return JSON.parse(teks)
  } catch {
    return null
  }
}

/** Bentuk kampanye untuk klien: camelCase + angka turunan yang sering dipakai. */
export function bentukKampanye(k, { ringkas = false } = {}) {
  if (!k) return null
  const umkm = db
    .prepare(
      `SELECT p.nama, p.contoh, pu.nama_usaha, pu.terverifikasi, pu.foto, pu.lokasi
       FROM pengguna p LEFT JOIN profil_umkm pu ON pu.pengguna_id = p.id
       WHERE p.id = ?`,
    )
    .get(k.umkm_id)
  const umkmGaleri = db
    .prepare('SELECT id, foto FROM profil_umkm_foto WHERE pengguna_id = ? ORDER BY dibuat_pada, id')
    .all(k.umkm_id)

  const hitung = viewsKampanye(k.id)
  const sisa = sisaKampanye(k)
  const produk = k.model_reward && k.model_reward !== 'tunai' ? produkKampanye(k.id) : []

  const dasar = {
    id: k.id,
    nama: k.nama,
    umkmId: k.umkm_id,
    umkm: umkm?.nama_usaha || umkm?.nama || null,
    umkmTerverifikasi: Boolean(umkm?.terverifikasi),
    umkmFoto: umkm?.foto || null,
    umkmGaleri: umkmGaleri.map((baris) => ({ id: baris.id, foto: baris.foto })),
    contoh: Boolean(umkm?.contoh),
    kategori: k.kategori,
    lokasi: k.lokasi,
    targetViews: k.target_views,
    viewsTervalidasi: hitung.tervalidasi || 0,
    viewsDisaring: hitung.disaring || 0,
    tarifPerView: k.tarif_per_view,
    anggaran: k.anggaran,
    batasMaksBiaya: k.batas_maks_biaya,
    status: k.status,
    moderasiStatus: k.moderasi_status || 'belum',
    tenggatHari: k.tenggat_hari,
    sisaHari: hitungSisaHari(k),
    kreatorId: k.kreator_id,
    // Reward fleksibel (services/reward.js)
    modelReward: k.model_reward || 'tunai',
    skemaTarif: k.skema_tarif || 'per_view',
    tarifCpm: cpmDari(k),
    ambangViewsTunai: k.ambang_views_tunai || 0,
    ambangViewsProduk: k.ambang_views_produk || 0,
    modePencairan: k.mode_pencairan || 'per_milestone',
    kategoriLain: k.kategori_lain ? JSON.parse(k.kategori_lain) : [],
    produkReward: produk,
    jumlahKreator: jumlahPeserta(k.id),
    sisaDana: sisa.sisaDana,
    sisaKuotaProduk: sisa.sisaKuota,
    menerimaKreator: sisa.menerima,
    gradasi: k.gradasi,
    gambar: k.gambar || null,
    gambarKredit: bacaKredit(k.gambar_kredit),
    dibuatPada: k.dibuat_pada,
    diterbitkanPada: k.diterbitkan_pada || null,
  }
  // Deskripsi ikut pada bentuk ringkas: kartu marketplace tanpa deskripsi
  // memaksa antarmuka mengarang teks pengganti, dan yang terpakai kemarin
  // adalah alasan skor AI — kalimat yang sama persis di semua kartu.
  if (ringkas) return { ...dasar, deskripsi: k.deskripsi }

  return {
    ...dasar,
    deskripsi: k.deskripsi,
    brief: db
      .prepare('SELECT isi FROM kampanye_brief WHERE kampanye_id = ? ORDER BY urutan, id')
      .all(k.id)
      .map((b) => b.isi),
    referensi: referensiKampanye(k.id),
    umkmProfil: {
      nama: umkm?.nama || null,
      lokasi: umkm?.lokasi || null,
      sosial: akunSosialPengguna(k.umkm_id),
    },
    kreator: k.kreator_id
      ? db.prepare('SELECT id, nama FROM pengguna WHERE id = ?').get(k.kreator_id)
      : null,
    selesaiPada: k.selesai_pada,
  }
}

// =====================================================================
//  Marketplace
// =====================================================================

/**
 * GET /api/kampanye
 * Marketplace Kampanye Promosi (PRD §6.1) dengan filter kategori, lokasi,
 * dan rentang anggaran. Untuk kreator yang login, tiap kampanye juga
 * membawa skor kecocokan AI Smart Matchmaker.
 */
rutaKampanye.get(
  '/',
  bungkus((req, res) => {
    const { kategori, lokasi, anggaranMin, anggaranMaks, status, q, umkmId } = req.query
    const syarat = []
    const nilai = []

    if (kategori) {
      // Kategori tambahan disimpan sebagai array JSON; dicocokkan utuh dengan kutipnya.
      syarat.push("(kategori = ? OR kategori_lain LIKE ?)")
      nilai.push(kategori, `%"${String(kategori).replace(/["%_]/g, '')}"%`)
    }
    if (lokasi) {
      syarat.push('lower(lokasi) = lower(?)')
      nilai.push(lokasi)
    }
    if (anggaranMin) {
      syarat.push('anggaran >= ?')
      nilai.push(Number(anggaranMin))
    }
    if (anggaranMaks) {
      syarat.push('anggaran <= ?')
      nilai.push(Number(anggaranMaks))
    }
    if (umkmId) {
      syarat.push('umkm_id = ?')
      nilai.push(umkmId)
    }
    if (q) {
      syarat.push('(lower(nama) LIKE lower(?) OR lower(deskripsi) LIKE lower(?))')
      nilai.push(`%${q}%`, `%${q}%`)
    }

    if (status) {
      syarat.push(`status IN (${status.split(',').map(() => '?').join(',')})`)
      nilai.push(...status.split(','))
    } else if (!umkmId) {
      // Marketplace publik hanya menampilkan kampanye yang dananya sudah
      // aman di Rekber — kreator tidak boleh melamar kampanye tanpa dana.
      syarat.push("status = 'berjalan'")
    }

    const where = syarat.length ? `WHERE ${syarat.join(' AND ')}` : ''
    const daftar = db.prepare(`SELECT * FROM kampanye ${where} ORDER BY dibuat_pada DESC`).all(...nilai)

    let hasil = daftar.map((k) => bentukKampanye(k, { ringkas: true }))

    if (req.pengguna?.peran === 'kreator') {
      const profil = db.prepare('SELECT * FROM profil_kreator WHERE pengguna_id = ?').get(req.pengguna.id)
      if (profil) {
        hasil = hasil
          .map((k, i) => {
            const s = skorKecocokan(daftar[i], profil)
            return { ...k, kecocokan: s.skor, alasanKecocokan: s.alasanUtama }
          })
          .sort((a, b) => b.kecocokan - a.kecocokan)
      }
    }

    if (!umkmId) hasil = hasil.filter((k) => k.menerimaKreator)

    res.json({ jumlah: hasil.length, kampanye: hasil })
  }),
)

// =====================================================================
//  Pembuatan kampanye (alur 3 langkah)
// =====================================================================

/**
 * POST /api/kampanye
 * Langkah 1 + 2: deskripsi produk, brief, target, dan anggaran.
 * Kampanye tersimpan berstatus "menunggu_dana" dan belum terlihat di
 * marketplace sampai dana disetor.
 */
/**
 * Periksa & rapikan field teks kampanye di tempat (POST dan PATCH). Field yang
 * tidak dikirim dibiarkan, karena PATCH boleh menyunting sebagian.
 */
function rapikanIsianKampanye(b) {
  const ada = (k) => b[k] !== undefined && b[k] !== null
  if (ada('nama')) b.nama = pastikanTeks(b.nama, 'Nama produk', { min: 3, maks: 80 })
  if (ada('kategori')) b.kategori = pastikanTeks(b.kategori, 'Kategori', { min: 3, maks: 40 })
  if (ada('lokasi')) b.lokasi = pastikanTeks(b.lokasi, 'Lokasi usaha', { min: 3, maks: 60 })
  if (ada('deskripsi')) {
    b.deskripsi = String(b.deskripsi).trim()
      ? pastikanTeks(b.deskripsi, 'Deskripsi produk', { min: 10, maks: 1000 })
      : null
  }
  if (ada('tenggatHari')) {
    const n = Number(b.tenggatHari)
    if (!Number.isInteger(n) || n < 1 || n > 90) throw galat400('Lama kampanye harus 1 sampai 90 hari.')
    b.tenggatHari = n
  }
  if (Array.isArray(b.brief)) {
    b.brief = b.brief.map((p) => String(p ?? '').trim().replace(/\s+/g, ' ')).filter(Boolean)
    if (b.brief.length > 10) throw galat400('Poin wajib maksimal 10 baris.')
    if (b.brief.some((p) => p.length > 200)) throw galat400('Setiap poin wajib maksimal 200 karakter.')
  }
}

rutaKampanye.post(
  '/',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const b = { ...wajibAda(req.body, ['nama', 'kategori', 'lokasi', 'targetViews']) }
    rapikanIsianKampanye(b)

    const r = rapikanPengaturanReward(b)
    // Reward produk saja tidak menyetor uang ke Rekber: anggaran tunai 0.
    const anggaran =
      r.model === 'produk' ? 0 : b.anggaran ? angkaPositif(b.anggaran, 'Anggaran') : Math.ceil((r.targetViews * r.cpm) / 1000)
    pastikanAnggaranCukup(r, anggaran)
    const produk = rapikanProdukReward(b.produkReward, req.pengguna.id, r.model)

    // Slug unik supaya URL kampanye enak dibaca ("/kampanye/bakso-aci").
    // Divalidasi sebelum transaksi: tautan salah = 400, bukan kampanye setengah jadi.
    const referensi = rapikanReferensiSimpan(b.referensi)

    // Biaya pasang (pendapatan LokalBoost) dibayar sebelum kampanye boleh ada.
    // Dicek setelah validasi isian, supaya isian salah tetap dijawab 400.
    pastikanAdaTiket(req.pengguna.id)

    let id = buatSlug(b.nama)
    let n = 1
    while (ambil(id)) id = `${buatSlug(b.nama)}-${++n}`

    transaksional(() => {
      db.prepare(
        `INSERT INTO kampanye
           (id, umkm_id, nama, kategori, lokasi, deskripsi, target_views, tarif_per_view,
            anggaran, batas_maks_biaya, tenggat_hari, status, gradasi,
            model_reward, skema_tarif, tarif_cpm, ambang_views_tunai, ambang_views_produk,
            mode_pencairan, kategori_lain)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'menunggu_dana', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        req.pengguna.id,
        b.nama,
        b.kategori,
        b.lokasi,
        b.deskripsi || null,
        r.targetViews,
        r.tarifPerView,
        anggaran,
        b.batasMaksBiaya ? angkaPositif(b.batasMaksBiaya, 'Batas maksimal biaya') : anggaran,
        b.tenggatHari ? Number(b.tenggatHari) : 14,
        b.gradasi || null,
        r.model,
        r.skema,
        r.cpm,
        r.ambangTunai,
        r.ambangProduk,
        r.mode,
        r.kategoriLain.length ? JSON.stringify(r.kategoriLain) : null,
      )

      const brief = Array.isArray(b.brief) ? b.brief : []
      const stmt = db.prepare('INSERT INTO kampanye_brief (kampanye_id, isi, urutan) VALUES (?, ?, ?)')
      brief.forEach((isi, i) => stmt.run(id, String(isi), i))
      simpanReferensi(id, referensi)
      simpanProdukReward(id, produk)

      db.prepare("INSERT INTO escrow (kampanye_id, status) VALUES (?, 'kosong')").run(id)
      // Di transaksi yang sama: tiket habis dipakai kampanye lain = kampanye ini batal.
      pakaiTiket(req.pengguna.id, id)
    })()

    res.status(201).json({
      pesan:
        r.model === 'produk'
          ? 'Kampanye tersimpan. Terbitkan setelah lolos pemeriksaan untuk menayangkannya.'
          : 'Kampanye tersimpan. Setor dana ke Rekber untuk menayangkannya.',
      kampanye: bentukKampanye(ambil(id)),
    })
  }),
)

/** POST /api/kampanye/:id/gambar — unggah foto utama produk kampanye. */
rutaKampanye.post(
  '/:id/gambar',
  wajibPeran('umkm'),
  (req, res, next) => {
    const k = ambil(req.params.id)
    if (!k) return next(galat404('Kampanye tidak ditemukan.'))
    if (k.umkm_id !== req.pengguna.id) return next(galat403())
    if (!['draf', 'menunggu_dana'].includes(k.status)) {
      return next(galat409('Foto produk hanya bisa diubah sebelum kampanye diterbitkan.'))
    }
    unggahFoto.single('foto')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(galat400(`Ukuran foto maksimal ${BATAS_FOTO_MB} MB.`))
      }
      next(err)
    })
  },
  bungkus(async (req, res) => {
    const k = ambil(req.params.id)
    const berkas = req.file
    if (!berkas) throw galat400('Pilih foto produk yang akan diunggah.')
    if (!isiBerkasFotoSah(berkas.path)) {
      fs.rmSync(berkas.path, { force: true })
      throw galat400('Berkas itu bukan foto JPG, PNG, atau WebP yang sah.')
    }
    const gambar = await simpanFoto(berkas)
    db.prepare('UPDATE kampanye SET gambar = ?, gambar_kredit = NULL WHERE id = ?').run(gambar, k.id)
    if (k.gambar && k.gambar !== gambar) {
      await hapusFoto(k.gambar, config.folderUnggahan).catch((e) => console.warn(`[KAMPANYE] Foto lama gagal dihapus: ${e.message}`))
    }
    res.json({ pesan: 'Foto produk kampanye diperbarui.', kampanye: bentukKampanye(ambil(k.id)) })
  }),
)

/** PATCH /api/kampanye/:id — sunting selama dana belum disetor. */
rutaKampanye.patch(
  '/:id',
  wajibPeran('umkm'),
  bungkus(async (req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id) throw galat403()
    if (k.status !== 'menunggu_dana' && k.status !== 'draf') {
      throw galat409('Kampanye yang dananya sudah disetor tidak bisa diubah. Buat kampanye baru bila perlu.')
    }

    const b = { ...(req.body || {}) }
    rapikanIsianKampanye(b)
    const r = rapikanPengaturanReward(b, k)
    const anggaran = r.model === 'produk' ? 0 : b.anggaran ? angkaPositif(b.anggaran, 'Anggaran') : k.anggaran

    try {
      pastikanAnggaranCukup(r, anggaran)
    } catch {
      throw galat400('Anggaran tidak cukup untuk target dan tarif yang baru.')
    }
    const produk =
      b.produkReward !== undefined || r.model !== k.model_reward
        ? rapikanProdukReward(b.produkReward, req.pengguna.id, r.model)
        : null
    const referensi = b.referensi === undefined ? null : rapikanReferensiSimpan(b.referensi)

    db.prepare(
      `UPDATE kampanye SET nama = ?, kategori = ?, lokasi = ?, deskripsi = ?,
              target_views = ?, tarif_per_view = ?, anggaran = ?, batas_maks_biaya = ?, tenggat_hari = ?,
              model_reward = ?, skema_tarif = ?, tarif_cpm = ?, ambang_views_tunai = ?,
              ambang_views_produk = ?, mode_pencairan = ?, kategori_lain = ?
       WHERE id = ?`,
    ).run(
      b.nama ?? k.nama,
      b.kategori ?? k.kategori,
      b.lokasi ?? k.lokasi,
      b.deskripsi ?? k.deskripsi,
      r.targetViews,
      r.tarifPerView,
      anggaran,
      b.batasMaksBiaya ? angkaPositif(b.batasMaksBiaya, 'Batas maksimal biaya') : anggaran,
      b.tenggatHari ?? k.tenggat_hari,
      r.model,
      r.skema,
      r.cpm,
      r.ambangTunai,
      r.ambangProduk,
      r.mode,
      r.kategoriLain.length ? JSON.stringify(r.kategoriLain) : null,
      k.id,
    )
    if (produk) simpanProdukReward(k.id, produk)

    if (Array.isArray(b.brief)) {
      db.prepare('DELETE FROM kampanye_brief WHERE kampanye_id = ?').run(k.id)
      const stmt = db.prepare('INSERT INTO kampanye_brief (kampanye_id, isi, urutan) VALUES (?, ?, ?)')
      b.brief.forEach((isi, i) => stmt.run(k.id, String(isi), i))
    }
    if (referensi) simpanReferensi(k.id, referensi)

    // Isi yang dibaca kreator berubah: hasil pemeriksaan etika lama tidak
    // berlaku. Tagihan yang masih terbuka ikut dibatalkan, karena tagihan itu
    // dibuat untuk isi yang sudah lolos dan bisa dibayar untuk isi yang baru.
    const isiBerubah =
      ['nama', 'deskripsi'].some((f) => b[f] !== undefined && (b[f] ?? null) !== (k[f] ?? null)) ||
      Array.isArray(b.brief)
    if (isiBerubah && k.moderasi_status !== 'belum') {
      setelUlangModerasi(k.id)
      if (midtransAktif()) {
        const terbuka = db
          .prepare("SELECT * FROM pembayaran WHERE kampanye_id = ? AND status = 'menunggu'")
          .all(k.id)
        for (const p of terbuka) await batalkanTagihan(p)
      }
    }

    res.json({ pesan: 'Kampanye diperbarui.', kampanye: bentukKampanye(ambil(k.id)) })
  }),
)

/**
 * POST /api/kampanye/:id/setor — langkah 3: dana masuk Rekber (SIMULASI).
 *
 * Begitu Midtrans aktif, jalur ini ditutup: tanpa itu UMKM bisa melewati
 * pembayaran dengan memanggil endpoint ini langsung dan kampanyenya tayang
 * tanpa uang sungguhan. Escrow lalu hanya diisi services/midtrans.js.
 */
rutaKampanye.post(
  '/:id/setor',
  wajibPeran('umkm'),
  bungkus(async (req, res) => {
    if (midtransAktif()) {
      throw galat409('Setor dana memakai pembayaran Midtrans. Buat tagihan lewat POST /api/pembayaran/tagihan.')
    }
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id) throw galat403()
    if (k.model_reward === 'produk') throw galat409('Kampanye reward produk tidak perlu setor dana. Terbitkan langsung.')
    await pastikanLolosModerasi(k)
    const hasil = setorDana({
      kampanyeId: req.params.id,
      umkmId: req.pengguna.id,
      jumlah: req.body?.jumlah,
      metode: req.body?.metode,
    })
    res.json({
      pesan: 'Dana aman di Rekber. Kampanye Anda sudah tayang di marketplace.',
      ...hasil,
      kampanye: bentukKampanye(ambil(req.params.id)),
    })
  }),
)

/**
 * POST /api/kampanye/:id/terbitkan — kampanye reward PRODUK saja.
 * Tidak ada uang yang masuk Rekber, jadi tidak ada pembayaran yang ditunggu.
 * Gerbangnya tetap sama: lolos pemeriksaan etika, lalu kuota produk dipotong
 * dari stok di transaksi yang sama dengan perubahan status.
 */
rutaKampanye.post(
  '/:id/terbitkan',
  wajibPeran('umkm'),
  bungkus(async (req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id) throw galat403()
    if (k.model_reward !== 'produk') {
      throw galat409('Kampanye dengan reward uang terbit setelah dana masuk Rekber.')
    }
    if (k.status !== 'menunggu_dana' && k.status !== 'draf') throw galat409('Kampanye ini sudah terbit.')
    await pastikanLolosModerasi(k)
    transaksional(() => {
      alokasikanProduk(k.id)
      const sisa = db.prepare('SELECT COALESCE(SUM(kuota), 0) AS n FROM kampanye_produk WHERE kampanye_id = ?').get(k.id).n
      if (sisa <= 0) throw galat409('Stok produk reward habis. Tambah stok di katalog lalu coba lagi.')
      db.prepare("UPDATE kampanye SET status = 'berjalan', diterbitkan_pada = COALESCE(diterbitkan_pada, ?) WHERE id = ?")
        .run(new Date().toISOString().slice(0, 19).replace('T', ' '), k.id)
    })()
    res.json({ pesan: 'Kampanye terbit di marketplace.', kampanye: bentukKampanye(ambil(k.id)) })
  }),
)

// =====================================================================
//  Pemeriksaan etika sebelum tayang
// =====================================================================

/** Kampanye milik UMKM yang login dan belum dibayar. */
function kampanyeBelumBayar(req) {
  const k = ambil(req.params.id)
  if (!k) throw galat404('Kampanye tidak ditemukan.')
  if (k.umkm_id !== req.pengguna.id) throw galat403()
  if (k.status !== 'menunggu_dana' && k.status !== 'draf') {
    throw galat409('Kampanye ini sudah tayang.')
  }
  return k
}

/**
 * POST /api/kampanye/:id/periksa
 * Periksa apakah kampanye menjelekkan usaha lain, sebelum UMKM membayar.
 * Hasil disimpan; memanggil lagi tanpa mengubah isi mengembalikan hasil yang
 * sama (lihat `periksaDanSimpan`).
 */
rutaKampanye.post(
  '/:id/periksa',
  wajibPeran('umkm'),
  batasLaju({
    maks: 10,
    detik: 60,
    kunci: (req) => req.pengguna?.id && `periksa-kampanye:${req.pengguna.id}`,
    pesan: 'Terlalu banyak pemeriksaan. Tunggu sebentar lalu coba lagi.',
  }),
  bungkus(async (req, res) => {
    const k = kampanyeBelumBayar(req)
    const moderasi = await periksaDanSimpan(k)
    res.json({ moderasi })
  }),
)

/** GET /api/kampanye/:id/moderasi — hasil pemeriksaan terakhir (pemilik atau admin). */
rutaKampanye.get(
  '/:id/moderasi',
  wajibLogin,
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id && req.pengguna.peran !== 'admin') throw galat403()
    res.json({ moderasi: bacaModerasi(k) })
  }),
)

/**
 * POST /api/kampanye/:id/banding  Body: { alasan }
 * UMKM merasa penolakan otomatis keliru: serahkan ke admin. Hanya untuk
 * penolakan oleh sistem; keputusan admin dijawab dengan mengubah isi.
 */
rutaKampanye.post(
  '/:id/banding',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const k = kampanyeBelumBayar(req)
    const m = bacaModerasi(k)
    if (m.status !== 'ditolak') throw galat409('Banding hanya untuk kampanye yang ditolak pemeriksaan.')
    if (m.keputusanAdmin) {
      throw galat409('Kampanye ini sudah diputus admin. Ubah isinya lalu periksa ulang.')
    }
    const alasan = pastikanTeks(req.body?.alasan, 'Alasan banding', { min: 10, maks: 500 })
    const { status: _s, ...sisa } = m
    db.prepare("UPDATE kampanye SET moderasi_status = 'tinjau', moderasi_hasil = ? WHERE id = ?").run(
      JSON.stringify({ ...sisa, banding: alasan }),
      k.id,
    )
    const admin = db.prepare("SELECT id FROM pengguna WHERE peran = 'admin'").all()
    for (const a of admin) {
      kirimNotifikasi(a.id, {
        jenis: 'kampanye',
        judul: 'Banding pemeriksaan kampanye',
        isi: `"${k.nama}" mengajukan banding: ${alasan.slice(0, 120)}`,
        tautan: '/admin',
      })
    }
    res.json({ pesan: 'Banding terkirim. Tim LokalBoost akan meninjau kampanye Anda.', moderasi: bacaModerasi(ambil(k.id)) })
  }),
)

/** GET /api/kampanye/:id */
rutaKampanye.get(
  '/:id',
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')

    const hasil = bentukKampanye(k)

    // Kreator yang login melihat status lamarannya sendiri di kampanye ini,
    // dan status reward-nya bila sudah diterima.
    if (req.pengguna?.peran === 'kreator') {
      hasil.kelayakanSaya = kelayakanKreatorIkut(req.pengguna.id)
      hasil.lamaranSaya =
        db
          .prepare("SELECT status, jenis, pesan, dibuat_pada FROM lamaran WHERE kampanye_id = ? AND kreator_id = ? AND (jenis = 'undangan' OR status = 'disetujui')")
          .get(k.id, req.pengguna.id) || null
      hasil.rewardSaya = statusReward(k.id, req.pengguna.id)
    }
    res.json({ kampanye: hasil })
  }),
)

// =====================================================================
//  Lamaran & pemilihan kreator
// =====================================================================

/** Jalur pengajuan diri ditutup. Kreator bergabung melalui undangan UMKM. */
rutaKampanye.post(
  '/:id/lamaran',
  wajibPeran('kreator'),
  bungkus(() => {
    throw galat409('Kreator tidak mengajukan diri. UMKM memilih dan mengundang kreator ke kampanye.')
  }),
)

/** POST /api/kampanye/:id/undang — UMKM mengundang kreator secara langsung. */
rutaKampanye.post(
  '/:id/undang',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id) throw galat403()
    if (!sisaKampanye(k).menerima) throw galat409('Kampanye ini sudah melewati tenggat atau tidak memiliki reward tersisa.')

    const { kreatorId } = wajibAda(req.body, ['kreatorId'])
    const kreator = db.prepare("SELECT * FROM pengguna WHERE id = ? AND peran = 'kreator'").get(kreatorId)
    if (!kreator) throw galat404('Kreator tidak ditemukan.')
    pastikanLayakKreatorIkut(kreatorId)

    // Mengundang ulang peserta akan mengembalikan lamarannya ke 'menunggu' dan
    // memutus buku besar reward-nya dari kampanye.
    if (adalahPeserta(k.id, kreatorId)) throw galat409('Kreator ini sudah bergabung di kampanye.')

    const profil = db.prepare('SELECT * FROM profil_kreator WHERE pengguna_id = ?').get(kreatorId)
    const skor = profil ? skorKecocokan(k, profil).skor : null

    db.prepare(
      `INSERT INTO lamaran (kampanye_id, kreator_id, jenis, pesan, skor_kecocokan)
       VALUES (?, ?, 'undangan', ?, ?)
       ON CONFLICT(kampanye_id, kreator_id) DO UPDATE SET
         jenis = 'undangan', pesan = excluded.pesan, status = 'menunggu'`,
    ).run(k.id, kreatorId, req.body?.pesan || null, skor)

    // Undangan langsung adalah sinyal terkuat: UMKM memilih kreator ini
    // tanpa menunggu siapa pun melamar.
    catatPilihan(k.id, kreatorId, 'diundang')

    kirimNotifikasi(kreatorId, {
      jenis: 'approval',
      judul: 'Anda diundang ke sebuah kampanye',
      isi: `${bentukKampanye(k, { ringkas: true }).umkm} mengundang Anda untuk "${k.nama}".`,
      tautan: `/kampanye/${k.id}`,
    })

    res.status(201).json({ pesan: 'Undangan terkirim ke kreator.', kecocokan: skor })
  }),
)

/** GET /api/kampanye/:id/lamaran — daftar pelamar beserta skor AI. */
rutaKampanye.get(
  '/:id/lamaran',
  wajibLogin,
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (req.pengguna.peran === 'umkm' && k.umkm_id !== req.pengguna.id) throw galat403()

    // Kreator hanya boleh melihat lamarannya sendiri — daftar pesaing adalah
    // urusan pemilik usaha, bukan konsumsi publik.
    const filterKreator = req.pengguna.peran === 'kreator' ? 'AND l.kreator_id = ?' : ''
    const filterUndangan = ['umkm', 'kreator'].includes(req.pengguna.peran) ? "AND (l.jenis = 'undangan' OR l.status = 'disetujui')" : ''
    const argumen = req.pengguna.peran === 'kreator' ? [k.id, req.pengguna.id] : [k.id]

    const daftar = db
      .prepare(
        `SELECT l.*, p.nama, p.contoh, pk.niche, pk.lokasi, pk.pengikut, pk.gradasi, pk.foto, pk.terverifikasi
         FROM lamaran l
         JOIN pengguna p ON p.id = l.kreator_id
         LEFT JOIN profil_kreator pk ON pk.pengguna_id = l.kreator_id
         WHERE l.kampanye_id = ? ${filterKreator} ${filterUndangan}
         ORDER BY l.skor_kecocokan DESC, l.id`,
      )
      .all(...argumen)

    res.json({
      lamaran: daftar.map((l) => ({
        id: l.id,
        kreatorId: l.kreator_id,
        nama: l.nama,
        niche: l.niche,
        lokasi: l.lokasi,
        pengikut: l.pengikut,
        gradasi: l.gradasi,
        foto: l.foto || null,
        terverifikasi: Boolean(l.terverifikasi),
        contoh: Boolean(l.contoh),
        jenis: l.jenis,
        pesan: l.pesan,
        status: l.status,
        kecocokan: l.skor_kecocokan,
        dibuatPada: l.dibuat_pada,
      })),
    })
  }),
)

/** POST /api/kampanye/:id/lamaran/:lamaranId/setujui */
rutaKampanye.post(
  '/:id/lamaran/:lamaranId/setujui',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id) throw galat403()

    const lamaran = db
      .prepare('SELECT * FROM lamaran WHERE id = ? AND kampanye_id = ?')
      .get(req.params.lamaranId, k.id)
    if (!lamaran) throw galat404('Lamaran tidak ditemukan.')
    if (lamaran.jenis !== 'undangan') throw galat409('Hanya undangan UMKM yang bisa diputuskan.')
    if (lamaran.status === 'disetujui') throw galat409('Kreator ini sudah bergabung di kampanye.')
    pastikanLayakKreatorIkut(lamaran.kreator_id)
    // Kampanye yang sudah terbit hanya menerima kreator selama anggarannya ada.
    if (['berjalan', 'selesai'].includes(k.status) && !sisaKampanye(k).menerima) {
      throw galat409('Anggaran kampanye sudah habis. Kreator baru tidak bisa dibayar.')
    }

    transaksional(() => {
      db.prepare("UPDATE lamaran SET status = 'disetujui' WHERE id = ?").run(lamaran.id)
      // Satu kampanye boleh banyak kreator: pelamar lain TIDAK ditolak otomatis.
      // kampanye.kreator_id tetap diisi kreator pertama untuk data lama.
      const statusBaru = k.status === 'terbuka' || k.status === 'mencari_kreator' ? 'berjalan' : k.status
      db.prepare('UPDATE kampanye SET kreator_id = COALESCE(kreator_id, ?), status = ? WHERE id = ?').run(
        lamaran.kreator_id,
        statusBaru,
        k.id,
      )
    })()

    // Peringkat dicatat sebelum notifikasi, selagi keadaan kandidat masih
    // sama persis dengan yang dilihat UMKM saat memutuskan.
    catatPilihan(k.id, lamaran.kreator_id, 'disetujui')

    kirimNotifikasi(lamaran.kreator_id, {
      jenis: 'approval',
      judul: 'Lamaran Anda disetujui',
      isi: `Anda terpilih untuk kampanye "${k.nama}". Buat kontennya, unggah di akun Anda, lalu setor tautan videonya.`,
      tautan: `/kampanye/${k.id}`,
      email: true,
    })

    res.json({ pesan: 'Kreator disetujui dan bergabung di kampanye.', kampanye: bentukKampanye(ambil(k.id)) })
  }),
)

/** POST /api/kampanye/:id/lamaran/:lamaranId/tolak */
rutaKampanye.post(
  '/:id/lamaran/:lamaranId/tolak',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id) throw galat403()

    const lamaran = db
      .prepare('SELECT * FROM lamaran WHERE id = ? AND kampanye_id = ?')
      .get(req.params.lamaranId, k.id)
    if (!lamaran) throw galat404('Lamaran tidak ditemukan.')
    if (lamaran.jenis !== 'undangan') throw galat409('Hanya undangan UMKM yang bisa diputuskan.')
    // Peserta yang sudah bekerja tidak bisa "ditolak": views dan reward-nya
    // tercatat di baris ini. Keberatan atas kontennya lewat Pusat Sengketa.
    if (lamaran.status === 'disetujui') {
      throw galat409('Kreator ini sudah bergabung. Ajukan sengketa bila ada masalah dengan kontennya.')
    }

    db.prepare("UPDATE lamaran SET status = 'ditolak' WHERE id = ?").run(lamaran.id)
    kirimNotifikasi(lamaran.kreator_id, {
      jenis: 'approval',
      judul: 'Lamaran belum berjodoh',
      isi: `Pemilik usaha memilih kreator lain untuk "${k.nama}". Masih banyak kampanye lain yang cocok untukmu.`,
      tautan: '/marketplace',
      email: true,
    })
    res.json({ pesan: 'Lamaran ditolak.' })
  }),
)

/** GET /api/kampanye/:id/rekomendasi-kreator — AI Smart Matchmaker. */
rutaKampanye.get(
  '/:id/rekomendasi-kreator',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id) throw galat403()
    res.json({ rekomendasi: rekomendasiKreator(k.id, { batas: Number(req.query.batas) || 10 }) })
  }),
)

// =====================================================================
//  Laporan hasil & penyelesaian
// =====================================================================

/** GET /api/kampanye/:id/laporan — Dasbor Laporan Hasil. */
rutaKampanye.get(
  '/:id/laporan',
  wajibLogin,
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    const boleh = terlibatKampanye(k, req.pengguna.id) || req.pengguna.peran === 'admin'
    if (!boleh) throw galat403('Laporan hanya bisa dilihat pemilik usaha dan kreator kampanye ini.')

    res.json({ laporan: statistikKampanye(k.id) })
  }),
)

/** GET /api/kampanye/:id/ringkasan-ai — AI Auto-Report Summary. */
rutaKampanye.get(
  '/:id/ringkasan-ai',
  wajibLogin,
  bungkus(async (req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    const boleh = terlibatKampanye(k, req.pengguna.id) || req.pengguna.peran === 'admin'
    if (!boleh) throw galat403()

    const stat = statistikKampanye(k.id)
    const ringkasan = await ringkasLaporan(k, stat)
    res.json({ ringkasan, statistik: stat })
  }),
)

/** GET /api/kampanye/:id/anti-fraud — rincian penyaringan tayangan. */
rutaKampanye.get(
  '/:id/anti-fraud',
  wajibLogin,
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    const boleh = terlibatKampanye(k, req.pengguna.id) || req.pengguna.peran === 'admin'
    if (!boleh) throw galat403()
    res.json({ antiFraud: laporanAntiFraud(k.id), anomali: deteksiAnomali(k.id, { terapkan: false }) })
  }),
)

/** POST /api/kampanye/:id/audit-fraud — jalankan deteksi anomali lapis 2. */
rutaKampanye.post(
  '/:id/audit-fraud',
  wajibLogin,
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id && req.pengguna.peran !== 'admin') throw galat403()

    const hasil = deteksiAnomali(k.id, { terapkan: true })
    if (hasil.tayanganDisaring > 0) {
      kirimNotifikasi(k.umkm_id, {
        jenis: 'ai',
        judul: 'Verifikasi AI Anti-Fraud selesai',
        isi: `${hasil.tayanganDisaring} tayangan terindikasi tidak wajar telah disaring dari "${k.nama}".`,
        tautan: `/umkm/kampanye/${k.id}/laporan`,
      })
    }
    res.json({ pesan: 'Audit anti-fraud selesai.', ...hasil })
  }),
)

/** POST /api/kampanye/:id/selesai — tutup kampanye lebih awal. */
rutaKampanye.post(
  '/:id/selesai',
  wajibPeran('umkm', 'admin'),
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id && req.pengguna.peran !== 'admin') throw galat403()

    // Pastikan tayangan terbaru sudah diperhitungkan sebelum dana ditutup.
    prosesPembayaran(k.id)
    const segar = ambil(k.id)
    if (segar.status === 'selesai') {
      return res.json({ pesan: 'Kampanye sudah selesai dan dana sudah diselesaikan.' })
    }

    const hasil = selesaikanKampanye(k.id, { alasan: req.body?.alasan || 'Ditutup oleh pemilik usaha' })
    res.json({ pesan: 'Kampanye ditutup dan dana diselesaikan.', ...hasil })
  }),
)

// =====================================================================
//  Reward: peserta, pencairan berbasis views, klaim produk
// =====================================================================

/** GET /api/kampanye/:id/peserta — kreator yang bergabung + views & reward (UMKM/admin). */
rutaKampanye.get(
  '/:id/peserta',
  wajibLogin,
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (k.umkm_id !== req.pengguna.id && req.pengguna.peran !== 'admin') throw galat403()
    res.json({ peserta: ringkasPeserta(k), klaim: klaimKampanye(k.id), sisa: sisaKampanye(k) })
  }),
)

/** GET /api/kampanye/:id/reward-saya — status reward kreator yang login. */
rutaKampanye.get(
  '/:id/reward-saya',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    const reward = statusReward(k.id, req.pengguna.id)
    if (!reward) throw galat403('Anda belum diterima di kampanye ini.')
    res.json({ reward })
  }),
)

/**
 * POST /api/kampanye/:id/cairkan — kreator mencairkan reward uang yang sudah
 * menjadi haknya setelah mencapai target views minimal. Views terbaru
 * dihitung dulu, baru diputuskan berapa yang boleh cair.
 */
rutaKampanye.post(
  '/:id/cairkan',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    if (!adalahPeserta(k.id, req.pengguna.id)) throw galat403('Anda belum diterima di kampanye ini.')
    if (k.status === 'berjalan') prosesPembayaran(k.id)
    const hasil = cairkanReward(k.id, req.pengguna.id)
    res.json({
      pesan: `Reward ${hasil.nominal.toLocaleString('id-ID')} rupiah masuk ke saldo siap tarik.`,
      ...hasil,
      reward: statusReward(k.id, req.pengguna.id),
    })
  }),
)

/** POST /api/kampanye/:id/klaim-produk  Body: { produkId, alamat } */
rutaKampanye.post(
  '/:id/klaim-produk',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const k = ambil(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    const b = wajibAda(req.body, ['produkId', 'alamat'])
    const hasil = klaimProduk({ kampanyeId: k.id, kreatorId: req.pengguna.id, produkId: b.produkId, alamat: b.alamat })
    res.status(201).json({
      pesan: 'Klaim produk tercatat. Pemilik usaha akan mengirim produknya.',
      klaim: hasil,
      reward: statusReward(k.id, req.pengguna.id),
    })
  }),
)

/** POST /api/kampanye/:id/klaim/:klaimId/kirim  Body: { resi? } — UMKM. */
rutaKampanye.post(
  '/:id/klaim/:klaimId/kirim',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    tandaiProdukDikirim({ klaimId: Number(req.params.klaimId), umkmId: req.pengguna.id, resi: req.body?.resi })
    res.json({ pesan: 'Produk ditandai sudah dikirim.', klaim: klaimKampanye(req.params.id) })
  }),
)

/** POST /api/kampanye/:id/klaim/:klaimId/diterima — kreator. */
rutaKampanye.post(
  '/:id/klaim/:klaimId/diterima',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    tandaiProdukDiterima({ klaimId: Number(req.params.klaimId), kreatorId: req.pengguna.id })
    res.json({ pesan: 'Terima kasih, produk ditandai sudah diterima.', reward: statusReward(req.params.id, req.pengguna.id) })
  }),
)
