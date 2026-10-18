import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { db, transaksional } from '../lib/db.js'
import { buatToken, cekSandi, hashSandi, wajibLogin } from '../lib/auth.js'
import { config } from '../config.js'
import { bungkus, buatId, galat400, galat401, galat403, galat404, galat409, wajibAda } from '../lib/util.js'
import { surelAktif, tampakEmail } from '../services/surel.js'
import { kirimNotifikasi } from '../services/notifikasi.js'
import { TUJUAN, terbitkanOtp, verifikasiOtp } from '../services/otp.js'
import { uraiTautanProfil } from '../services/profil-sosial.js'
import { akunSosialKreator, akunSosialPengguna, bakukanTautanProfil, periksaAkunSosial, terapkanAkunSosial } from '../services/akun-sosial.js'
import { hapusFoto, simpanFoto } from '../lib/penyimpanan-video.js'
import { emailSah, pastikanTeks, pastikanTelepon, rapikanTelepon } from '../lib/validasi.js'
import { periksaTeksPublik } from '../services/moderasi-kampanye.js'

export const rutaAuth = Router()

/**
 * Samakan bentuk identitas sebelum menyimpan maupun mencari.
 *
 * Tanpa ini "Budi@Mail.com" dan "budi@mail.com" menjadi dua akun berbeda,
 * karena pencarian identitas memakai pencocokan persis. Nomor HP dibakukan
 * ke bentuk 08xx dengan alasan yang sama: "+62 812..." dan "0812..." harus
 * menemukan akun yang sama.
 */
function rapikanIdentitas(nilai) {
  const teks = String(nilai ?? '').trim()
  if (!teks) return ''
  return teks.includes('@') ? teks.toLowerCase() : rapikanTelepon(teks)
}

/** Bentuk pengguna yang aman dikirim ke klien (tanpa hash kata sandi). */
export function bentukPengguna(pengguna) {
  if (!pengguna) return null
  const dasar = {
    id: pengguna.id,
    peran: pengguna.peran,
    nama: pengguna.nama,
    email: pengguna.email,
    telepon: pengguna.telepon,
    terverifikasi: Boolean(pengguna.terverifikasi),
    dibuatPada: pengguna.dibuat_pada,
  }
  if (pengguna.peran === 'umkm') {
    dasar.profil = db.prepare('SELECT * FROM profil_umkm WHERE pengguna_id = ?').get(pengguna.id) || null
    dasar.sosial = akunSosialPengguna(pengguna.id)
  } else if (pengguna.peran === 'kreator') {
    const profil = db.prepare('SELECT * FROM profil_kreator WHERE pengguna_id = ?').get(pengguna.id) || null
    if (profil) {
      const r = db
        .prepare('SELECT AVG(bintang) AS rerata, COUNT(*) AS jumlah FROM ulasan WHERE dinilai_id = ?')
        .get(pengguna.id)
      profil.rating = r.jumlah ? Number(r.rerata.toFixed(2)) : null
      profil.jumlahUlasan = r.jumlah
    }
    dasar.profil = profil
    dasar.sosial = akunSosialKreator(pengguna.id, profil)
  }
  return dasar
}

function cariPenggunaLewatIdentitas(identitas) {
  return db.prepare('SELECT * FROM pengguna WHERE email = ? OR telepon = ?').get(identitas, identitas)
}

/** Kalimat yang jujur soal ke mana kode itu benar-benar pergi. */
function pesanTujuanOtp(identitas) {
  if (surelAktif() && tampakEmail(identitas)) return `Kode verifikasi dikirim ke ${identitas}. Cek inbox (atau folder spam).`
  return `Kode verifikasi dikirim ke ${identitas}.`
}

/**
 * POST /api/auth/daftar
 * Langkah 1 pendaftaran: pilih peran + data akun dasar. Profil usaha/konten
 * dilengkapi lewat PUT /api/auth/profil (langkah 2), sesuai alur PRD §7.
 */
rutaAuth.post(
  '/daftar',
  bungkus((req, res) => {
    const { peran, kataSandi } = req.body || {}
    wajibAda(req.body, ['peran', 'nama', 'kataSandi'])

    if (!['umkm', 'kreator'].includes(peran)) {
      throw galat400('Peran harus "umkm" atau "kreator".')
    }
    const nama = pastikanTeks(req.body.nama, 'Nama', { min: 2, maks: 60 })
    const email = String(req.body?.email ?? '').trim().toLowerCase() || null
    const telepon = String(req.body?.telepon ?? '').trim() ? pastikanTelepon(req.body.telepon) : null

    // Email wajib, nomor HP tidak bisa menggantikannya.
    //
    // Backend ini tidak punya penyedia SMS — untuk nomor HP, kode verifikasi
    // hanya bisa dicetak ke log server. Dulu itu tidak fatal karena akun yang
    // belum terverifikasi masih boleh masuk. Sejak verifikasi diwajibkan,
    // mendaftar dengan nomor HP berarti akun yang terkunci selamanya. Lebih
    // jujur menutup pintunya daripada membiarkannya terlihat terbuka.
    // Nomor HP tetap boleh diisi, tapi sebagai kontak, bukan identitas masuk.
    if (!email) {
      throw galat400('Alamat email wajib diisi — kode verifikasi dikirim ke sana.')
    }
    if (!emailSah(email)) {
      throw galat400('Format email tidak valid. Contoh yang benar: nama@email.com')
    }
    if (String(kataSandi).length < 6) {
      throw galat400('Kata sandi minimal 6 karakter.')
    }
    const identitas = email || telepon
    const lama = cariPenggunaLewatIdentitas(identitas)

    // Pencarian di atas memakai email, jadi nomor HP yang sudah dipakai akun
    // LAIN tidak pernah tertangkap di sini dan baru meledak sebagai pelanggaran
    // UNIQUE di database. Pesannya lalu keluar sebagai "Data serupa sudah ada",
    // yang tidak memberi tahu pendaftar field mana yang bentrok. Diperiksa
    // lebih awal supaya pesannya menyebut penyebabnya.
    if (telepon) {
      const pemilikTelepon = db
        .prepare('SELECT id FROM pengguna WHERE telepon = ?')
        .get(telepon)
      if (pemilikTelepon && pemilikTelepon.id !== lama?.id) {
        throw galat409(
          'Nomor HP tersebut sudah dipakai akun lain. Pakai nomor lain, atau kosongkan karena nomor HP tidak wajib.',
        )
      }
    }

    // Akun yang sudah terverifikasi tidak boleh ditimpa — itu jalan masuk
    // untuk mengambil alih akun orang lain hanya dengan tahu emailnya.
    if (lama && lama.terverifikasi) {
      throw galat409(
        email
          ? 'Email tersebut sudah terdaftar dan terverifikasi. Silakan masuk.'
          : 'Nomor HP tersebut sudah terdaftar dan terverifikasi. Silakan masuk.',
      )
    }

    // Tapi kalau pendaftaran sebelumnya berhenti sebelum verifikasi, akun itu
    // belum jadi milik siapa-siapa. Menolaknya hanya membuat pengguna
    // terkunci: mendaftar ditolak, padahal ia juga belum pernah bisa masuk.
    // Jadi datanya diperbarui dan kode verifikasi baru diterbitkan.
    if (lama) {
      transaksional(() => {
        db.prepare('UPDATE pengguna SET peran = ?, nama = ?, kata_sandi_hash = ? WHERE id = ?').run(
          peran,
          nama,
          hashSandi(String(kataSandi)),
          lama.id,
        )
        // Peran boleh berubah saat mendaftar ulang; baris profil lama dibuang
        // supaya tidak ada sisa data dari peran yang batal dipilih.
        if (peran === 'umkm') {
          db.prepare('DELETE FROM profil_kreator WHERE pengguna_id = ?').run(lama.id)
          db.prepare(
            'INSERT INTO profil_umkm (pengguna_id, nama_usaha) VALUES (?, ?) ON CONFLICT(pengguna_id) DO UPDATE SET nama_usaha = excluded.nama_usaha',
          ).run(lama.id, nama)
        } else {
          db.prepare('DELETE FROM profil_umkm WHERE pengguna_id = ?').run(lama.id)
          db.prepare(
            'INSERT INTO profil_kreator (pengguna_id) VALUES (?) ON CONFLICT(pengguna_id) DO NOTHING',
          ).run(lama.id)
        }
      })()

      const kodeUlang = terbitkanOtp(identitas, { paksa: true })
      const penggunaLama = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(lama.id)

      return res.status(200).json({
        pesan: pesanTujuanOtp(identitas),
        pengguna: bentukPengguna(penggunaLama),
        identitas,
        ...(config.bocorkanOtp ? { kodeOtp: kodeUlang } : {}),
      })
    }

    const id = buatId(peran === 'umkm' ? 'umkm' : 'krtr')

    transaksional(() => {
      db.prepare(
        `INSERT INTO pengguna (id, peran, nama, email, telepon, kata_sandi_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, peran, nama, email || null, telepon || null, hashSandi(String(kataSandi)))

      db.prepare('INSERT INTO dompet (pengguna_id) VALUES (?)').run(id)

      // Baris profil dibuat kosong supaya langkah 2 tinggal memperbarui.
      if (peran === 'umkm') {
        db.prepare('INSERT INTO profil_umkm (pengguna_id, nama_usaha) VALUES (?, ?)').run(id, nama)
      } else {
        db.prepare('INSERT INTO profil_kreator (pengguna_id) VALUES (?)').run(id)
      }
    })()

    const kode = terbitkanOtp(identitas, { paksa: true })
    const pengguna = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(id)

    res.status(201).json({
      pesan: pesanTujuanOtp(identitas),
      pengguna: bentukPengguna(pengguna),
      identitas,
      ...(config.bocorkanOtp ? { kodeOtp: kode } : {}),
    })
  }),
)

/**
 * POST /api/auth/otp/kirim — kirim ulang kode.
 *
 * Jawabannya sengaja sama persis untuk akun yang ada maupun tidak. Versi
 * sebelumnya menjawab 404 "belum ada akun dengan email itu", yang ramah tapi
 * juga membuat siapa pun bisa memetakan email mana yang punya akun di sini —
 * bertolak belakang dengan kehati-hatian yang sudah dipakai di /masuk.
 * Pengguna yang salah alamat tetap terbantu: tautan "Daftar gratis" ada tepat
 * di bawah formulirnya.
 */
rutaAuth.post(
  '/otp/kirim',
  bungkus((req, res) => {
    wajibAda(req.body, ['identitas'])
    const identitas = rapikanIdentitas(req.body.identitas)

    const pesanNetral = `Kalau ${identitas} terdaftar, kode verifikasi sudah kami kirim ke sana.`
    if (!cariPenggunaLewatIdentitas(identitas)) return res.json({ pesan: pesanNetral })

    const kode = terbitkanOtp(identitas)
    res.json({
      pesan: pesanNetral,
      ...(config.bocorkanOtp ? { kodeOtp: kode } : {}),
    })
  }),
)

/**
 * POST /api/auth/otp/verifikasi — verifikasi akun dan langsung dapat token.
 *
 * Seluruh pagarnya (kedaluwarsa, batas 5 tebakan, penghangusan kode) ada di
 * services/otp.js supaya jalur penarikan dana dan pemulihan kata sandi
 * memakai aturan yang sama persis.
 */
rutaAuth.post(
  '/otp/verifikasi',
  bungkus((req, res) => {
    const { kode } = wajibAda(req.body, ['identitas', 'kode'])
    const identitas = rapikanIdentitas(req.body.identitas)

    verifikasiOtp(identitas, kode, { tujuan: TUJUAN.VERIFIKASI })

    db.prepare('UPDATE pengguna SET terverifikasi = 1 WHERE email = ? OR telepon = ?').run(
      identitas,
      identitas,
    )

    const pengguna = cariPenggunaLewatIdentitas(identitas)

    // Lonceng yang kosong pada kunjungan pertama membuat fitur notifikasi
    // tampak mati. Sambutan ini sekaligus bukti bahwa jalurnya bekerja.
    kirimNotifikasi(pengguna.id, {
      jenis: 'kampanye',
      judul: 'Akun kamu sudah terverifikasi',
      isi:
        pengguna.peran === 'umkm'
          ? 'Selamat datang di LokalBoost. Lengkapi profil usaha, lalu buat kampanye pertamamu.'
          : 'Selamat datang di LokalBoost. Lengkapi profil kreator, lalu lamar kampanye yang cocok denganmu.',
      tautan: pengguna.peran === 'umkm' ? '/umkm' : '/kreator',
    })

    res.json({ pesan: 'Akun berhasil diverifikasi.', token: buatToken(pengguna), pengguna: bentukPengguna(pengguna) })
  }),
)

/** POST /api/auth/masuk */
rutaAuth.post(
  '/masuk',
  bungkus((req, res) => {
    const { kataSandi } = wajibAda(req.body, ['identitas', 'kataSandi'])
    const identitas = rapikanIdentitas(req.body.identitas)

    const pengguna = cariPenggunaLewatIdentitas(identitas)
    if (!pengguna || !cekSandi(String(kataSandi), pengguna.kata_sandi_hash)) {
      // Pesan sengaja sama untuk akun tidak ada maupun sandi salah,
      // supaya tidak bisa dipakai menebak email mana yang terdaftar.
      throw galat401('Email/nomor HP atau kata sandi salah.')
    }

    // Inilah yang membuat verifikasi email berarti sesuatu. Tanpa pemeriksaan
    // ini seluruh alur OTP hanya jadi layar tambahan yang bisa dilewati begitu
    // saja dengan langsung membuka halaman Masuk.
    if (!pengguna.terverifikasi) {
      // Jangan tinggalkan pengguna di jalan buntu: terbitkan kode baru supaya
      // frontend bisa langsung membawanya ke layar verifikasi. Kalau jeda
      // kirimnya belum lewat, kode sebelumnya masih hidup dan tetap berlaku.
      let kode = null
      try {
        kode = terbitkanOtp(identitas)
      } catch {
        /* jeda/kuota kirim sedang berlaku — kode lama masih bisa dipakai */
      }
      throw galat403(`Akun ${identitas} belum diverifikasi. Masukkan kode verifikasi dulu.`, {
        perluVerifikasi: true,
        identitas,
        ...(config.bocorkanOtp && kode ? { kodeOtp: kode } : {}),
      })
    }

    res.json({ token: buatToken(pengguna), pengguna: bentukPengguna(pengguna) })
  }),
)

/** GET /api/auth/saya */
rutaAuth.get(
  '/saya',
  wajibLogin,
  bungkus((req, res) => {
    res.json({ pengguna: bentukPengguna(req.pengguna) })
  }),
)

/**
 * PUT /api/auth/profil
 * Langkah 2 pendaftaran, sekaligus dipakai untuk menyunting profil kapan pun.
 * Field yang tidak dikirim tidak diubah.
 */
rutaAuth.put(
  '/profil',
  wajibLogin,
  bungkus(async (req, res) => {
    const { pengguna } = req
    const b = { ...(req.body || {}) }

    // Setiap field hanya diperiksa bila dikirim: PUT ini juga dipakai untuk
    // menyunting satu field saja.
    const ada = (k) => b[k] !== undefined && b[k] !== null
    if (ada('nama')) b.nama = pastikanTeks(b.nama, 'Nama', { min: 2, maks: 60 })
    if (ada('namaUsaha')) b.namaUsaha = pastikanTeks(b.namaUsaha, 'Nama usaha', { min: 2, maks: 80 })
    if (ada('lokasi')) b.lokasi = pastikanTeks(b.lokasi, 'Lokasi', { min: 3, maks: 60 })
    for (const [k, label, maks] of [
      ['targetAudiens', 'Target pembeli', 200],
      ['deskripsi', 'Deskripsi', 1000],
      ['bio', 'Gaya konten', 300],
    ]) {
      if (ada(k)) b[k] = String(b[k]).trim() ? pastikanTeks(b[k], label, { min: 3, maks, wajibHuruf: true }) : null
    }
    if (ada('portofolioUrl')) {
      b.portofolioUrl = String(b.portofolioUrl).trim() ? bakukanTautanProfil(b.portofolioUrl) : null
    }
    // Akun sosial diperiksa sebelum apa pun ditulis: satu kolom salah tidak
    // boleh meninggalkan nama tersimpan tapi tautannya tidak.
    const sosial = ada('sosial') ? periksaAkunSosial(b.sosial) : null

    // Bio kreator dan deskripsi usaha tampil publik. Diperiksa hanya bila
    // berubah, dan sebelum apa pun ditulis supaya penolakan tidak menyisakan
    // setengah profil.
    const tandaiEtika = []
    {
      const kolom = pengguna.peran === 'kreator' ? 'bio' : pengguna.peran === 'umkm' ? 'deskripsi' : null
      const lama = kolom
        ? db
            .prepare(`SELECT ${kolom} AS teks FROM ${pengguna.peran === 'kreator' ? 'profil_kreator' : 'profil_umkm'} WHERE pengguna_id = ?`)
            .get(pengguna.id)?.teks
        : null
      if (kolom && b[kolom] && b[kolom] !== lama) {
        const periksa = await periksaTeksPublik({ jenis: 'profil', penggunaId: pengguna.id, teks: b[kolom] })
        tandaiEtika.push(() => periksa.tandai(pengguna.id, pengguna.peran === 'kreator' ? 'bio_kreator' : 'deskripsi_umkm'))
      }
    }

    // Jumlah pengikut sengaja diabaikan: angkanya hanya boleh berasal dari
    // pengukuran Cek Profil, bukan ketikan kreator (cegah klaim palsu ke UMKM).
    delete b.pengikut

    if (b.nama) db.prepare('UPDATE pengguna SET nama = ? WHERE id = ?').run(b.nama, pengguna.id)

    if (pengguna.peran === 'umkm') {
      const kini = db.prepare('SELECT * FROM profil_umkm WHERE pengguna_id = ?').get(pengguna.id) || {}
      db.prepare(
        `INSERT INTO profil_umkm (pengguna_id, nama_usaha, kategori, lokasi, deskripsi, target_audiens, nib)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pengguna_id) DO UPDATE SET
           nama_usaha = excluded.nama_usaha, kategori = excluded.kategori,
           lokasi = excluded.lokasi, deskripsi = excluded.deskripsi,
           target_audiens = excluded.target_audiens, nib = excluded.nib`,
      ).run(
        pengguna.id,
        b.namaUsaha ?? kini.nama_usaha ?? b.nama ?? pengguna.nama,
        b.kategori ?? kini.kategori ?? null,
        b.lokasi ?? kini.lokasi ?? null,
        b.deskripsi ?? kini.deskripsi ?? null,
        b.targetAudiens ?? kini.target_audiens ?? null,
        b.nib ?? kini.nib ?? null,
      )
    } else if (pengguna.peran === 'kreator') {
      const kini = db.prepare('SELECT * FROM profil_kreator WHERE pengguna_id = ?').get(pengguna.id) || {}
      db.prepare(
        `INSERT INTO profil_kreator (pengguna_id, niche, lokasi, pengikut, bio, portofolio_url, gradasi)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pengguna_id) DO UPDATE SET
           niche = excluded.niche, lokasi = excluded.lokasi, pengikut = excluded.pengikut,
           bio = excluded.bio, portofolio_url = excluded.portofolio_url, gradasi = excluded.gradasi`,
      ).run(
        pengguna.id,
        b.niche ?? kini.niche ?? null,
        b.lokasi ?? kini.lokasi ?? null,
        b.pengikut !== undefined ? Number(b.pengikut) : (kini.pengikut ?? 0),
        b.bio ?? kini.bio ?? null,
        b.portofolioUrl ?? kini.portofolio_url ?? null,
        b.gradasi ?? kini.gradasi ?? null,
      )
    }

    if (sosial && pengguna.peran !== 'admin') {
      terapkanAkunSosial(pengguna.id, sosial)
      if (pengguna.peran === 'kreator') selaraskanTautanUtama(pengguna.id)
    }

    tandaiEtika.forEach((f) => f())

    const segar = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(pengguna.id)
    res.json({ pesan: 'Profil tersimpan.', pengguna: bentukPengguna(segar) })
  }),
)

/**
 * `portofolio_url` adalah tautan utama kreator (dipakai pencarian & kartu
 * kreator). Bila platformnya baru saja diganti atau dihapus lewat isian akun
 * sosial, tautan utama ikut: pilih isian platform yang sama, atau yang
 * pertama tersedia. Tanpa ini profil publik bisa memajang akun lama.
 */
function selaraskanTautanUtama(kreatorId) {
  const profil = db.prepare('SELECT portofolio_url FROM profil_kreator WHERE pengguna_id = ?').get(kreatorId)
  if (!profil) return
  const sosial = akunSosialPengguna(kreatorId)
  let platformUtama = null
  try {
    platformUtama = profil.portofolio_url ? uraiTautanProfil(profil.portofolio_url).platform : null
  } catch {
    platformUtama = null
  }
  const pengganti =
    (platformUtama && sosial[platformUtama]) || sosial.tiktok || sosial.instagram || sosial.youtube || null
  if (pengganti !== profil.portofolio_url) {
    db.prepare('UPDATE profil_kreator SET portofolio_url = ? WHERE pengguna_id = ?').run(pengganti, kreatorId)
  }
}

// ---------------------------------------------------------------------
//  Foto profil
// ---------------------------------------------------------------------

/**
 * Hanya JPG/PNG/WebP. SVG sengaja ditolak: SVG bisa memuat script, dan
 * berkasnya dilayani dari origin aplikasi (lihat catatan /unggahan di app.js).
 */
const JENIS_FOTO = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
export const BATAS_FOTO_MB = 2

export const unggahFoto = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(config.folderUnggahan, { recursive: true })
      cb(null, config.folderUnggahan)
    },
    // Ekstensi dari daftar putih (fileFilter), bukan dipercaya dari nama asli.
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase()
      cb(null, `${buatId('foto')}${ext === '.jpeg' ? '.jpg' : ext}`)
    },
  }),
  limits: { fileSize: BATAS_FOTO_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (!JENIS_FOTO[ext] || file.mimetype !== JENIS_FOTO[ext]) {
      return cb(galat400('Foto harus berupa JPG, PNG, atau WebP.'))
    }
    cb(null, true)
  },
})

/**
 * Nama dan mimetype datang dari klien, jadi beberapa byte pertama berkas
 * ikut diperiksa: berkas teks yang dinamai foto.png ditolak di sini.
 */
export function isiBerkasFotoSah(jalur) {
  const kepala = Buffer.alloc(12)
  const fd = fs.openSync(jalur, 'r')
  try {
    fs.readSync(fd, kepala, 0, 12, 0)
  } finally {
    fs.closeSync(fd)
  }
  const jpg = kepala[0] === 0xff && kepala[1] === 0xd8 && kepala[2] === 0xff
  const png = kepala.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const webp = kepala.toString('latin1', 0, 4) === 'RIFF' && kepala.toString('latin1', 8, 12) === 'WEBP'
  return jpg || png || webp
}

const TABEL_FOTO = { umkm: 'profil_umkm', kreator: 'profil_kreator' }

function fotoSekarang(pengguna) {
  const tabel = TABEL_FOTO[pengguna.peran]
  return db.prepare(`SELECT foto FROM ${tabel} WHERE pengguna_id = ?`).get(pengguna.id)?.foto || null
}

function pasangFoto(pengguna, foto) {
  const tabel = TABEL_FOTO[pengguna.peran]
  const ada = db.prepare(`SELECT 1 FROM ${tabel} WHERE pengguna_id = ?`).get(pengguna.id)
  if (ada) {
    db.prepare(`UPDATE ${tabel} SET foto = ? WHERE pengguna_id = ?`).run(foto, pengguna.id)
  } else if (pengguna.peran === 'umkm') {
    db.prepare('INSERT INTO profil_umkm (pengguna_id, nama_usaha, foto) VALUES (?, ?, ?)').run(pengguna.id, pengguna.nama, foto)
  } else {
    db.prepare('INSERT INTO profil_kreator (pengguna_id, foto) VALUES (?, ?)').run(pengguna.id, foto)
  }
}

async function buangFotoLama(tautan) {
  try {
    await hapusFoto(tautan, config.folderUnggahan)
  } catch (galat) {
    // Foto lama yang gagal dihapus tidak boleh membatalkan foto baru.
    console.warn(`[FOTO] Gagal menghapus foto lama: ${galat.message}`)
  }
}

const hanyaUmkmAtauKreator = (req, _res, next) =>
  TABEL_FOTO[req.pengguna.peran] ? next() : next(galat403('Hanya UMKM dan kreator yang punya foto profil.'))
const hanyaUmkm = (req, _res, next) =>
  req.pengguna.peran === 'umkm' ? next() : next(galat403('Galeri foto hanya tersedia untuk akun UMKM.'))

/** POST /api/auth/foto — unggah/ganti foto profil (multipart, kolom `foto`). */
rutaAuth.post(
  '/foto',
  wajibLogin,
  hanyaUmkmAtauKreator,
  (req, res, next) =>
    unggahFoto.single('foto')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(galat400(`Ukuran foto maksimal ${BATAS_FOTO_MB} MB.`))
      }
      next(err)
    }),
  bungkus(async (req, res) => {
    const berkas = req.file
    if (!berkas) throw galat400('Pilih foto yang akan diunggah.')
    if (!isiBerkasFotoSah(berkas.path)) {
      fs.rmSync(berkas.path, { force: true })
      throw galat400('Berkas itu bukan foto JPG, PNG, atau WebP yang sah.')
    }

    const lama = fotoSekarang(req.pengguna)
    const baru = await simpanFoto(berkas)
    pasangFoto(req.pengguna, baru)
    if (lama && lama !== baru) await buangFotoLama(lama)

    const segar = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(req.pengguna.id)
    res.json({ pesan: 'Foto profil diperbarui.', foto: baru, pengguna: bentukPengguna(segar) })
  }),
)

/** DELETE /api/auth/foto — kembali ke avatar inisial/gradien. */
rutaAuth.delete(
  '/foto',
  wajibLogin,
  hanyaUmkmAtauKreator,
  bungkus(async (req, res) => {
    const lama = fotoSekarang(req.pengguna)
    if (lama) {
      pasangFoto(req.pengguna, null)
      await buangFotoLama(lama)
    }
    const segar = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(req.pengguna.id)
    res.json({ pesan: 'Foto profil dihapus.', pengguna: bentukPengguna(segar) })
  }),
)

const MAKS_FOTO_GALERI_UMKM = 6

function daftarFotoGaleriUmkm(penggunaId) {
  return db
    .prepare('SELECT id, foto, dibuat_pada AS dibuatPada FROM profil_umkm_foto WHERE pengguna_id = ? ORDER BY dibuat_pada, id')
    .all(penggunaId)
}

/** GET /api/auth/galeri-foto — foto usaha yang tampil pada kampanye. */
rutaAuth.get(
  '/galeri-foto',
  wajibLogin,
  hanyaUmkm,
  bungkus((req, res) => res.json({ foto: daftarFotoGaleriUmkm(req.pengguna.id), batas: MAKS_FOTO_GALERI_UMKM })),
)

/** POST /api/auth/galeri-foto — tambah satu foto usaha. */
rutaAuth.post(
  '/galeri-foto',
  wajibLogin,
  hanyaUmkm,
  (req, res, next) =>
    unggahFoto.single('foto')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(galat400(`Ukuran foto maksimal ${BATAS_FOTO_MB} MB.`))
      }
      next(err)
    }),
  bungkus(async (req, res) => {
    const berkas = req.file
    if (!berkas) throw galat400('Pilih foto usaha yang akan ditambahkan.')
    if (!isiBerkasFotoSah(berkas.path)) {
      fs.rmSync(berkas.path, { force: true })
      throw galat400('Berkas itu bukan foto JPG, PNG, atau WebP yang sah.')
    }
    const jumlah = db.prepare('SELECT COUNT(*) AS jumlah FROM profil_umkm_foto WHERE pengguna_id = ?').get(req.pengguna.id).jumlah
    if (jumlah >= MAKS_FOTO_GALERI_UMKM) {
      fs.rmSync(berkas.path, { force: true })
      throw galat409(`Galeri usaha maksimal ${MAKS_FOTO_GALERI_UMKM} foto.`)
    }
    const foto = await simpanFoto(berkas)
    db.prepare('INSERT INTO profil_umkm_foto (id, pengguna_id, foto) VALUES (?, ?, ?)').run(
      buatId('usaha'),
      req.pengguna.id,
      foto,
    )
    res.status(201).json({ foto: daftarFotoGaleriUmkm(req.pengguna.id), batas: MAKS_FOTO_GALERI_UMKM })
  }),
)

/** DELETE /api/auth/galeri-foto/:id — hapus foto usaha milik sendiri. */
rutaAuth.delete(
  '/galeri-foto/:id',
  wajibLogin,
  hanyaUmkm,
  bungkus(async (req, res) => {
    const foto = db
      .prepare('SELECT id, foto FROM profil_umkm_foto WHERE id = ? AND pengguna_id = ?')
      .get(req.params.id, req.pengguna.id)
    if (!foto) throw galat404('Foto usaha tidak ditemukan.')
    db.prepare('DELETE FROM profil_umkm_foto WHERE id = ? AND pengguna_id = ?').run(foto.id, req.pengguna.id)
    await hapusFoto(foto.foto, config.folderUnggahan).catch((e) => console.warn(`[GALERI UMKM] Foto lama gagal dihapus: ${e.message}`))
    res.json({ foto: daftarFotoGaleriUmkm(req.pengguna.id), batas: MAKS_FOTO_GALERI_UMKM })
  }),
)

// ---------------------------------------------------------------------
//  Kata sandi
// ---------------------------------------------------------------------

/** Satu aturan panjang sandi untuk semua jalur — sama dengan /daftar. */
function pastikanSandiLayak(nilai) {
  if (String(nilai).length < 6) throw galat400('Kata sandi minimal 6 karakter.')
  return String(nilai)
}

/**
 * POST /api/auth/sandi/ubah — mengganti kata sandi sambil masuk.
 * Sandi lama tetap diminta walau tokennya sah: token bisa saja tertinggal di
 * perangkat yang dipinjam, dan mengganti sandi mengunci pemilik aslinya.
 */
rutaAuth.post(
  '/sandi/ubah',
  wajibLogin,
  bungkus((req, res) => {
    const { kataSandiLama, kataSandiBaru } = wajibAda(req.body, ['kataSandiLama', 'kataSandiBaru'])

    if (!cekSandi(String(kataSandiLama), req.pengguna.kata_sandi_hash)) {
      throw galat401('Kata sandi lama salah.')
    }
    const baru = pastikanSandiLayak(kataSandiBaru)
    if (cekSandi(baru, req.pengguna.kata_sandi_hash)) {
      throw galat400('Kata sandi baru harus berbeda dari yang lama.')
    }

    db.prepare('UPDATE pengguna SET kata_sandi_hash = ? WHERE id = ?').run(hashSandi(baru), req.pengguna.id)

    kirimNotifikasi(req.pengguna.id, {
      jenis: 'kampanye',
      judul: 'Kata sandi berhasil diganti',
      isi: 'Kata sandi akun LokalBoost kamu baru saja diubah. Kalau bukan kamu yang melakukannya, segera ganti lagi.',
      tautan: '/profil',
    })

    res.json({ pesan: 'Kata sandi berhasil diganti.' })
  }),
)

/**
 * POST /api/auth/sandi/lupa — minta kode untuk membuat sandi baru.
 *
 * Jawabannya sengaja sama persis untuk akun yang ada maupun tidak, sama
 * seperti /otp/kirim: halaman lupa-sandi adalah tempat termudah memetakan
 * email mana yang punya akun di sini kalau jawabannya dibedakan.
 */
rutaAuth.post(
  '/sandi/lupa',
  bungkus((req, res) => {
    wajibAda(req.body, ['identitas'])
    const identitas = rapikanIdentitas(req.body.identitas)

    const pesanNetral = `Kalau ${identitas} terdaftar, kode untuk mengganti kata sandi sudah kami kirim ke sana.`
    if (!cariPenggunaLewatIdentitas(identitas)) return res.json({ pesan: pesanNetral })

    const kode = terbitkanOtp(identitas, { tujuan: TUJUAN.RESET })
    res.json({ pesan: pesanNetral, ...(config.bocorkanOtp ? { kodeOtp: kode } : {}) })
  }),
)

/**
 * POST /api/auth/sandi/atur — tukar kode dengan kata sandi baru.
 *
 * Akunnya sekalian ditandai terverifikasi: pemiliknya baru saja membuktikan
 * memegang inbox itu, yang persis syarat yang sama dengan /otp/verifikasi.
 * Tanpa ini, akun yang berhenti sebelum verifikasi tetap tidak bisa masuk
 * walau sandinya sudah berhasil diganti.
 */
rutaAuth.post(
  '/sandi/atur',
  bungkus((req, res) => {
    const { kode, kataSandiBaru } = wajibAda(req.body, ['identitas', 'kode', 'kataSandiBaru'])
    const identitas = rapikanIdentitas(req.body.identitas)
    const baru = pastikanSandiLayak(kataSandiBaru)

    // Kode dicocokkan lebih dulu, sebelum keberadaan akun diperiksa: dengan
    // urutan sebaliknya, balasan "tidak ada kode aktif" vs "akun tidak
    // ditemukan" kembali membocorkan email mana yang terdaftar.
    verifikasiOtp(identitas, kode, { tujuan: TUJUAN.RESET })

    const pengguna = cariPenggunaLewatIdentitas(identitas)
    if (!pengguna) throw galat400('Tidak ada kode aktif untuk akun ini. Minta kode baru.')

    db.prepare('UPDATE pengguna SET kata_sandi_hash = ?, terverifikasi = 1 WHERE id = ?').run(
      hashSandi(baru),
      pengguna.id,
    )

    const segar = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(pengguna.id)
    res.json({
      pesan: 'Kata sandi baru tersimpan.',
      token: buatToken(segar),
      pengguna: bentukPengguna(segar),
    })
  }),
)
