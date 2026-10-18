/**
 * Cari model NaraRouter yang benar-benar bisa dipakai LokalBoost.
 * Jalankan: npm run model-nara          (hanya model gratis, akhiran -free)
 *           npm run model-nara -- --semua
 * ------------------------------------------------------------------
 * Kenapa tidak cukup membaca katalog seperti `model-openrouter.js`:
 * NaraRouter tidak mengumumkan `supported_parameters`, jadi dukungan
 * `structured_outputs` tidak bisa diketahui tanpa mencobanya. Skrip ini
 * karena itu benar-benar memanggil tiap model dengan skema JSON kecil, lalu
 * menilai jawabannya.
 *
 * Yang diuji dua-duanya penting, dan keduanya pernah menjatuhkan fitur ini:
 *
 *   1. `response_format.json_schema` — tanpa dukungan ini model tetap
 *      menjawab dengan sopan tapi berbentuk prosa. `JSON.parse` gagal, lalu
 *      fitur diam-diam kembali ke template. Dari luar terlihat "AI-nya jalan".
 *   2. Latensi — harus di bawah `AI_BATAS_DETIK` (bawaan 20 detik), yang
 *      sendiri harus di bawah `maxDuration` 30 detik di vercel.json. Model
 *      lambat tidak jatuh ke template, melainkan membuat Vercel membunuh
 *      fungsinya dan pengguna menerima 504.
 *
 * Angka detik di sini adalah LANTAI, bukan ramalan. Skema ujinya kecil (dua
 * field), sedangkan skema naskah yang sebenarnya jauh lebih besar. Diukur
 * 18 Sep 2026: nemotron-3-super-free lulus di 2,4 detik di sini, tapi 12-21
 * detik pada skema naskah asli. Pakai `npm run cek-ai` untuk angka yang
 * benar-benar mewakili.
 */
import { config } from './config.js'

const hijau = (t) => `\x1b[32m${t}\x1b[0m`
const merah = (t) => `\x1b[31m${t}\x1b[0m`
const kuning = (t) => `\x1b[33m${t}\x1b[0m`
const redup = (t) => `\x1b[90m${t}\x1b[0m`

const semua = process.argv.includes('--semua')

if (!config.nara.apiKey) {
  console.error('NARA_API_KEY belum diatur di .env')
  process.exit(1)
}

const kepala = {
  Authorization: `Bearer ${config.nara.apiKey}`,
  'Content-Type': 'application/json',
}

const katalog = await fetch(`${config.nara.baseUrl}/models`, { headers: kepala })
if (!katalog.ok) {
  console.error(`Gagal membaca katalog NaraRouter: HTTP ${katalog.status}`)
  console.error((await katalog.text()).slice(0, 300))
  process.exit(1)
}

const { data } = await katalog.json()
const daftar = data
  .map((m) => (m.id || m.name || '').trim())
  .filter(Boolean)
  .filter((id) => (semua ? true : id.endsWith('-free')))

if (!daftar.length) {
  console.error('Tidak ada model yang cocok dengan saringan.')
  process.exit(1)
}

/** Skema sengaja kecil: yang diuji dukungannya, bukan kepintaran modelnya. */
const SKEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kota', 'jumlah'],
  properties: {
    kota: { type: 'string', description: 'Nama satu kota di Indonesia' },
    jumlah: { type: 'integer', description: 'Angka bulat antara 1 dan 5' },
  },
}

const BATAS_MS = config.batasAiDetik * 1000

async function uji(model) {
  const mulai = Date.now()
  try {
    const r = await fetch(`${config.nara.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: kepala,
      signal: AbortSignal.timeout(BATAS_MS),
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'uji', strict: true, schema: SKEMA },
        },
        messages: [
          { role: 'system', content: 'Jawab hanya dengan JSON sesuai skema.' },
          { role: 'user', content: 'Sebutkan satu kota di Indonesia dan angka 3.' },
        ],
      }),
    })

    const detik = ((Date.now() - mulai) / 1000).toFixed(1)
    const teks = await r.text()

    if (!r.ok) {
      let pesan = teks.slice(0, 120)
      try {
        pesan = JSON.parse(teks).error?.message || pesan
      } catch {
        /* biarkan apa adanya */
      }
      return { model, detik, status: 'tolak', catatan: `HTTP ${r.status} ${pesan}` }
    }

    const jawaban = JSON.parse(teks)
    const pilihan = jawaban.choices?.[0]
    if (pilihan?.finish_reason === 'length') {
      return { model, detik, status: 'potong', catatan: 'jawaban terpotong sebelum JSON selesai' }
    }

    const isi = pilihan?.message?.content
    if (!isi) return { model, detik, status: 'kosong', catatan: 'tidak ada teks jawaban' }

    try {
      const objek = JSON.parse(isi)
      const lengkap = typeof objek.kota === 'string' && Number.isInteger(objek.jumlah)
      return lengkap
        ? { model, detik, status: 'ok', catatan: JSON.stringify(objek) }
        : { model, detik, status: 'beda', catatan: `JSON sah tapi tidak sesuai skema: ${isi.slice(0, 80)}` }
    } catch {
      return { model, detik, status: 'prosa', catatan: `bukan JSON: ${isi.slice(0, 80).replace(/\s+/g, ' ')}` }
    }
  } catch (e) {
    const detik = ((Date.now() - mulai) / 1000).toFixed(1)
    const alasan = e?.name === 'TimeoutError' ? `lewat batas ${config.batasAiDetik} detik` : e.message
    return { model, detik, status: 'gagal', catatan: alasan }
  }
}

console.log(`\nMenguji ${daftar.length} model di ${config.nara.baseUrl}`)
console.log(redup(`Lulus = JSON sesuai skema DAN di bawah ${config.batasAiDetik} detik\n`))

const hasil = []
for (const model of daftar) {
  const h = await uji(model)
  hasil.push(h)
  const lulus = h.status === 'ok' && Number(h.detik) < config.batasAiDetik
  const label = lulus ? hijau('LULUS') : h.status === 'ok' ? kuning('LAMBAT') : merah('TIDAK')
  console.log(`  ${label.padEnd(16)} ${model.padEnd(34)} ${(h.detik + 's').padStart(7)}  ${redup(h.catatan)}`)
}

const layak = hasil.filter((h) => h.status === 'ok' && Number(h.detik) < config.batasAiDetik)
layak.sort((a, b) => Number(a.detik) - Number(b.detik))

console.log()
if (!layak.length) {
  console.log(merah('Tidak ada model yang lolos.'))
  console.log(redup('Tanpa structured_outputs, fitur AI hanya akan menghasilkan template.'))
  process.exit(1)
}

console.log(hijau(`${layak.length} model lolos. Tercepat: ${layak[0].model} (${layak[0].detik}s)`))
console.log(redup(`Pasang di .env:  NARA_MODEL=${layak[0].model}`))
