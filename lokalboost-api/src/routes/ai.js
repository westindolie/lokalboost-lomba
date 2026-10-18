import { Router } from 'express'
import { db } from '../lib/db.js'
import { wajibLogin, wajibPeran } from '../lib/auth.js'
import { batasLaju } from '../lib/batas.js'
import { bungkus, galat404, wajibAda } from '../lib/util.js'
import {
  aiAktif,
  buatBriefDariReferensi,
  buatNaskah,
  buatSubtitle,
  penyediaAi,
  ringkasLaporan,
  transkripsiAktif,
} from '../services/ai.js'
import { ambilBanyakReferensi } from '../services/referensi-konten.js'
import { referensiKampanye } from './kampanye.js'
import { BOBOT_MATCHMAKER } from '../services/matchmaker.js'
import { LABEL_SUMBER } from '../services/portofolio.js'
import { ALASAN_ANTIFRAUD } from '../services/antifraud.js'
import { statistikKampanye } from '../services/laporan.js'
import { periksaReferensi } from '../services/moderasi-kampanye.js'
import { GalatHttp } from '../lib/util.js'

export const rutaAi = Router()

/**
 * GET /api/ai/status
 * Transparansi ke antarmuka: fitur AI mana yang berjalan dengan model bahasa
 * dan mana yang berbasis algoritma. Halaman AI di frontend bisa menampilkan
 * badge yang jujur alih-alih mengklaim semuanya "AI".
 */
rutaAi.get('/status', (_req, res) => {
  // Diambil dari penyedia yang benar-benar dipakai. Sebelumnya selalu
  // melaporkan model Anthropic, jadi saat OpenRouter yang aktif halaman AI
  // memajang nama model yang tidak pernah menjawab apa pun.
  const penyedia = penyediaAi()
  res.json({
    modelBahasaAktif: aiAktif(),
    penyedia: penyedia?.nama || null,
    model: penyedia?.model || null,
    fitur: {
      smartMatchmaker: { jenis: 'algoritma', keterangan: 'Skoring berbobot, hasil bisa dijelaskan per komponen', bobot: BOBOT_MATCHMAKER },
      antiFraud: { jenis: 'algoritma', keterangan: 'Aturan per tayangan + deteksi anomali z-score', alasanPenyaringan: Object.values(ALASAN_ANTIFRAUD) },
      scriptGenerator: { jenis: aiAktif() ? 'model bahasa' : 'template', keterangan: 'Naskah video, ide konten, dan ajakan dari brief kampanye' },
      briefDariReferensi: { jenis: aiAktif() ? 'model bahasa' : 'template', keterangan: 'Brief kampanye dari video TikTok/Instagram/YouTube acuan UMKM' },
      autoReportSummary: { jenis: aiAktif() ? 'model bahasa' : 'template', keterangan: 'Ringkasan hasil 3-5 kalimat bahasa sederhana' },
      autoSubtitle: transkripsiAktif()
        ? { jenis: 'model bahasa', keterangan: 'Gemini mentranskrip suara video dan menilai kualitas suaranya' }
        : { jenis: 'algoritma', keterangan: 'Segmentasi naskah menjadi subtitle bertimestamp' },
      // Sengaja dilaporkan 'algoritma', bukan 'model bahasa'. Ringkasannya
      // dirakit template deterministik supaya portofolio tetap terbit di
      // produksi tempat AI generatif dimatikan.
      portfolioAutoBuilder: {
        jenis: 'algoritma',
        keterangan: 'Portofolio kreator dirakit dari tiga lapis yang label asal-usulnya dibedakan',
        lapis: Object.entries(LABEL_SUMBER).map(([sumber, label]) => ({ sumber, label })),
      },
    },
  })
})

/**
 * POST /api/ai/naskah
 * AI Script & Content Generator. Naskah selalu disusun dari brief kampanye
 * yang diisi UMKM, jadi hasilnya relevan meski sedang jatuh ke template.
 *
 * Dibatasi per kreator: tiap panggilan memakan kuota Gemini milik server,
 * dan tombol "buat ulang" yang ditekan beruntun cukup untuk menghabiskannya.
 */
rutaAi.post(
  '/naskah',
  wajibPeran('kreator'),
  batasLaju({
    maks: 10,
    detik: 60,
    kunci: (req) => req.pengguna?.id && `naskah:${req.pengguna.id}`,
    pesan: 'Terlalu banyak permintaan naskah. Tunggu sebentar lalu coba lagi.',
  }),
  bungkus(async (req, res) => {
    const { kampanyeId } = wajibAda(req.body, ['kampanyeId'])
    const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
    if (!kampanye) throw galat404('Kampanye tidak ditemukan.')

    const brief = db
      .prepare('SELECT isi FROM kampanye_brief WHERE kampanye_id = ? ORDER BY urutan, id')
      .all(kampanyeId)
      .map((b) => b.isi)

    const naskah = await buatNaskah(kampanye, brief, {
      gaya: req.body?.gaya,
      referensi: referensiKampanye(kampanyeId),
    })

    if (req.body?.simpan !== false) {
      db.prepare(
        `INSERT INTO naskah_ai (kreator_id, kampanye_id, sumber, judul, isi)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(req.pengguna.id, kampanyeId, naskah.sumber, naskah.judul, JSON.stringify(naskah))
    }

    res.json({ naskah })
  }),
)

/**
 * POST /api/ai/brief-referensi
 * UMKM menempel 1-3 tautan video TikTok/Instagram/YouTube yang gayanya ingin
 * ditiru. Server membaca isinya (services/referensi-konten.js) lalu menyusun
 * draf brief. Tidak menyimpan apa pun: brief dan referensi baru tersimpan
 * saat kampanye dibuat, setelah UMKM menyuntingnya.
 *
 * Dibatasi ketat karena tiap tautan bisa memakai 1 kredit ScrapeCreators
 * ditambah satu panggilan model bahasa.
 */
rutaAi.post(
  '/brief-referensi',
  wajibPeran('umkm'),
  batasLaju({
    maks: 6,
    detik: 600,
    kunci: (req) => req.pengguna?.id && `brief-referensi:${req.pengguna.id}`,
    pesan: 'Terlalu sering membaca referensi. Tunggu beberapa menit lalu coba lagi.',
  }),
  bungkus(async (req, res) => {
    const b = req.body || {}
    const dibaca = await periksaReferensi(await ambilBanyakReferensi(b.tautan))
    // Referensi yang menyerang pihak lain tidak dipakai menyusun brief dan
    // tidak boleh disimpan bersama kampanye (antarmuka membuangnya).
    const referensi = dibaca.map((r) => ({ ...r, ditolakEtika: r.etika.status === 'ditolak' }))
    const layak = referensi.filter((r) => !r.ditolakEtika)
    if (!layak.length) {
      throw new GalatHttp(
        422,
        'Video referensi ini menyerang atau menjelekkan pihak lain, jadi tidak bisa dijadikan acuan. Pilih video yang hanya mempromosikan produknya sendiri.',
        { referensi },
      )
    }
    const potong = (s, n) => String(s || '').slice(0, n)
    const brief = await buatBriefDariReferensi(
      {
        nama: potong(b.nama, 120),
        kategori: potong(b.kategori, 60),
        lokasi: potong(b.lokasi, 120),
        deskripsi: potong(b.deskripsi, 1500),
      },
      layak,
    )
    res.json({ referensi, brief })
  }),
)

/** GET /api/ai/naskah — riwayat naskah yang pernah dibuat kreator ini. */
rutaAi.get(
  '/naskah',
  wajibPeran('kreator'),
  bungkus((req, res) => {
    const daftar = db
      .prepare('SELECT * FROM naskah_ai WHERE kreator_id = ? ORDER BY dibuat_pada DESC LIMIT 30')
      .all(req.pengguna.id)

    res.json({
      naskah: daftar.map((n) => ({
        id: n.id,
        kampanyeId: n.kampanye_id,
        judul: n.judul,
        sumber: n.sumber,
        isi: JSON.parse(n.isi),
        dibuatPada: n.dibuat_pada,
      })),
    })
  }),
)

/**
 * POST /api/ai/ringkasan-laporan
 * AI Auto-Report Summary untuk kampanye tertentu. Endpoint terpisah dari
 * /api/kampanye/:id/ringkasan-ai agar bisa dipanggil ulang tanpa memuat
 * ulang seluruh dasbor.
 */
rutaAi.post(
  '/ringkasan-laporan',
  wajibLogin,
  bungkus(async (req, res) => {
    const { kampanyeId } = wajibAda(req.body, ['kampanyeId'])
    const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
    if (!kampanye) throw galat404('Kampanye tidak ditemukan.')

    const stat = statistikKampanye(kampanyeId)
    const ringkasan = await ringkasLaporan(kampanye, stat)
    res.json({ ringkasan })
  }),
)

/** POST /api/ai/subtitle — segmentasi naskah menjadi subtitle bertimestamp. */
rutaAi.post(
  '/subtitle',
  wajibLogin,
  bungkus((req, res) => {
    const { naskah } = wajibAda(req.body, ['naskah'])
    res.json({ subtitle: buatSubtitle({ naskah, durasiDetik: Number(req.body?.durasiDetik) || 30 }) })
  }),
)
