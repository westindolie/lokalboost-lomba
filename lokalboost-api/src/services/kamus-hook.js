/**
 * Kamus slang + rumus hook untuk penyusun brief (services/ai.js).
 *
 * Sumber: data/Kamus_Slang_Hook_Konten.xlsx, diubah ke src/data/kamus-hook.js
 * oleh data/bangun-kamus.py. Ini bahan yang DISUNTIKKAN ke prompt (few-shot
 * terpilih), bukan pelatihan model: model tidak berubah, ia hanya diberi
 * kosakata dan rumus yang cocok dengan produk yang sedang dibuatkan brief.
 *
 * Penyaring bawaan, karena yang memakai ini UMKM dengan brand sungguhan:
 *   - keamanan "Sensitif" dan "Kasar Ringan" dibuang (judi, body shaming,
 *     umpatan);
 *   - status "Mulai Basi" dibuang;
 *   - kategori "Kritik & Negatif" dan fungsi "Kontroversi/Opini" dibuang,
 *     juga template tipe "Opini": gayanya mengajak menjelekkan sesuatu, dan
 *     itu persis yang dilarang pemeriksaan etika kampanye.
 */
import { SLANG, TEMPLATE_HOOK } from '../data/kamus-hook.js'

/** Kategori UMKM LokalBoost -> kata niche di kamus. */
const NICHE_KATEGORI = {
  kuliner: ['kuliner', 'review', 'umkm', 'bisnis', 'travel'],
  fashion: ['review', 'haul', 'affiliate', 'belanja', 'lifestyle'],
  kecantikan: ['beauty', 'review', 'affiliate', 'lifestyle'],
  'ibu & anak': ['tips', 'edukasi', 'review', 'belanja', 'lifestyle'],
  'hobi & gadget': ['tech', 'review', 'belanja', 'affiliate'],
}
const NICHE_UMUM = ['umkm', 'bisnis', 'review', 'belanja']

const TIPE_TEMPLATE_DIBUANG = new Set(['Opini'])
const KATEGORI_DIBUANG = new Set(['Kritik & Negatif'])
const FUNGSI_DIBUANG = new Set(['Kontroversi/Opini'])
const BOBOT_TREN = { 'Viral 2025–26': 3, 'Masih Tren': 2, Evergreen: 1 }

/** Slang yang aman dipakai brand UMKM. */
export const slangAman = () =>
  SLANG.filter(
    (s) =>
      s.keamanan === 'Aman' &&
      s.tren !== 'Mulai Basi' &&
      !KATEGORI_DIBUANG.has(s.kategori) &&
      !FUNGSI_DIBUANG.has(s.fungsi),
  )

/** Hash kecil supaya urutan seri sama untuk produk yang sama, tapi beda antarproduk. */
function benih(teks) {
  let h = 2166136261
  for (const c of String(teks || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

const kataNiche = (kategori) => {
  const k = String(kategori || '').trim().toLowerCase()
  return NICHE_KATEGORI[k] || NICHE_UMUM
}

function skor(s, niche) {
  const tag = s.niche.map((n) => n.toLowerCase())
  let nilai = BOBOT_TREN[s.tren] || 1
  if (tag.some((t) => niche.some((n) => t.includes(n)))) nilai += 4
  else if (tag.includes('semua niche')) nilai += 2
  return nilai
}

/**
 * Pilih bahan untuk satu produk: slang yang cocok dengan kategorinya (satu
 * per fungsi hook dulu supaya variatif) dan beberapa rumus hook.
 * @param {{nama?: string, kategori?: string}} produk
 * @returns {{slang: object[], template: object[]}}
 */
export function pilihBahanHook(produk = {}, { jumlahSlang = 10, jumlahTemplate = 4 } = {}) {
  const niche = kataNiche(produk.kategori)
  const acak = benih(`${produk.nama}|${produk.kategori}`)

  const berurut = slangAman()
    .map((s) => ({ s, nilai: skor(s, niche), urut: benih(`${s.id}|${acak}`) }))
    .sort((a, b) => b.nilai - a.nilai || a.urut - b.urut)

  // Satu per fungsi hook lebih dulu, baru sisanya: hook yang semuanya sama
  // fungsinya (mis. humor semua) membuat brief monoton.
  const dipilih = []
  const fungsiTerpakai = new Set()
  for (const { s } of berurut) {
    if (dipilih.length >= jumlahSlang) break
    if (fungsiTerpakai.has(s.fungsi)) continue
    fungsiTerpakai.add(s.fungsi)
    dipilih.push(s)
  }
  for (const { s } of berurut) {
    if (dipilih.length >= jumlahSlang) break
    if (!dipilih.includes(s)) dipilih.push(s)
  }

  const template = TEMPLATE_HOOK.filter((t) => !TIPE_TEMPLATE_DIBUANG.has(t.tipe))
    .map((t) => ({ t, urut: benih(`${t.rumus}|${acak}`) }))
    .sort((a, b) => a.urut - b.urut)
  const tipeTerpakai = new Set()
  const terpilih = []
  for (const { t } of template) {
    if (terpilih.length >= jumlahTemplate) break
    if (tipeTerpakai.has(t.tipe)) continue
    tipeTerpakai.add(t.tipe)
    terpilih.push(t)
  }

  return { slang: dipilih, template: terpilih }
}

/** Bagian prompt untuk model: kosakata + rumus + aturan pakai. */
export function bahanHookUntukPrompt(produk) {
  const { slang, template } = pilihBahanHook(produk)
  const baris = slang.map((s) => {
    const catatan = s.catatan ? ` Catatan: ${s.catatan}` : ''
    return `- "${s.kata}" (${s.arti}). Fungsi: ${s.fungsi}. Contoh: ${s.contoh}${catatan}`
  })
  const rumus = template.map((t) => `- ${t.tipe}: ${t.isian} (contoh: ${t.contoh})`)
  return `KAMUS HOOK (bahan, bukan keharusan; hanya pakai yang cocok dengan produk):
Slang yang cocok:
${baris.join('\n')}

Rumus hook:
${rumus.join('\n')}

Aturan memakai kamus:
- Poin brief PERTAMA wajib hook untuk 3 detik pertama dan memuat satu kalimat contoh dalam tanda kutip yang bisa langsung diucapkan kreator, misalnya: Buka dengan ucapan "Gas, ..." lalu tunjukkan ....
- Kalimat hook itu memakai 1 sampai 2 slang dari daftar yang paling cocok (jangan lebih), lalu langsung janji manfaat yang spesifik dan benar tentang produk ini (angka, harga, atau waktu bila ada di deskripsi).
- Contoh dan rumus di atas memakai topik lain: JANGAN disalin, ganti dengan produk pemilik usaha.
- Jangan paksakan slang bila tidak cocok dengan gaya referensi atau produk.
- Hook tidak boleh menyindir, menuduh, atau merendahkan usaha lain.`
}

/**
 * Satu poin hook untuk brief cadangan (tanpa model bahasa): menyebut slang
 * dan rumusnya apa adanya, tanpa mengarang kalimat jadi.
 */
export function poinHookCadangan(produk) {
  const { slang, template } = pilihBahanHook(produk, { jumlahSlang: 2, jumlahTemplate: 1 })
  if (!slang.length) return null
  const kata = slang.slice(0, 2).map((s) => `"${s.kata}" (${s.arti.toLowerCase()})`).join(' atau ')
  const rumus = template[0] ? ` Rumus: ${template[0].isian}` : ''
  return `Buka 3 detik pertama dengan hook memakai slang ${kata}, lalu langsung janjikan manfaat spesifik.${rumus}`
}
