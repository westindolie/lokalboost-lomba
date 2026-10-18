/**
 * Uji jalur AI generatif ke Claude — jalankan: npm run cek-ai
 * ------------------------------------------------------------------
 * Alasan skrip ini ada: services/ai.js sengaja tidak pernah gagal. Kalau
 * kunci salah, kuota habis, atau bentuk panggilannya keliru, `try/catch` di
 * sana menjatuhkannya ke template dan hasilnya tetap terlihat masuk akal.
 * Sifat itu bagus untuk demo (Wi-Fi ruangan mati tidak mematikan presentasi)
 * tapi buruk untuk memastikan: tanpa alat ini, "AI-nya sudah nyala" hanya
 * bisa ditebak.
 *
 * Skrip ini memanggil kedua fitur LLM, lalu keluar dengan kode 1 kalau salah
 * satunya jatuh ke template — sambil mencetak alasan aslinya.
 */
import { aiAktif, buatNaskah, penyediaAi, ringkasLaporan } from './services/ai.js'

const KAMPANYE_CONTOH = {
  nama: 'Promo Bakso Aci Mbak Sari',
  kategori: 'Kuliner',
  lokasi: 'Bandung',
  deskripsi: 'Bakso aci kuah pedas buatan rumahan, buka setiap hari jam 10 pagi sampai 9 malam.',
  target_views: 5000,
  anggaran: 2_500_000,
}

const BRIEF_CONTOH = [
  'Tunjukkan kuah pedasnya yang masih mengepul',
  'Sebutkan harga mulai 15 ribu per porsi',
  'Ajak penonton datang langsung ke warung',
]

const STATISTIK_CONTOH = {
  tervalidasi: 4210,
  disaring: 318,
  biayaTerpakai: 2_105_000,
  kotaTeratas: 'Bandung',
  persenTarget: 84,
  sisaDikembalikan: 395_000,
  sebaranLokasi: [
    { kota: 'Bandung', persen: 62 },
    { kota: 'Cimahi', persen: 21 },
    { kota: 'Jakarta', persen: 17 },
  ],
}

const hijau = (t) => `\x1b[32m${t}\x1b[0m`
const merah = (t) => `\x1b[31m${t}\x1b[0m`
const redup = (t) => `\x1b[90m${t}\x1b[0m`

function laporkan(nama, hasil, penyedia) {
  if (hasil.sumber === 'llm') {
    // Yang dilaporkan adalah penyedia yang BENAR-BENAR menjawab, bukan
    // penyedia pertama dalam urutan. Keduanya berbeda setiap kali penyedia
    // pertama mentok batas waktu dan cadangannya yang mengambil alih.
    const dipakai = hasil.penyedia || penyedia.nama
    const utama = dipakai === penyedia.nama
    // Model pemenang diambil dari jawaban, bukan dari konfigurasi: sejak
    // beberapa model dibalapkan, yang menjawab belum tentu model pertama.
    const model = hasil.model || penyedia.model
    console.log(
      `${hijau('BERHASIL')}  ${nama} — dijawab ${dipakai} (${model})` +
        (utama ? '' : redup(' [cadangan, bukan penyedia utama]')),
    )
    return true
  }
  console.log(`${merah('GAGAL')}     ${nama} — jatuh ke template`)
  console.log(redup(`          sebab: ${hasil.alasanCadangan || 'tidak tercatat'}`))
  return false
}

async function utama() {
  console.log(`\nMenguji jalur AI generatif LokalBoost`)

  if (!aiAktif()) {
    console.log(merah('Belum ada kunci penyedia AI.'))
    console.log(`
Pilih salah satu, lalu jalankan lagi:  npm run cek-ai

  OpenRouter (punya model gratis)
    1. Buat kunci di https://openrouter.ai/keys
    2. Isi .env:  OPENROUTER_API_KEY=sk-or-...
    3. Isi juga modelnya, WAJIB yang mendukung structured_outputs:
       OPENROUTER_MODEL=deepseek/deepseek-v4-flash-0731:free
       Daftar yang memenuhi syarat:  npm run model-openrouter

  Anthropic (berbayar, paling stabil)
    1. Buat kunci di https://console.anthropic.com/settings/keys
    2. Isi .env:  ANTHROPIC_API_KEY=sk-ant-...

Bila keduanya diisi, OpenRouter yang dipakai.

Tanpa kunci mana pun, backend TETAP JALAN PENUH — Auto-Report memakai
template yang disusun dari data kampanye. Yang hilang cuma variasi
bahasanya, bukan fiturnya.
`)
    process.exitCode = 1
    return
  }

  const penyedia = penyediaAi()
  const daftarModel = penyedia.models || [penyedia.model]
  console.log(
    redup(
      `Penyedia: ${penyedia.nama} · Model: ${daftarModel.join(' | ')}` +
        (daftarModel.length > 1 ? ` (dibalapkan, urut prioritas)` : '') +
        '\n',
    ),
  )

  const naskah = await buatNaskah(KAMPANYE_CONTOH, BRIEF_CONTOH, { gaya: 'santai dan jujur' })
  const okNaskah = laporkan('Script Generator', naskah, penyedia)
  if (okNaskah) {
    console.log(redup(`          hook: "${naskah.hook}"`))
    console.log(redup(`          ${naskah.adegan.length} adegan · ${naskah.tagar.length} tagar · ${naskah.ideLain.length} ide lain`))
  }

  const laporan = await ringkasLaporan(KAMPANYE_CONTOH, STATISTIK_CONTOH)
  const okLaporan = laporkan('Auto-Report Summary', laporan, penyedia)
  if (okLaporan) {
    console.log(redup(`          "${laporan.ringkasan.slice(0, 90)}..."`))
  }

  if (okNaskah && okLaporan) {
    console.log(`\n${hijau('Kedua fitur LLM terbukti hidup.')} Template tetap tersedia sebagai cadangan.\n`)
  } else {
    console.log(`\n${merah('Ada fitur yang belum benar-benar memakai model.')} Baca sebabnya di atas.\n`)
    process.exitCode = 1
  }
}

utama().catch((galat) => {
  console.error(merah(`\nSkrip berhenti: ${galat.message}\n`))
  process.exitCode = 1
})
