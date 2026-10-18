import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { db } from './db.js'
import { galat401, galat403 } from './util.js'

/**
 * Kata sandi di-hash dengan scrypt bawaan Node — tidak perlu dependensi
 * native tambahan seperti bcrypt, dan scrypt memang dirancang tahan terhadap
 * serangan perangkat keras khusus.
 */
export function hashSandi(sandi) {
  const garam = crypto.randomBytes(16).toString('hex')
  const kunci = crypto.scryptSync(sandi, garam, 64).toString('hex')
  return `${garam}:${kunci}`
}

export function cekSandi(sandi, tersimpan) {
  if (!tersimpan || !tersimpan.includes(':')) return false
  const [garam, kunci] = tersimpan.split(':')
  const uji = crypto.scryptSync(sandi, garam, 64)
  const asli = Buffer.from(kunci, 'hex')
  return uji.length === asli.length && crypto.timingSafeEqual(uji, asli)
}

export function buatToken(pengguna) {
  return jwt.sign({ sub: pengguna.id, peran: pengguna.peran }, config.jwtSecret, {
    expiresIn: config.jwtKedaluwarsa,
  })
}

/** Kode OTP 6 digit. */
export const buatKodeOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

/**
 * Membaca header Authorization bila ada, tanpa memaksa. Rute publik seperti
 * marketplace tetap bisa dipanggil tanpa token, tapi kalau tokennya ada kita
 * bisa memberi konteks tambahan (mis. status lamaran kreator ini).
 */
export function bacaPengguna(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next()
  try {
    const isi = jwt.verify(token, config.jwtSecret)
    req.pengguna = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(isi.sub) || null
  } catch {
    req.pengguna = null // token kedaluwarsa/rusak diperlakukan seperti tamu
  }
  next()
}

export function wajibLogin(req, _res, next) {
  if (!req.pengguna) return next(galat401())
  next()
}

/** wajibPeran('umkm') atau wajibPeran('umkm', 'admin'). */
export function wajibPeran(...peran) {
  return (req, _res, next) => {
    if (!req.pengguna) return next(galat401())
    if (!peran.includes(req.pengguna.peran)) {
      return next(galat403(`Rute ini hanya untuk ${peran.join(' atau ')}.`))
    }
    next()
  }
}
