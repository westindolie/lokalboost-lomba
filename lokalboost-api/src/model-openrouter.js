/**
 * Daftar model OpenRouter yang benar-benar bisa dipakai LokalBoost.
 * Jalankan: npm run model-openrouter
 * ------------------------------------------------------------------
 * Saringannya cuma satu dan itu yang menentukan: `structured_outputs`.
 * services/ai.js meminta jawaban lewat `response_format.json_schema` lalu
 * mem-parse hasilnya. Model tanpa dukungan itu tetap menjawab dengan sopan,
 * tapi jawabannya prosa — `JSON.parse` gagal, `catch` menangkap, dan fitur
 * diam-diam kembali ke template. Dari luar terlihat "AI-nya jalan".
 *
 * Karena itu memilih model dari halaman web OpenRouter saja tidak cukup;
 * daftar di sini dibaca langsung dari API mereka, jadi selalu terkini.
 */
const API = 'https://openrouter.ai/api/v1/models'

const hijau = (t) => `\x1b[32m${t}\x1b[0m`
const redup = (t) => `\x1b[90m${t}\x1b[0m`

const hanyaGratis = process.argv.includes('--gratis')

const respons = await fetch(API)
if (!respons.ok) {
  console.error(`Gagal membaca katalog OpenRouter: HTTP ${respons.status}`)
  process.exit(1)
}

const { data } = await respons.json()

const layak = data
  .filter((m) => (m.supported_parameters || []).includes('structured_outputs'))
  .filter((m) => (hanyaGratis ? m.id.endsWith(':free') : true))

const gratis = layak.filter((m) => m.id.endsWith(':free'))
const berbayar = layak.filter((m) => !m.id.endsWith(':free'))

const cetak = (daftar) => {
  for (const m of daftar) {
    const konteks = m.context_length ? `${Math.round(m.context_length / 1000)}k` : '-'
    console.log(`  ${m.id.padEnd(46)} ${konteks.padStart(7)}  ${redup(m.name || '')}`)
  }
}

console.log(`\nModel OpenRouter yang mendukung structured_outputs`)
console.log(redup(`${layak.length} dari ${data.length} model di katalog\n`))

console.log(hijau(`GRATIS (${gratis.length})`))
cetak(gratis)

if (!hanyaGratis) {
  console.log(`\nBERBAYAR (${berbayar.length}) ${redup('— dipotong 15 teratas')}`)
  cetak(berbayar.slice(0, 15))
}

console.log(`\nPakai salah satunya di .env:`)
console.log(redup(`  OPENROUTER_MODEL=${(gratis[0] || layak[0])?.id || 'vendor/nama:free'}`))
console.log(redup(`\nModel di luar daftar ini akan membuat fitur AI diam-diam memakai template.\n`))
