/**
 * Pemeriksaan isian di sisi web. Aturannya salinan lokalboost-api/src/lib/validasi.js
 * dan uraiTautanProfil() di services/profil-sosial.js: web menegur lebih awal,
 * API tetap memeriksa ulang. Setiap fungsi `cek*` mengembalikan pesan galat,
 * atau string kosong bila isiannya sah.
 */

const POLA_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i

export function cekEmail(nilai) {
  const t = String(nilai || '').trim()
  if (!t) return 'Email wajib diisi.'
  const sah =
    t.length <= 254 &&
    t.split('@')[0].length <= 64 &&
    !t.includes('..') &&
    !/(^|@)\.|\.@/.test(t) &&
    POLA_EMAIL.test(t)
  return sah ? '' : 'Format email tidak valid. Contoh: nama@email.com'
}

/** "+62 812-3456-7890" -> "081234567890" */
export function rapikanTelepon(nilai) {
  let t = String(nilai ?? '').trim().replace(/[\s\-().]/g, '')
  if (t.startsWith('+62')) t = '0' + t.slice(3)
  else if (t.startsWith('62')) t = '0' + t.slice(2)
  else if (t.startsWith('8')) t = '0' + t
  return t
}

export function cekTelepon(nilai, { wajib = false } = {}) {
  if (!String(nilai || '').trim()) return wajib ? 'Nomor HP wajib diisi.' : ''
  return /^08[1-9]\d{7,10}$/.test(rapikanTelepon(nilai))
    ? ''
    : 'Nomor HP tidak valid. Pakai nomor seluler Indonesia 10-13 digit, contoh: 0812 3456 7890'
}

export function cekTeks(nilai, label, { min = 2, maks = 120, wajib = true } = {}) {
  const t = String(nilai ?? '').trim()
  if (!t) return wajib ? `${label} wajib diisi.` : ''
  if (t.length < min) return `${label} minimal ${min} karakter.`
  if (t.length > maks) return `${label} maksimal ${maks} karakter.`
  if (!/\p{L}/u.test(t)) return `${label} harus berisi huruf.`
  return ''
}

const JALUR_IG_BUKAN_AKUN = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct', 'about', 'developer', 'legal'])

/**
 * Tautan profil TikTok / Instagram / YouTube. Mengembalikan
 * { galat } atau { platform, akun }.
 */
export function uraiTautanProfil(nilai) {
  const teks = String(nilai || '').trim()
  if (!teks) return { galat: 'Tautan profil wajib diisi.' }
  let uri
  try {
    uri = new URL(/^https?:\/\//i.test(teks) ? teks : `https://${teks}`)
  } catch {
    return { galat: 'Tautan tidak sah. Contoh: https://www.tiktok.com/@akunanda' }
  }
  const host = uri.hostname.toLowerCase()
  const seg = uri.pathname.split('/').filter(Boolean)

  if (host === 'vt.tiktok.com' || host === 'vm.tiktok.com') {
    return { galat: 'Tautan pendek TikTok tidak bisa dibaca. Salin tautan lengkap tiktok.com/@akunanda.' }
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const akun = (seg[0] || '').startsWith('@') ? seg[0].slice(1) : ''
    return /^[a-z0-9_.]{2,24}$/i.test(akun)
      ? { platform: 'tiktok', akun }
      : { galat: 'Tautan TikTok harus berisi nama akun, contoh: https://www.tiktok.com/@akunanda' }
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    const akun = seg[0] === 'stories' ? seg[1] || '' : seg[0] || ''
    if (!akun || JALUR_IG_BUKAN_AKUN.has(akun.toLowerCase())) {
      return { galat: 'Itu tautan postingan, bukan profil. Contoh: https://www.instagram.com/akunanda' }
    }
    return /^[a-z0-9_.]{1,30}$/i.test(akun)
      ? { platform: 'instagram', akun }
      : { galat: 'Nama akun Instagram di tautan tidak sah.' }
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const pertama = seg[0] || ''
    if (pertama.startsWith('@') && /^[a-z0-9_.-]{3,30}$/i.test(pertama.slice(1))) {
      return { platform: 'youtube', akun: pertama.slice(1) }
    }
    if (pertama === 'channel' && /^UC[A-Za-z0-9_-]{22}$/.test(seg[1] || '')) {
      return { platform: 'youtube', akun: seg[1] }
    }
    return { galat: 'Tautan YouTube harus tautan channel, contoh: https://www.youtube.com/@namachannel' }
  }
  if (host === 'youtu.be') return { galat: 'Itu tautan video. Salin tautan channel, contoh: https://www.youtube.com/@namachannel' }
  return { galat: 'Hanya tautan profil TikTok, Instagram, atau YouTube yang diterima.' }
}

export const cekTautanProfil = (nilai, { wajib = false } = {}) =>
  !String(nilai || '').trim() && !wajib ? '' : uraiTautanProfil(nilai).galat || ''

/** Kode OTP: tepat 6 angka. `hanyaAngka` dipakai di onChange. */
export const hanyaAngka = (nilai, maks = 6) => String(nilai || '').replace(/\D/g, '').slice(0, maks)
export const cekKodeOtp = (nilai) => (/^\d{6}$/.test(String(nilai || '')) ? '' : 'Kode harus 6 angka.')

/** Ambil galat pertama dari objek { field: pesan }. */
export const galatPertama = (galat) => Object.values(galat).find(Boolean) || ''
