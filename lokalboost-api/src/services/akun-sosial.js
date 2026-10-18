/**
 * Akun media sosial yang DIISI SENDIRI oleh pengguna (UMKM maupun kreator).
 *
 * Bedanya dengan Cek Profil (services/profil-sosial.js): di sini tidak ada
 * angka apa pun. Yang disimpan hanya tautan profil, supaya UMKM bisa
 * mengintip akun kreator dan kreator bisa mengenal toko UMKM-nya. Pengikut
 * dan views tetap hanya boleh datang dari pengukuran Cek Profil.
 *
 * Satu pengguna paling banyak satu akun per platform.
 */
import { db } from '../lib/db.js'
import { galat400 } from '../lib/util.js'
import { PLATFORM_PROFIL, uraiTautanProfil } from './profil-sosial.js'

const NAMA_PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }

const AWALAN_URL = {
  tiktok: (akun) => `https://www.tiktok.com/@${akun}`,
  instagram: (akun) => `https://www.instagram.com/${akun}`,
  youtube: (akun) => `https://www.youtube.com/@${akun}`,
}

/** Tautan profil apa pun -> bentuk baku. Melempar 400 bila tidak sah. */
export function bakukanTautanProfil(nilai) {
  const { platform, akun } = uraiTautanProfil(nilai)
  if (platform === 'youtube' && akun.startsWith('UC') && akun.length === 24) {
    return `https://www.youtube.com/channel/${akun}`
  }
  return AWALAN_URL[platform](akun)
}

/**
 * Isian satu kolom platform -> tautan baku, atau null bila dikosongkan.
 *
 * Orang lebih sering mengetik "@warungsunda" daripada menempel tautan, jadi
 * nama akun polos diterima dan dirakit jadi tautan platform kolom itu.
 * Tautan lengkap yang ternyata milik platform lain ditolak: tautan TikTok
 * yang ditempel di kolom Instagram hampir pasti salah tempel.
 */
export function bakukanAkunSosial(platform, masukan) {
  const teks = String(masukan ?? '').trim()
  if (!teks) return null
  const nama = NAMA_PLATFORM[platform]

  // Nama akun Instagram boleh bertitik ("warung.sunda"), jadi titik saja
  // bukan tanda tautan. Yang dianggap tautan: berskema atau menyebut host.
  const tampakTautan = /^https?:\/\//i.test(teks) || /(^|[./])(tiktok|instagram|youtube)\.com|youtu\.be/i.test(teks)
  const tautan = tampakTautan ? teks : AWALAN_URL[platform](teks.replace(/^@/, ''))

  let hasil
  try {
    hasil = uraiTautanProfil(tautan)
  } catch (galat) {
    throw galat400(`${nama}: ${galat.message}`)
  }
  if (hasil.platform !== platform) {
    throw galat400(`Kolom ${nama} berisi tautan ${NAMA_PLATFORM[hasil.platform]}. Pindahkan ke kolomnya.`)
  }
  return bakukanTautanProfil(tautan)
}

/** { tiktok, instagram, youtube } milik satu pengguna; platform kosong = null. */
export function akunSosialPengguna(penggunaId) {
  const hasil = Object.fromEntries(PLATFORM_PROFIL.map((p) => [p, null]))
  const baris = db.prepare('SELECT platform, url FROM akun_sosial WHERE pengguna_id = ?').all(penggunaId)
  for (const b of baris) hasil[b.platform] = b.url
  return hasil
}

/**
 * Akun sosial kreator. Kreator lama hanya punya `portofolio_url` dari
 * pendaftaran; tautan itu ditampilkan di kolom platformnya sampai kreator
 * menyimpan isian sendiri, supaya halaman profil tidak tampak kosong.
 */
export function akunSosialKreator(kreatorId, profil) {
  const sosial = akunSosialPengguna(kreatorId)
  const utama = profil?.portofolio_url
  if (utama) {
    try {
      const { platform } = uraiTautanProfil(utama)
      if (!sosial[platform]) sosial[platform] = utama
    } catch {
      // Tautan lama yang tidak lagi lolos aturan baru cukup tidak ditampilkan.
    }
  }
  return sosial
}

/**
 * Periksa isian { tiktok?, instagram?, youtube? } tanpa menulis apa pun.
 * Mengembalikan [[platform, url|null], ...] hanya untuk platform yang dikirim;
 * nilai kosong berarti akun platform itu dihapus.
 */
export function periksaAkunSosial(isian) {
  if (!isian || typeof isian !== 'object' || Array.isArray(isian)) {
    throw galat400('Format akun media sosial tidak dikenali.')
  }
  const rapi = []
  for (const platform of PLATFORM_PROFIL) {
    if (isian[platform] === undefined || isian[platform] === null) continue
    rapi.push([platform, bakukanAkunSosial(platform, isian[platform])])
  }
  return rapi
}

/** Tulis hasil periksaAkunSosial. Dipisah supaya pemeriksaan bisa didahulukan. */
export function terapkanAkunSosial(penggunaId, rapi) {
  const hapus = db.prepare('DELETE FROM akun_sosial WHERE pengguna_id = ? AND platform = ?')
  const pasang = db.prepare(
    `INSERT INTO akun_sosial (pengguna_id, platform, url) VALUES (?, ?, ?)
     ON CONFLICT(pengguna_id, platform) DO UPDATE SET url = excluded.url, diperbarui_pada = datetime('now')`,
  )
  for (const [platform, url] of rapi) {
    if (url) pasang.run(penggunaId, platform, url)
    else hapus.run(penggunaId, platform)
  }
  return akunSosialPengguna(penggunaId)
}
