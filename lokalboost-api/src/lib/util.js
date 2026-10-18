import crypto from 'node:crypto'

/** Galat yang boleh dikirim apa adanya ke klien (pesan sudah ramah pengguna). */
export class GalatHttp extends Error {
  constructor(status, pesan, rincian) {
    super(pesan)
    this.status = status
    this.rincian = rincian
  }
}

export const galat400 = (pesan, rincian) => new GalatHttp(400, pesan, rincian)
export const galat401 = (pesan = 'Anda perlu masuk terlebih dahulu.') => new GalatHttp(401, pesan)
export const galat403 = (pesan = 'Anda tidak berhak melakukan tindakan ini.', rincian) =>
  new GalatHttp(403, pesan, rincian)
export const galat404 = (pesan = 'Data tidak ditemukan.') => new GalatHttp(404, pesan)
export const galat409 = (pesan) => new GalatHttp(409, pesan)
export const galat503 = (pesan) => new GalatHttp(503, pesan)
export const galat429 = (pesan = 'Terlalu banyak percobaan. Coba lagi sebentar lagi.') =>
  new GalatHttp(429, pesan)

/**
 * Bungkus handler async agar galat yang dilempar tetap sampai ke middleware
 * penanganan galat. Express 4 tidak menangkap Promise yang ditolak.
 */
export const bungkus = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** ID acak pendek dan mudah dibaca di log, mis. "kmp_9f2c1a7b". */
export function buatId(prefiks) {
  return `${prefiks}_${crypto.randomBytes(5).toString('hex')}`
}

/** Ubah judul menjadi slug URL: "Promo Bakso Aci!" -> "promo-bakso-aci". */
export function buatSlug(teks) {
  return teks
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID')

/** Hash satu arah untuk alamat IP — kami tidak pernah menyimpan IP mentah (UU PDP). */
export function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'tanpa-ip')).digest('hex').slice(0, 32)
}

/** Ambil dan validasi field wajib dari body permintaan. */
export function wajibAda(body, daftarField) {
  const kurang = daftarField.filter((f) => body?.[f] === undefined || body[f] === null || body[f] === '')
  if (kurang.length) {
    throw galat400(`Field berikut wajib diisi: ${kurang.join(', ')}.`, { kurang })
  }
  return body
}

/** Pastikan nilai berupa bilangan bulat positif. */
export function angkaPositif(nilai, namaField) {
  const n = Number(nilai)
  if (!Number.isFinite(n) || n <= 0) throw galat400(`${namaField} harus berupa angka lebih dari nol.`)
  return Math.round(n)
}

/** Rata-rata sederhana; mengembalikan 0 untuk daftar kosong. */
export const rerata = (daftar) => (daftar.length ? daftar.reduce((a, b) => a + b, 0) / daftar.length : 0)

/** Simpangan baku populasi. */
export function simpanganBaku(daftar) {
  if (daftar.length < 2) return 0
  const m = rerata(daftar)
  return Math.sqrt(rerata(daftar.map((x) => (x - m) ** 2)))
}

/** Tanggal ISO relatif terhadap sekarang, mis. hariLalu(3). */
export function hariLalu(n) {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export const sekarang = () => new Date().toISOString().slice(0, 19).replace('T', ' ')
