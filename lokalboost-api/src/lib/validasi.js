/**
 * Aturan isian yang dipakai bersama oleh semua rute.
 *
 * Web punya salinan aturan yang sama (lokalboost-web/src/validasi.js) supaya
 * pengguna ditegur sebelum mengirim, tapi API tetap memeriksa ulang: klien
 * bisa dilewati siapa saja dengan curl.
 */
import { galat400 } from './util.js'

/**
 * Email yang benar-benar bisa menerima kode: bagian lokal yang wajar, domain
 * bertitik, dan akhiran huruf minimal 2 (".c" atau ".123" ditolak). Pola
 * lama `x@y.z` meloloskan "a@b.c", yang tidak pernah punya inbox.
 */
const POLA_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i

export function emailSah(nilai) {
  const t = String(nilai || '').trim()
  if (t.length > 254 || t.split('@')[0].length > 64) return false
  if (t.includes('..') || /(^|@)\.|\.@/.test(t)) return false
  return POLA_EMAIL.test(t)
}

export function pastikanEmail(nilai) {
  const t = String(nilai || '').trim().toLowerCase()
  if (!emailSah(t)) throw galat400('Format email tidak valid. Contoh yang benar: nama@email.com')
  return t
}

/**
 * Nomor HP Indonesia -> bentuk baku "08xxxxxxxxx".
 * Menerima "+62 812-3456-7890", "62812...", "0812 3456 7890". Nomor seluler
 * Indonesia diawali 08 dan panjangnya 10-13 digit.
 */
export function rapikanTelepon(nilai) {
  let t = String(nilai ?? '').trim().replace(/[\s\-().]/g, '')
  if (t.startsWith('+62')) t = '0' + t.slice(3)
  else if (t.startsWith('62')) t = '0' + t.slice(2)
  else if (t.startsWith('8')) t = '0' + t
  return t
}

export const teleponSah = (nilai) => /^08[1-9]\d{7,10}$/.test(rapikanTelepon(nilai))

export function pastikanTelepon(nilai) {
  const t = rapikanTelepon(nilai)
  if (!/^08[1-9]\d{7,10}$/.test(t)) {
    throw galat400('Nomor HP tidak valid. Pakai nomor seluler Indonesia 10-13 digit, contoh: 0812 3456 7890')
  }
  return t
}

/** Teks wajib dengan batas panjang; mengembalikan versi yang sudah dirapikan. */
export function pastikanTeks(nilai, label, { min = 2, maks = 120, wajibHuruf = true } = {}) {
  const t = String(nilai ?? '').trim().replace(/\s+/g, ' ')
  if (t.length < min) throw galat400(`${label} minimal ${min} karakter.`)
  if (t.length > maks) throw galat400(`${label} maksimal ${maks} karakter.`)
  if (wajibHuruf && !/\p{L}/u.test(t)) throw galat400(`${label} harus berisi huruf.`)
  return t
}
