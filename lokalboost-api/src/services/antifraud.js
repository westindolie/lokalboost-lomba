import { db } from '../lib/db.js'
import { config } from '../config.js'
import { rerata, simpanganBaku } from '../lib/util.js'

/**
 * AI Anti-Fraud (PRD §8.2)
 * ------------------------------------------------------------------
 * Dua lapis, persis seperti batasan MVP di PRD: "deteksi pola views
 * mencurigakan berbasis aturan dan model deteksi anomali dasar".
 *
 *   Lapis 1 — Aturan per tayangan (dijalankan saat tayangan masuk).
 *             Menangkap kecurangan kasar: bot, view kilat, IP diulang.
 *
 *   Lapis 2 — Deteksi anomali pada deret waktu (dijalankan berkala).
 *             Menangkap yang lolos lapis 1: lonjakan trafik tak wajar yang
 *             hanya kelihatan kalau tayangan dilihat sebagai satu deret,
 *             bukan satu per satu. Metodenya z-score terhadap volume
 *             tayangan per jam kampanye itu sendiri.
 *
 * Keputusan desain: tayangan yang disaring TIDAK dihapus. Barisnya tetap
 * ada dengan `valid = 0` dan kolom `alasan` terisi. Itu yang membuat
 * halaman sengketa punya bukti untuk ditunjukkan (PRD §12) dan membuat
 * kreator bisa mengajukan banding atas penyaringan yang salah (PRD §15).
 */

/** Penanda user-agent yang hampir pasti bukan penonton manusia. */
const POLA_BOT = [
  /bot/i, /crawler/i, /spider/i, /headless/i, /phantomjs/i, /puppeteer/i,
  /playwright/i, /selenium/i, /curl/i, /wget/i, /python-requests/i, /axios/i,
  /scrapy/i, /http-client/i,
]

const ALASAN = {
  BOT: 'Perangkat terdeteksi sebagai bot atau browser otomatis',
  SINGKAT: 'Durasi tonton terlalu singkat untuk dihitung sebagai penonton asli',
  IP_BERULANG: 'Terlalu banyak tayangan dari sumber jaringan yang sama',
  DUPLIKAT: 'Tayangan berulang dari perangkat yang sama dalam waktu berdekatan',
  LONJAKAN: 'Bagian dari lonjakan tayangan yang tidak wajar',
  TANPA_UA: 'Tayangan tanpa identitas perangkat yang jelas',
}

// ---------------------------------------------------------------------
//  Lapis 1 — pemeriksaan per tayangan
// ---------------------------------------------------------------------

/**
 * Memutuskan satu tayangan valid atau tidak, sebelum baris disimpan.
 * @returns {{valid: boolean, alasan: string|null, skorRisiko: number}}
 */
export function periksaTayangan({ videoId, ipHash, userAgent, durasiTonton, durasiVideo = 30 }) {
  const { durasiMinimalDetik, maksViewPerIp, jendelaUlangMenit } = config.antiFraud
  let risiko = 0

  if (!userAgent || String(userAgent).trim().length < 8) {
    return { valid: false, alasan: ALASAN.TANPA_UA, skorRisiko: 100 }
  }
  if (POLA_BOT.some((p) => p.test(userAgent))) {
    return { valid: false, alasan: ALASAN.BOT, skorRisiko: 100 }
  }

  // Ambang durasi bersifat relatif: video 10 detik tidak adil dinilai dengan
  // ambang yang sama seperti video 60 detik. Minimal 25% durasi video,
  // dengan lantai absolut dari konfigurasi.
  const ambangDurasi = Math.max(durasiMinimalDetik, Math.round(durasiVideo * 0.25))
  if (Number(durasiTonton) < ambangDurasi) {
    return { valid: false, alasan: ALASAN.SINGKAT, skorRisiko: 90 }
  }

  const batasWaktu = new Date(Date.now() - jendelaUlangMenit * 60_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')

  const dariIpIni = db
    .prepare('SELECT COUNT(*) AS n FROM tayangan WHERE video_id = ? AND ip_hash = ? AND waktu >= ?')
    .get(videoId, ipHash, batasWaktu).n

  if (dariIpIni >= maksViewPerIp) {
    return { valid: false, alasan: ALASAN.IP_BERULANG, skorRisiko: 85 }
  }
  if (dariIpIni > 0) risiko += 30

  // Perangkat yang sama persis (IP + user-agent) menonton lagi dalam 10 menit
  // hampir selalu berarti muat ulang halaman, bukan penonton baru.
  const duplikatDekat = db
    .prepare(
      `SELECT COUNT(*) AS n FROM tayangan
       WHERE video_id = ? AND ip_hash = ? AND user_agent = ?
         AND waktu >= datetime('now', '-10 minutes')`,
    )
    .get(videoId, ipHash, userAgent).n

  if (duplikatDekat > 0) {
    return { valid: false, alasan: ALASAN.DUPLIKAT, skorRisiko: 80 }
  }

  return { valid: true, alasan: null, skorRisiko: risiko }
}

// ---------------------------------------------------------------------
//  Lapis 2 — deteksi anomali pada deret waktu
// ---------------------------------------------------------------------

/**
 * Mencari jam-jam dengan volume tayangan yang menyimpang jauh dari perilaku
 * normal kampanye itu sendiri (z-score > ambang), lalu menyaring tayangan
 * pada jam tersebut.
 *
 * Kenapa dibandingkan dengan kampanye itu sendiri, bukan ambang tetap?
 * Karena kampanye dengan target 5.000 view dan 25.000 view punya "normal"
 * yang sangat berbeda. Ambang tetap akan menghukum kampanye besar dan
 * meloloskan kecurangan pada kampanye kecil.
 *
 * Tiga koreksi atas versi awal, yang di simulator menyaring SELURUH 140
 * penonton asli sehingga kreator dibayar Rp0:
 *
 *  1. Yang dihitung hanya tayangan yang lolos lapis 1. Bot yang sudah dibuang
 *     tidak boleh ikut menggelembungkan volume jam itu.
 *  2. "Normal" dihitung tanpa jam yang sedang dinilai (leave-one-out). Kalau
 *     jam lonjakan ikut dirata-rata, ia menaikkan patokannya sendiri.
 *  3. Yang ditahan hanya KELEBIHAN di atas batas wajar, bukan seluruh jam.
 *     Konten yang benar-benar viral tetap dibayar untuk volume wajarnya; sisa
 *     lonjakan ditahan dengan alasan LONJAKAN dan bisa dipulihkan lewat
 *     banding sengketa (batalkanPenyaringan). Tayangan terbaru yang ditahan
 *     lebih dulu, karena merekalah yang membuat jam itu melampaui batas.
 *
 * Idempoten: tayangan yang sudah ditahan ikut dihitung sebagai kelebihan,
 * jadi menjalankannya berulang tidak menahan lebih banyak.
 *
 * @returns {{jamAnomali: object[], tayanganDisaring: number}}
 */
export function deteksiAnomali(kampanyeId, { terapkan = true } = {}) {
  const perJam = db
    .prepare(
      `SELECT strftime('%Y-%m-%d %H', waktu) AS jam,
              SUM(CASE WHEN valid = 1 OR alasan = ? THEN 1 ELSE 0 END) AS jumlah,
              -- Termasuk yang sudah dipulihkan admin (valid = 1, alasan tetap):
              -- kelebihan itu sudah diputuskan, jangan ditagih lagi ke tayangan lain.
              SUM(CASE WHEN alasan = ? THEN 1 ELSE 0 END) AS ditahan
       FROM tayangan
       WHERE kampanye_id = ?
       GROUP BY jam
       ORDER BY jam`,
    )
    .all(ALASAN.LONJAKAN, ALASAN.LONJAKAN, kampanyeId)

  // Butuh minimal beberapa titik data sebelum bicara "normal".
  if (perJam.length < 4) return { jamAnomali: [], tayanganDisaring: 0, catatan: 'Data belum cukup untuk analisis anomali.' }

  const ambang = config.antiFraud.ambangZScore
  const jamAnomali = []
  for (let i = 0; i < perJam.length; i++) {
    const lain = perJam.filter((_, j) => j !== i).map((r) => r.jumlah)
    const m = rerata(lain)
    const sd = simpanganBaku(lain)
    const r = perJam[i]
    // sd nol (trafik jam lain persis sama) tidak boleh membuat z tak hingga;
    // lantai 1 menjaga syarat "lebih dari dua kali normal" tetap menentukan.
    const z = (r.jumlah - m) / Math.max(sd, 1)
    if (z > ambang && r.jumlah > m * 2) {
      const batasWajar = Math.max(Math.ceil(m + ambang * sd), 1)
      jamAnomali.push({ ...r, z, m, batasWajar, kelebihan: r.jumlah - batasWajar })
    }
  }

  let disaring = 0
  if (terapkan) {
    const tandai = db.prepare(
      `UPDATE tayangan SET valid = 0, alasan = ?
       WHERE id IN (
         SELECT id FROM tayangan
         WHERE kampanye_id = ? AND strftime('%Y-%m-%d %H', waktu) = ?
           AND valid = 1 AND dibayar = 0 AND dipulihkan = 0
         ORDER BY waktu DESC, id DESC
         LIMIT ?
       )`,
    )
    for (const jam of jamAnomali) {
      const perluDitahan = jam.kelebihan - jam.ditahan
      if (perluDitahan > 0) disaring += tandai.run(ALASAN.LONJAKAN, kampanyeId, jam.jam, perluDitahan).changes
    }
  }

  const semua = perJam.map((r) => r.jumlah)
  return {
    jamAnomali: jamAnomali.map((r) => ({
      jam: r.jam,
      jumlah: r.jumlah,
      zScore: Number(r.z.toFixed(2)),
      rerataNormal: Math.round(r.m),
      batasWajar: r.batasWajar,
    })),
    tayanganDisaring: disaring,
    rerataPerJam: Math.round(rerata(semua)),
    simpanganBaku: Number(simpanganBaku(semua).toFixed(2)),
  }
}

// ---------------------------------------------------------------------
//  Laporan
// ---------------------------------------------------------------------

/** Ringkasan hasil penyaringan untuk dasbor laporan dan halaman sengketa. */
export function laporanAntiFraud(kampanyeId) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM tayangan WHERE kampanye_id = ?').get(kampanyeId).n
  const valid = db
    .prepare('SELECT COUNT(*) AS n FROM tayangan WHERE kampanye_id = ? AND valid = 1')
    .get(kampanyeId).n

  const perAlasan = db
    .prepare(
      `SELECT alasan, COUNT(*) AS jumlah
       FROM tayangan WHERE kampanye_id = ? AND valid = 0
       GROUP BY alasan ORDER BY jumlah DESC`,
    )
    .all(kampanyeId)

  const disaring = total - valid
  return {
    totalTayangan: total,
    tervalidasi: valid,
    disaring,
    persenDisaring: total ? Number(((disaring / total) * 100).toFixed(1)) : 0,
    rincian: perAlasan.map((r) => ({ alasan: r.alasan, jumlah: r.jumlah })),
  }
}

/**
 * Membuka kembali tayangan yang tersaring untuk satu kampanye — dipakai saat
 * sengketa diputuskan berpihak pada kreator (mekanisme banding, PRD §15).
 *
 * Kolom `alasan` sengaja DIPERTAHANKAN, tidak dikosongkan seperti versi
 * sebelumnya. Baris inilah satu-satunya data berlabel yang dimiliki sistem
 * ini: "aturan X menyaring tayangan ini, dan seorang manusia memutuskan itu
 * keliru." Menghapusnya berarti membuang satu-satunya cara mengetahui aturan
 * mana yang terlalu galak. Yang membedakannya dari tayangan tersaring adalah
 * `valid = 1` dan `dipulihkan = 1`; seluruh kueri laporan menyaring
 * `valid = 0`, jadi baris ini tidak akan terhitung dua kali.
 */
export function batalkanPenyaringan(kampanyeId, alasanTertentu) {
  const hasil = db
    .prepare(
      `UPDATE tayangan SET valid = 1, dipulihkan = 1
       WHERE kampanye_id = ? AND valid = 0 AND alasan = ? AND dibayar = 0`,
    )
    .run(kampanyeId, alasanTertentu)
  return { dipulihkan: hasil.changes }
}

/**
 * Seberapa sering tiap aturan penyaringan ternyata salah.
 *
 * Angka yang dicari adalah tingkat salah-saring per alasan: dari semua
 * tayangan yang pernah disaring dengan alasan itu, berapa persen yang
 * akhirnya dipulihkan admin lewat sengketa. Aturan dengan angka tinggi
 * berarti ambangnya terlalu ketat dan menghukum penonton sungguhan.
 *
 * Ini bukan model yang belajar sendiri — ini alat ukur yang membuat
 * penyetelan ambang di config.antiFraud berdasarkan bukti, bukan tebakan.
 */
export function laporanKetepatanPenyaringan() {
  const baris = db
    .prepare(
      `SELECT alasan,
              COUNT(*)                              AS totalDisaring,
              SUM(CASE WHEN dipulihkan = 1 THEN 1 ELSE 0 END) AS dipulihkan
       FROM tayangan
       WHERE alasan IS NOT NULL
       GROUP BY alasan
       ORDER BY totalDisaring DESC`,
    )
    .all()

  return baris.map((r) => ({
    alasan: r.alasan,
    totalDisaring: r.totalDisaring,
    dipulihkan: r.dipulihkan,
    persenSalah: r.totalDisaring ? Number(((r.dipulihkan / r.totalDisaring) * 100).toFixed(1)) : 0,
  }))
}

export const ALASAN_ANTIFRAUD = ALASAN
