/**
 * Simulator trafik tayangan — alat peraga untuk AI Anti-Fraud.
 *
 * Mengirim campuran tayangan asli dan tayangan curang ke API yang sedang
 * berjalan, lalu menampilkan berapa banyak yang lolos dan berapa yang
 * disaring beserta alasannya. Ini cara paling cepat menunjukkan bahwa
 * penyaringan benar-benar bekerja, bukan angka hasil rekaan.
 *
 * Pakai:
 *   node src/simulasi.js                          # kampanye pertama, 200 tayangan
 *   node src/simulasi.js bakso-aci 500 40         # 500 tayangan, 40% curang
 */
import { db } from './lib/db.js'
import { config } from './config.js'
import { hashIp } from './lib/util.js'

const [, , argKampanye, argJumlah, argPersenPalsu] = process.argv
const JUMLAH = Number(argJumlah) || 200
const PERSEN_PALSU = Number(argPersenPalsu) || 30
const BASIS = process.env.API_URL || `http://localhost:${config.port}`

const KOTA = ['Banda Aceh', 'Aceh Besar', 'Sabang', 'Lhokseumawe', 'Pidie', 'Bireuen']
const UA_ASLI = [
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
]
const UA_BOT = ['python-requests/2.31.0', 'HeadlessChrome/120.0.0.0', 'curl/8.4.0', 'Scrapy/2.11', 'Selenium/4.16']

const acak = (d) => d[Math.floor(Math.random() * d.length)]
const angka = (n) => n.toLocaleString('id-ID')

/** Penonton sungguhan: IP unik, perangkat wajar, menonton cukup lama. */
function tayanganAsli(videoId, i) {
  return {
    videoId,
    ip: `114.${10 + (i % 200)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    userAgent: acak(UA_ASLI),
    kota: acak(KOTA),
    perangkat: Math.random() > 0.3 ? 'Android' : 'iOS',
    durasiTonton: 12 + Math.floor(Math.random() * 25),
  }
}

/**
 * Tiga pola kecurangan yang paling sering ditemui pada view palsu berbayar:
 * bot terang-terangan, klik kilat, dan satu kumpulan IP yang diputar ulang.
 */
function tayanganPalsu(videoId, i) {
  const pola = i % 3
  if (pola === 0) {
    return { videoId, ip: `45.9.${i % 5}.${i % 255}`, userAgent: acak(UA_BOT), kota: acak(KOTA), perangkat: 'Tidak dikenal', durasiTonton: 20 }
  }
  if (pola === 1) {
    return { videoId, ip: `103.7.${i % 30}.${i % 255}`, userAgent: acak(UA_ASLI), kota: acak(KOTA), perangkat: 'Android', durasiTonton: 1 }
  }
  // Kolam IP kecil yang dipakai berulang-ulang.
  return { videoId, ip: `36.72.14.${i % 4}`, userAgent: UA_ASLI[0], kota: 'Banda Aceh', perangkat: 'Android', durasiTonton: 18 }
}

async function jalan() {
  const kampanye = argKampanye
    ? db.prepare('SELECT * FROM kampanye WHERE id = ?').get(argKampanye)
    : db.prepare("SELECT * FROM kampanye WHERE status = 'berjalan' ORDER BY dibuat_pada LIMIT 1").get()

  if (!kampanye) {
    console.error('Tidak ada kampanye berjalan. Jalankan `npm run seed` dulu.')
    process.exit(1)
  }

  const video = db
    .prepare("SELECT * FROM video WHERE kampanye_id = ? AND status = 'tayang' ORDER BY dibuat_pada LIMIT 1")
    .get(kampanye.id)
  if (!video) {
    console.error(`Kampanye "${kampanye.id}" belum punya video.`)
    process.exit(1)
  }

  const jumlahPalsu = Math.round((JUMLAH * PERSEN_PALSU) / 100)
  const jumlahAsli = JUMLAH - jumlahPalsu

  const asli = Array.from({ length: jumlahAsli }, (_, i) => tayanganAsli(video.id, i))
  const palsu = Array.from({ length: jumlahPalsu }, (_, i) => tayanganPalsu(video.id, i))
  const daftar = [...asli, ...palsu].sort(() => Math.random() - 0.5)
  // Penanda baris sebelum simulasi, supaya hasilnya bisa dicocokkan per
  // tayangan: mana yang curang tapi lolos, mana yang asli tapi tersaring.
  const idTerakhir = db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM tayangan').get().n

  console.log('')
  console.log(`  Simulasi trafik — ${kampanye.nama}`)
  console.log(`  Mengirim ${angka(JUMLAH)} tayangan (${angka(jumlahAsli)} asli, ${angka(jumlahPalsu)} curang) ke ${BASIS}`)
  console.log('')

  let respons
  try {
    // Rute batch khusus admin karena menerima IP dari body. Akun admin seed
    // dipakai sebagai bawaan; timpa lewat ADMIN_EMAIL / ADMIN_SANDI.
    const masuk = await fetch(`${BASIS}/api/auth/masuk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identitas: process.env.ADMIN_EMAIL || 'admin@lokalboost.id',
        kataSandi: process.env.ADMIN_SANDI || 'lokalboost123',
      }),
    }).then((r) => r.json())
    if (!masuk.token) {
      console.error('  Gagal masuk sebagai admin:', masuk.galat || masuk)
      process.exit(1)
    }

    respons = await fetch(`${BASIS}/api/tayangan/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${masuk.token}` },
      body: JSON.stringify({ tayangan: daftar }),
    })
  } catch {
    console.error(`  Tidak bisa menghubungi ${BASIS}. Jalankan "npm run dev" di terminal lain.`)
    process.exit(1)
  }

  const hasil = await respons.json()
  if (!respons.ok) {
    console.error('  Gagal:', hasil.galat || hasil)
    process.exit(1)
  }

  console.log('  Lapis 1 — pemeriksaan per tayangan')
  console.log(`    Dihitung sebagai tayangan asli : ${angka(hasil.dihitung)}`)
  console.log(`    Disaring                       : ${angka(hasil.disaring)}`)
  for (const [alasan, jumlah] of Object.entries(hasil.alasan)) {
    console.log(`      ${String(jumlah).padStart(5)} — ${alasan}`)
  }

  // Lapis 2 dijalankan server sebelum akrual (lihat prosesPembayaran),
  // jadi hasilnya sudah ikut di respons — tidak perlu dihitung ulang.
  const pembayaran = hasil.pembayaran?.[kampanye.id]
  const anomali = pembayaran?.anomali || { jamAnomali: [], tayanganDisaring: 0 }
  console.log('')
  console.log('  Lapis 2 — deteksi anomali deret waktu')
  if (anomali.jamAnomali.length === 0) {
    console.log(`    Tidak ada jam yang menyimpang${anomali.catatan ? ` (${anomali.catatan})` : ''}`)
  } else {
    console.log(`    Ditahan (kelebihan lonjakan)   : ${angka(anomali.tayanganDisaring)}`)
    for (const j of anomali.jamAnomali) {
      console.log(
        `      ${j.jam} — ${angka(j.jumlah)} tayangan (normal ~${angka(j.rerataNormal)}, ` +
          `batas wajar ${angka(j.batasWajar)}, z=${j.zScore})`,
      )
    }
  }

  if (pembayaran) {
    console.log('')
    console.log('  Dampak ke Pay-Per-View:')
    console.log(`    Tayangan baru dibayar : ${angka(pembayaran.viewsBaru || 0)}`)
    console.log(`    Biaya baru            : Rp ${angka(pembayaran.biayaBaru || 0)}`)
    if (pembayaran.catatan) console.log(`    Catatan               : ${pembayaran.catatan}`)
    if (pembayaran.penutupan) {
      console.log(`    Kampanye ditutup      : kreator menerima Rp ${angka(pembayaran.penutupan.dibayarKeKreator)}`)
    }
  }

  // Dihitung dari baris sungguhan, bukan dari total "disaring". Versi lama
  // membagi semua yang disaring (termasuk penonton asli yang ikut tertahan)
  // dengan jumlah tayangan curang, sehingga tercetak "200 dari 60, 100%".
  const hashPalsu = new Set(palsu.map((t) => hashIp(t.ip)))
  const baris = db
    .prepare('SELECT ip_hash, valid FROM tayangan WHERE id > ? AND video_id = ?')
    .all(idTerakhir, video.id)
  const palsuLolos = baris.filter((b) => hashPalsu.has(b.ip_hash) && b.valid === 1).length
  const asliTertahan = baris.filter((b) => !hashPalsu.has(b.ip_hash) && b.valid === 0).length
  const persen = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0')

  console.log('')
  console.log(`  Tayangan curang tertangkap : ${angka(jumlahPalsu - palsuLolos)} dari ${angka(jumlahPalsu)} (lolos ${persen(palsuLolos, jumlahPalsu)}%)`)
  console.log(`  Penonton asli tertahan     : ${angka(asliTertahan)} dari ${angka(jumlahAsli)} (${persen(asliTertahan, jumlahAsli)}%)`)
  console.log('  Tertahan karena lonjakan bukan dihapus: bisa dipulihkan lewat banding sengketa.')
  console.log('  (PRD §3.2 menargetkan <3% view palsu lolos tanpa terdeteksi)')
  console.log('')
}

jalan()
