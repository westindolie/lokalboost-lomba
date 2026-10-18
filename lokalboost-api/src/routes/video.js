import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '../lib/db.js'
import { config } from '../config.js'
import { wajibLogin, wajibPeran } from '../lib/auth.js'
import { bungkus, buatId, galat400, galat403, galat404, galat409, sekarang, wajibAda } from '../lib/util.js'
import { pastikanTeks } from '../lib/validasi.js'
import { BATAS_TRANSKRIP_BYTE, prosesSuaraVideo } from '../services/ai.js'
import { kirimNotifikasi } from '../services/notifikasi.js'
import { periksaBagian } from '../services/moderasi-kampanye.js'
import { bacaVideo, hapusVideo, jenisVideo, simpanVideo, tautanVideo } from '../lib/penyimpanan-video.js'
import { adalahPeserta } from '../services/reward.js'
import { prosesPembayaran } from '../services/escrow.js'
import {
  akuiViewsTertahan,
  batasWajar,
  perbaruiViewsVideo,
  putuskanKecocokan,
  setorTautanVideo,
} from '../services/video-tautan.js'
import { batasLaju } from '../lib/batas.js'

export const rutaVideo = Router()

fs.mkdirSync(config.folderUnggahan, { recursive: true })

/**
 * Ekstensi yang boleh tersimpan di disk. Daftar ini bukan sekadar kenyamanan:
 * `express.static` menentukan Content-Type dari ekstensi berkas, jadi apa pun
 * yang lolos ke sini menentukan bagaimana peramban memperlakukannya nanti.
 * Sebuah berkas .html yang lolos akan dilayani sebagai text/html dari origin
 * yang sama dengan aplikasi — artinya script di dalamnya bisa membaca
 * localStorage, tempat token JWT disimpan.
 */
const EKSTENSI_DIIZINKAN = new Set(['.mp4', '.mov', '.webm', '.m4v'])

const penyimpanan = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.folderUnggahan),
  // Ekstensi diambil dari daftar putih, bukan dari nama berkas kiriman. Nama
  // asli sepenuhnya dikendalikan pengunggah dan tidak pernah dipercaya.
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const aman = EKSTENSI_DIIZINKAN.has(ext) ? ext : '.mp4'
    cb(null, `${buatId('vid')}${aman}`)
  },
})

const unggah = multer({
  storage: penyimpanan,
  limits: { fileSize: config.batasUnggahMb * 1024 * 1024 }, // bawaan 200 MB — cukup untuk video HP 60 detik
  fileFilter: (_req, file, cb) => {
    // Dua syarat, bukan satu. `mimetype` datang dari klien dan bisa dikarang:
    // berkas teks yang mengaku 'video/mp4' dulu lolos ke sini tanpa hambatan.
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (!file.mimetype.startsWith('video/') || !EKSTENSI_DIIZINKAN.has(ext)) {
      // Dilempar sebagai GalatHttp, bukan Error biasa — penanganan galat
      // terpusat hanya mengenali GalatHttp dan MulterError; Error polos
      // jatuh ke cabang terakhir dan muncul sebagai 500 "kesalahan server",
      // yang menyembunyikan alasan sebenarnya dari pengguna.
      return cb(galat400('Berkas harus berupa video dengan ekstensi .mp4, .mov, .webm, atau .m4v.'))
    }
    cb(null, true)
  },
})

function bentukVideo(v) {
  if (!v) return null
  return {
    id: v.id,
    kampanyeId: v.kampanye_id,
    kreatorId: v.kreator_id,
    kreator: db.prepare('SELECT nama FROM pengguna WHERE id = ?').get(v.kreator_id)?.nama || null,
    judul: v.judul,
    berkas: tautanVideo(v.berkas),
    durasiDetik: v.durasi_detik,
    status: v.status,
    moderasi: v.moderasi,
    catatanModerasi: v.catatan_moderasi,
    etika: v.etika_hasil ? JSON.parse(v.etika_hasil) : null,
    // Video tautan: views dari platform + hasil pemeriksaan kecocokan AI.
    sumber: v.sumber || 'unggah',
    url: v.url || null,
    platform: v.platform || null,
    akunPenulis: v.akun_penulis || null,
    viewsAwal: v.views_awal,
    viewsPlatform: v.views_platform,
    viewsDiakui: v.views_diakui || 0,
    viewsTertahan: v.views_tertahan || 0,
    viewsDiukurPada: v.views_diukur_pada,
    batasWajar: v.sumber === 'tautan' ? batasWajar(v) : null,
    kecocokan: v.kecocokan || null,
    kecocokanHasil: v.kecocokan_hasil ? JSON.parse(v.kecocokan_hasil) : null,
    subtitle: v.subtitle ? JSON.parse(v.subtitle) : null,
    catatanAudio: v.catatan_audio ? JSON.parse(v.catatan_audio) : null,
    dibuatPada: v.dibuat_pada,
    tayangan: db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN valid = 1 THEN 1 ELSE 0 END) AS tervalidasi
         FROM tayangan WHERE video_id = ?`,
      )
      .get(v.id),
  }
}

/**
 * POST /api/video
 * Unggah video promosi. Berkas bersifat opsional supaya alur prototype
 * (dan tes otomatis) tetap bisa berjalan tanpa file besar — kalau hanya
 * metadata yang dikirim, videonya dianggap tertaut dari platform lain.
 */
rutaVideo.post(
  '/',
  wajibPeran('kreator'),
  unggah.single('berkas'),
  bungkus(async (req, res) => {
    const b = wajibAda(req.body, ['kampanyeId', 'judul'])
    const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(b.kampanyeId)
    if (!kampanye) throw galat404('Kampanye tidak ditemukan.')
    if (!adalahPeserta(kampanye.id, req.pengguna.id)) {
      throw galat403('Anda belum bergabung di kampanye ini.')
    }
    if (kampanye.status === 'selesai') throw galat409('Kampanye ini sudah selesai.')

    const id = buatId('vid')
    const durasi = Number(b.durasiDetik) || 30
    const rujukan = await simpanVideo(req.file)

    db.prepare(
      `INSERT INTO video (id, kampanye_id, kreator_id, judul, berkas, durasi_detik, status)
       VALUES (?, ?, ?, ?, ?, ?, 'diproses')`,
    ).run(id, kampanye.id, req.pengguna.id, b.judul, rujukan, durasi)

    kirimNotifikasi(kampanye.umkm_id, {
      jenis: 'kampanye',
      judul: 'Video promosi sudah diunggah',
      isi: `${req.pengguna.nama} mengunggah "${b.judul}" untuk kampanye "${kampanye.nama}".`,
      tautan: `/umkm/kampanye/${kampanye.id}/laporan`,
    })

    res.status(201).json({
      pesan: 'Video diterima. AI sedang memproses subtitle dan membersihkan suara.',
      video: bentukVideo(db.prepare('SELECT * FROM video WHERE id = ?').get(id)),
    })
  }),
)

/**
 * POST /api/video/tautan  Body: { kampanyeId, url, judul? }
 * Kreator yang sudah diterima di kampanye menyetor tautan videonya
 * (services/video-tautan.js). Video dibaca dari platform, kepemilikan akun
 * dicek, lalu AI mencocokkan isinya dengan brief.
 */
rutaVideo.post(
  '/tautan',
  wajibPeran('kreator'),
  batasLaju({
    maks: 10,
    detik: 600,
    kunci: (req) => req.pengguna?.id && `setor-tautan:${req.pengguna.id}`,
    pesan: 'Terlalu banyak tautan disetor. Tunggu beberapa menit lalu coba lagi.',
  }),
  bungkus(async (req, res) => {
    const b = wajibAda(req.body, ['kampanyeId', 'url'])
    const judul = b.judul ? pastikanTeks(b.judul, 'Judul video', { min: 3, maks: 120 }) : null
    const v = await setorTautanVideo({ kampanyeId: b.kampanyeId, kreator: req.pengguna, url: b.url, judul })
    const pembayaran = config.modeDemo && v.status === 'tayang' ? prosesPembayaran(v.kampanye_id) : null
    const pesan = config.modeDemo && v.status === 'tayang'
      ? pembayaran?.penutupan
        ? 'Video TikTok terbaca dan terverifikasi. Target tercapai, reward demo langsung masuk ke saldo kreator.'
        : 'Video TikTok terbaca dan terverifikasi. Views aktual dihitung dan reward demo diproses otomatis.'
      : v.status === 'tayang'
        ? 'Video sesuai kampanye. Views-nya mulai dihitung dari sekarang.'
        : v.status === 'diproses'
          ? 'Video tersimpan. AI belum yakin videonya sesuai, pemilik usaha akan meninjau.'
          : config.modeDemo && v.kecocokan === 'tinjau'
            ? 'AI belum bisa memastikan produk yang terlihat cocok dengan kampanye. Video tidak disetujui otomatis dan reward belum cair.'
          : v.moderasi === 'revisi'
            ? 'Video ditahan: isinya menyinggung usaha lain.'
            : 'Video dinilai tidak sesuai kampanye. Setor video lain yang mengikuti brief.'
    const videoTerbaru = db.prepare('SELECT * FROM video WHERE id = ?').get(v.id)
    res.status(201).json({ pesan, video: bentukVideo(videoTerbaru), pembayaran, modeDemo: config.modeDemo })
  }),
)

/** POST /api/video/:id/perbarui-views — ambil views terbaru dari platform, lalu hitung reward. */
rutaVideo.post(
  '/:id/perbarui-views',
  wajibLogin,
  bungkus(async (req, res) => {
    const v = db.prepare('SELECT * FROM video WHERE id = ?').get(req.params.id)
    if (!v) throw galat404('Video tidak ditemukan.')
    const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(v.kampanye_id)
    const admin = req.pengguna.peran === 'admin'
    if (!admin && v.kreator_id !== req.pengguna.id && k?.umkm_id !== req.pengguna.id) throw galat403()
    const baru = await perbaruiViewsVideo(v, { paksa: admin })
    if (k?.status === 'berjalan') prosesPembayaran(k.id)
    res.json({ pesan: 'Views diperbarui dari platform.', video: bentukVideo(db.prepare('SELECT * FROM video WHERE id = ?').get(baru.id)) })
  }),
)

/** POST /api/video/:id/kecocokan  Body: { setujui, alasan? } — keputusan pemilik usaha. */
rutaVideo.post(
  '/:id/kecocokan',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const v = db.prepare('SELECT * FROM video WHERE id = ?').get(req.params.id)
    if (!v) throw galat404('Video tidak ditemukan.')
    const setujui = req.body?.setujui === true
    const alasan = req.body?.alasan ? pastikanTeks(req.body.alasan, 'Catatan', { min: 5, maks: 300 }) : null
    if (!setujui && !alasan) throw galat400('Tulis catatan singkat supaya kreator tahu apa yang perlu diperbaiki.')
    const baru = putuskanKecocokan({ video: v, umkmId: req.pengguna.id, setujui, alasan })
    if (setujui) prosesPembayaran(v.kampanye_id)
    res.json({
      pesan: setujui ? 'Video disetujui. Views-nya dihitung untuk reward.' : 'Video ditandai tidak sesuai.',
      video: bentukVideo(baru),
    })
  }),
)

/** POST /api/video/:id/akui-views — admin mengakui kenaikan views yang ditahan. */
rutaVideo.post(
  '/:id/akui-views',
  wajibPeran('admin'),
  bungkus((req, res) => {
    const v = db.prepare('SELECT * FROM video WHERE id = ?').get(req.params.id)
    if (!v) throw galat404('Video tidak ditemukan.')
    const baru = akuiViewsTertahan(v)
    const k = db.prepare('SELECT status FROM kampanye WHERE id = ?').get(v.kampanye_id)
    if (k?.status === 'berjalan') prosesPembayaran(v.kampanye_id)
    res.json({ pesan: 'Kenaikan views diakui dan ikut dihitung.', video: bentukVideo(baru) })
  }),
)

/**
 * Boleh melihat video yang belum lolos moderasi? Hanya kreatornya, UMKM
 * pemilik kampanyenya, dan admin. Dulu siapa pun bisa, termasuk video yang
 * sedang diminta revisi, padahal moderasi justru dibuat untuk menahannya.
 */
function bolehLihatSemua(pengguna, video) {
  if (!pengguna) return false
  if (pengguna.peran === 'admin' || video.kreator_id === pengguna.id) return true
  const k = db.prepare('SELECT umkm_id FROM kampanye WHERE id = ?').get(video.kampanye_id)
  return k?.umkm_id === pengguna.id
}
const tampakPublik = (v) => v.moderasi === 'lolos' && v.status === 'tayang'

/** GET /api/video?kampanyeId=... */
rutaVideo.get(
  '/',
  bungkus((req, res) => {
    const { kampanyeId, kreatorId } = req.query
    const syarat = []
    const nilai = []
    if (kampanyeId) {
      syarat.push('kampanye_id = ?')
      nilai.push(kampanyeId)
    }
    if (kreatorId) {
      syarat.push('kreator_id = ?')
      nilai.push(kreatorId)
    }
    const where = syarat.length ? `WHERE ${syarat.join(' AND ')}` : ''
    const daftar = db
      .prepare(`SELECT * FROM video ${where} ORDER BY dibuat_pada DESC`)
      .all(...nilai)
      .filter((v) => tampakPublik(v) || bolehLihatSemua(req.pengguna, v))
    res.json({ video: daftar.map(bentukVideo) })
  }),
)

/** GET /api/video/:id */
rutaVideo.get(
  '/:id',
  bungkus((req, res) => {
    const v = db.prepare('SELECT * FROM video WHERE id = ?').get(req.params.id)
    // 404, bukan 403: keberadaan video yang ditahan moderasi pun tidak dibuka.
    if (!v || (!tampakPublik(v) && !bolehLihatSemua(req.pengguna, v))) throw galat404('Video tidak ditemukan.')
    res.json({ video: bentukVideo(v) })
  }),
)

/**
 * POST /api/video/:id/proses
 * AI Auto-Subtitle & Pemeriksa Suara. Gemini mendengarkan video aslinya,
 * menuliskan ucapannya jadi subtitle bertimestamp, dan menilai kualitas
 * suaranya. Naskah dari klien (hasil Script Generator) hanya dipakai sebagai
 * rujukan ejaan, dan menjadi cadangan subtitle bila transkripsi tidak jalan.
 */
rutaVideo.post(
  '/:id/proses',
  wajibPeran('kreator', 'admin'),
  bungkus(async (req, res) => {
    const v = db.prepare('SELECT * FROM video WHERE id = ?').get(req.params.id)
    if (!v) throw galat404('Video tidak ditemukan.')
    if (v.kreator_id !== req.pengguna.id && req.pengguna.peran !== 'admin') throw galat403()

    // Video yang tidak terbaca bukan alasan menggagalkan proses: sebabnya
    // diteruskan supaya subtitle cadangan bisa menyebutnya.
    let isi = null
    let alasanTanpaVideo
    try {
      isi = await bacaVideo(v.berkas, BATAS_TRANSKRIP_BYTE)
    } catch (e) {
      alasanTanpaVideo = e.message
    }

    const { subtitle, audio } = await prosesSuaraVideo({
      isi,
      mimeType: jenisVideo(v.berkas),
      durasiDetik: v.durasi_detik,
      naskah: req.body?.naskah,
      alasanTanpaVideo,
    })

    // Gerbang etika untuk ucapan kreator: UMKM bisa menulis brief yang bersih,
    // lalu kreator mengucapkan tuduhan ke usaha lain di videonya. Yang diperiksa
    // judul + semua kalimat subtitle (transkrip suara bila Gemini jalan, naskah
    // tempelan bila tidak). Hasil tidak pernah MELOLOSKAN otomatis: hanya
    // "menolak" (jadi revisi) atau menandai untuk admin, yang tetap pemutus akhir.
    const etika = await periksaBagian([
      { asal: 'Judul video', teks: v.judul },
      ...(subtitle.segmen || []).map((g, i) => ({ asal: `Ucapan ${g.mulai || i + 1}`, teks: g.teks })),
    ])
    etika.ucapanTerperiksa = subtitle.sumber === 'gemini'
    // Putusan manusia (admin atau pemilik usaha) bertahan walau video diproses ulang.
    const lama = v.etika_hasil ? JSON.parse(v.etika_hasil) : {}
    if (lama.keputusanAdmin) etika.keputusanAdmin = lama.keputusanAdmin
    if (lama.keputusanUmkm) etika.keputusanUmkm = lama.keputusanUmkm
    const ditolakEtika = etika.status === 'ditolak' && v.moderasi !== 'lolos'

    db.prepare(
      `UPDATE video SET subtitle = ?, catatan_audio = ?, status = ?, etika_hasil = ?,
              moderasi = ?, catatan_moderasi = ? WHERE id = ?`,
    ).run(
      JSON.stringify(subtitle),
      JSON.stringify(audio),
      ditolakEtika ? 'ditolak' : 'tayang',
      JSON.stringify(etika),
      ditolakEtika ? 'revisi' : v.moderasi,
      ditolakEtika
        ? `Otomatis: video menjelekkan usaha lain. ${etika.alasan} ${etika.saran}`.trim()
        : v.catatan_moderasi,
      v.id,
    )

    const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(v.kampanye_id)
    kirimNotifikasi(v.kreator_id, {
      jenis: ditolakEtika ? 'kampanye' : 'ai',
      judul: ditolakEtika ? 'Video perlu direvisi' : 'Video selesai diproses',
      isi: ditolakEtika
        ? `"${v.judul}" menyinggung usaha lain sehingga tidak bisa tayang. ${etika.saran || ''}`.trim()
        : `Subtitle otomatis dan pemeriksaan suara untuk "${v.judul}" sudah selesai. Video siap tayang.`,
      tautan: `/kampanye/${kampanye.id}`,
      email: ditolakEtika,
    })

    res.json({
      pesan: ditolakEtika
        ? 'Video ditahan: isinya menyinggung usaha lain. Ubah ucapannya lalu unggah ulang.'
        : 'Pemrosesan AI selesai.',
      video: bentukVideo(db.prepare('SELECT * FROM video WHERE id = ?').get(v.id)),
    })
  }),
)

/**
 * POST /api/video/:id/setujui-umkm  Body: { alasan }
 *
 * Penahanan otomatis bisa keliru: AI membaca "kedai sebelah" padahal itu
 * cabang sendiri, atau menganggap candaan sebagai tuduhan. Pemilik kampanye
 * yang sudah menonton videonya boleh membatalkan penahanan itu, dan sejak itu
 * tayangannya dihitung dan kreatornya dibayar lewat Rekber seperti biasa.
 *
 * Syaratnya sempit supaya tidak jadi jalan pintas:
 *   - hanya video yang DITAHAN OTOMATIS (bukan revisi dari admin; putusan
 *     admin mengikat dan hanya admin yang bisa mencabutnya);
 *   - alasan wajib, dan dicatat bersama waktunya;
 *   - admin tetap bisa menurunkan video itu kapan pun sesudahnya.
 */
rutaVideo.post(
  '/:id/setujui-umkm',
  wajibPeran('umkm'),
  bungkus((req, res) => {
    const v = db.prepare('SELECT * FROM video WHERE id = ?').get(req.params.id)
    if (!v) throw galat404('Video tidak ditemukan.')
    const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(v.kampanye_id)
    if (!kampanye || kampanye.umkm_id !== req.pengguna.id) throw galat403()
    if (kampanye.status === 'selesai') throw galat409('Kampanye ini sudah selesai.')

    const etika = v.etika_hasil ? JSON.parse(v.etika_hasil) : null
    if (v.moderasi !== 'revisi' || etika?.status !== 'ditolak') {
      throw galat409('Hanya video yang ditahan otomatis oleh pemeriksaan etika yang bisa Anda setujui.')
    }
    if (etika.keputusanAdmin) {
      throw galat409('Video ini sudah diputus admin LokalBoost. Hanya admin yang bisa mengubahnya.')
    }
    const alasan = pastikanTeks(req.body?.alasan, 'Alasan persetujuan', { min: 10, maks: 500 })

    const baru = { ...etika, keputusanUmkm: { alasan, oleh: req.pengguna.id, pada: sekarang() } }
    db.prepare(
      `UPDATE video SET moderasi = 'lolos', status = 'tayang', etika_hasil = ?,
              catatan_moderasi = ? WHERE id = ?`,
    ).run(JSON.stringify(baru), `Disetujui pemilik usaha setelah menonton: ${alasan}`, v.id)

    kirimNotifikasi(v.kreator_id, {
      jenis: 'kampanye',
      judul: 'Video Anda disetujui pemilik usaha',
      isi: `"${v.judul}" sudah boleh tayang. Tayangan yang sah mulai dibayar.`,
      tautan: `/kampanye/${kampanye.id}`,
      email: true,
    })
    res.json({
      pesan: 'Video disetujui. Tayangannya sekarang dihitung dan kreator dibayar lewat Rekber.',
      video: bentukVideo(db.prepare('SELECT * FROM video WHERE id = ?').get(v.id)),
    })
  }),
)

/** DELETE /api/video/:id — hanya selama belum ada tayangan tercatat. */
rutaVideo.delete(
  '/:id',
  wajibLogin,
  bungkus(async (req, res) => {
    const v = db.prepare('SELECT * FROM video WHERE id = ?').get(req.params.id)
    if (!v) throw galat404('Video tidak ditemukan.')
    if (v.kreator_id !== req.pengguna.id && req.pengguna.peran !== 'admin') throw galat403()

    const jumlah = db.prepare('SELECT COUNT(*) AS n FROM tayangan WHERE video_id = ?').get(v.id).n
    if (jumlah > 0) throw galat400('Video yang sudah punya tayangan tidak bisa dihapus.')

    await hapusVideo(v.berkas)
    db.prepare('DELETE FROM video WHERE id = ?').run(v.id)
    res.json({ pesan: 'Video dihapus.' })
  }),
)
